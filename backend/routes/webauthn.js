/**
 * WebAuthn Routes - Passkey Registration
 */
const express = require('express');
const crypto = require('crypto');
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { hashToken } = require('../utils/token');

const router = express.Router();

// RP ID should be your domain (e.g. localhost or geoqr.com)
const rpName = 'GeoQR Attendance';

// Helper: Determine RP ID and Origin dynamically
function getDynamicConfig(req) {
    // 1. Determine Origin (where the frontend is)
    let clientOrigin = req.get('Origin') || req.get('Referer');

    // If it's a Referer, strip the path
    if (clientOrigin && !clientOrigin.startsWith('http')) {
        // Handle cases where it might not be a full URL
    } else if (clientOrigin) {
        try {
            const refUrl = new URL(clientOrigin);
            clientOrigin = `${refUrl.protocol}//${refUrl.host}`;
        } catch (e) { }
    }

    // Final fallback for origin
    if (!clientOrigin) {
        clientOrigin = process.env.ORIGIN || 'http://localhost:5500';
    }

    // 2. Determine RP ID (the domain the authenticator ties to)
    // Priority: Env Var > Derived from Origin > Host Header > localhost
    let currentRPID = process.env.RP_ID;

    if (!currentRPID) {
        try {
            const originUrl = new URL(clientOrigin);
            currentRPID = originUrl.hostname;
        } catch (e) {
            // Fallback to Host header
            const host = req.get('Host');
            if (host) {
                currentRPID = host.split(':')[0];
            } else {
                currentRPID = 'localhost';
            }
        }
    }

    // Dynamic overrides for common dev environments
    if (currentRPID === '127.0.0.1' || clientOrigin.includes('127.0.0.1')) {
        currentRPID = 'localhost';
    } else if (clientOrigin.includes('localhost')) {
        currentRPID = 'localhost';
    }

    console.log(`[WebAuthn Config] Derived RPID: ${currentRPID}, Origin: ${clientOrigin}`);
    return { rpID: currentRPID, origin: clientOrigin };
}

// In-memory challenge store (use Redis in production)
const challengeStore = new Map(); // userId -> challenge

// =========================================
// POST /api/webauthn/register/options
// Generate WebAuthn registration options
// =========================================
router.post('/register/options', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { rpID } = getDynamicConfig(req);

        // Get user details
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        const user = result.rows[0];

        // Check existing credentials to prevent re-registration
        const credentials = await db.query('SELECT credential_id FROM webauthn_credentials WHERE user_id = $1', [userId]);

        // STRICT RULE: If passkey already exists, BLOCK registration
        if (credentials.rows.length > 0) {
            return res.status(400).json({
                success: false,
                code: "PASSKEY_ALREADY_EXISTS",
                message: "Passkey already registered. Use authentication instead."
            });
        }

        const excludeCredentials =
            // We don't need excludeCredentials if we strictly block, but keeping it empty or just in case we relax rule later
            credentials.rows.map(row => ({
                id: row.credential_id,
                type: 'public-key',
                transports: ['internal'],
            }));

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new Uint8Array(Buffer.from(String(userId))),
            userName: user.email,
            userDisplayName: user.name,
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform', // Force platform authenticator (FaceID/TouchID)
            },
            excludeCredentials,
        });

        // Store challenge
        challengeStore.set(userId, options.challenge);

        res.json(options);

    } catch (error) {
        console.error('WebAuthn options error:', error);
        res.status(500).json({ error: 'Failed to generate registration options' });
    }
});

// =========================================
// POST /api/webauthn/register/verify
// Verify registration response and save credential
// =========================================
router.post('/register/verify', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const body = req.body;
        const { rpID, origin } = getDynamicConfig(req);

        const expectedChallenge = challengeStore.get(userId);
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'Registration challenge not found or expired' });
        }

        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
        });

        if (verification.verified && verification.registrationInfo) {
            const { credential } = verification.registrationInfo;
            const { id: credentialID, publicKey: credentialPublicKey, counter } = credential;

            // Save credential to DB
            await db.query(
                `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    userId,
                    credentialID, // Already a string/base64url from SimpleWebAuthn? No, it's usually a string in the verified response
                    Buffer.from(credentialPublicKey).toString('base64'),
                    counter,
                    JSON.stringify(body.response.transports || [])
                ]
            );

            // Enable passkey for user
            await db.query('UPDATE users SET passkey_enabled = true WHERE id = $1', [userId]);

            // Clear challenge
            challengeStore.delete(userId);

            res.json({ verified: true });
        } else {
            res.status(400).json({ verified: false, error: 'Verification failed' });
        }

    } catch (error) {
        console.error('WebAuthn verify error:', error);
        res.status(500).json({ error: 'Failed to verify registration' });
    }
});

module.exports = router;

// =========================================
// POST /api/webauthn/auth/options
// Generate authentication options (Student scans QR)
// =========================================
router.post('/auth/options', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { qr_session_id, qr_token } = req.body;
        const { rpID } = getDynamicConfig(req);

        if (!qr_session_id || !qr_token) {
            return res.status(400).json({ success: false, error: 'Missing QR session info' });
        }

        const sessionId = Number(qr_session_id);
        const tokenHash = hashToken(qr_token);

        // 1. Validate QR token and session status
        const tokenCheck = await db.query(
            `SELECT q.expires_at, (q.expires_at > NOW()) as is_valid, s.is_active 
             FROM qr_tokens q
             JOIN sessions s ON q.session_id = s.id
             WHERE q.session_id = $1 AND q.token_hash = $2`,
            [sessionId, tokenHash]
        );

        if (tokenCheck.rows.length === 0 || !tokenCheck.rows[0].is_active || !tokenCheck.rows[0].is_valid) {
            console.error(`[AuthOptions] QR Validation Failed. Session: ${sessionId}`);
            return res.status(400).json({
                success: false,
                code: 'INVALID_QR',
                error: 'QR expired or session inactive'
            });
        }

        // 2. Fetch user's credentials
        const creds = await db.query(
            'SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1',
            [userId]
        );

        if (creds.rows.length === 0) {
            return res.status(400).json({
                success: false,
                code: "NO_PASSKEY",
                error: "No passkey registered. Please setup passkey first."
            });
        }

        const allowCredentials = creds.rows.map(row => ({
            id: Buffer.from(row.credential_id, 'base64url'), // Convert to Buffer
            type: 'public-key',
            transports: row.transports ? JSON.parse(row.transports) : undefined,
        }));

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'required', // Enforce biometric verification
        });

        // Store active challenge per user+session
        challengeStore.set(`${userId}:${sessionId}`, options.challenge);

        res.json({ success: true, optionsJSON: options });

    } catch (error) {
        console.error('Auth options error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate auth options' });
    }
});

// =========================================
// POST /api/webauthn/auth/verify
// Verify assertions and issue verification ticket
// =========================================
router.post('/auth/verify', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const { qr_session_id, qr_token, assertion } = req.body;
        const { rpID, origin } = getDynamicConfig(req);

        const sessionId = Number(qr_session_id);
        if (!sessionId || !qr_token || !assertion?.id) {
            return res.status(400).json({ success: false, error: "Missing verification data" });
        }

        // 1. Re-validate QR token (Critical Security Layer)
        const tokenHash = hashToken(qr_token);
        const tokenCheck = await db.query(
            `SELECT q.expires_at, (q.expires_at > NOW()) as is_valid, s.is_active 
             FROM qr_tokens q
             JOIN sessions s ON q.session_id = s.id
             WHERE q.session_id = $1 AND q.token_hash = $2`,
            [sessionId, tokenHash]
        );

        if (tokenCheck.rows.length === 0 || !tokenCheck.rows[0].is_active || !tokenCheck.rows[0].is_valid) {
            console.error(`[AuthVerify] QR Validation Failed. Session: ${sessionId}`);
            return res.status(400).json({
                success: false,
                code: 'INVALID_QR',
                error: 'QR expired or session inactive'
            });
        }

        // 2. Validate Challenge
        const expectedChallenge = challengeStore.get(`${userId}:${sessionId}`);
        if (!expectedChallenge) {
            return res.status(400).json({ success: false, error: 'Challenge expired. Please rescan and try again.' });
        }

        // 3. Fetch stored credential and validate its existence
        const credentialResult = await db.query(
            'SELECT id, credential_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
            [userId, assertion.id]
        );

        const credential = credentialResult.rows[0];
        if (!credential) {
            console.error(`[AuthVerify] Credential NOT FOUND. User: ${userId}, ID: ${assertion.id}`);
            return res.status(400).json({
                success: false,
                code: "CREDENTIAL_NOT_FOUND",
                error: "Passkey not found for this account."
            });
        }

        // 4. Build authenticator object strictly as required by SimpleWebAuthn
        const authenticator = {
            credentialID: Buffer.from(credential.credential_id, 'base64url'),
            credentialPublicKey: Buffer.from(credential.public_key, 'base64'),
            counter: Number(credential.counter || 0),
            transports: credential.transports ? JSON.parse(credential.transports) : undefined,
        };

        const verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator,
        });

        if (verification.verified) {
            const { authenticationInfo } = verification;
            const newCounter = authenticationInfo.newCounter;

            // Update counter for replay protection
            await db.query(
                'UPDATE webauthn_credentials SET counter = $1 WHERE id = $2',
                [newCounter, credential.id]
            );

            // 5. Issue verification ticket (used by /attendance/mark)
            const ticketToken = crypto.randomBytes(16).toString('hex');
            const expiresAt = new Date(Date.now() + 10000); // 10s window

            await db.query(
                `INSERT INTO verification_tickets (student_id, session_id, ticket_token, expires_at, is_used)
                 VALUES ($1, $2, $3, $4, false)`,
                [userId, sessionId, ticketToken, expiresAt]
            );

            // Cleanup challenge
            challengeStore.delete(`${userId}:${sessionId}`);

            res.json({ success: true, ticket_token: ticketToken });
        } else {
            res.status(400).json({ success: false, error: 'Biometric verification failed' });
        }

    } catch (error) {
        console.error('Auth verification error:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});
