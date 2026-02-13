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
    if (clientOrigin.includes('127.0.0.1')) {
        currentRPID = '127.0.0.1';
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
            const { credential, credentialBackedUp } = verification.registrationInfo;
            const { id: credentialID, publicKey: credentialPublicKey, counter, transports } = credential;

            // Save credential to DB
            await db.query(
                `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    userId,
                    credentialID,
                    Buffer.from(credentialPublicKey).toString('base64'),
                    counter,
                    JSON.stringify(body.response.transports || []) // Save transports hint
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
            console.error(`[AuthOptions] Missing info: sid=${qr_session_id}, token=${qr_token ? 'present' : 'missing'}`);
            return res.status(400).json({ error: 'Missing QR session info' });
        }

        const sessionId = Number(qr_session_id);
        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }

        // 1. Detailed QR Validation + Session Status
        const tokenHash = hashToken(qr_token);

        // Check session separately for better logging
        const sessionCheck = await db.query('SELECT is_active, subject FROM sessions WHERE id = $1', [sessionId]);
        if (sessionCheck.rows.length === 0) {
            console.error(`[AuthOptions] Session NOT FOUND. ID: ${sessionId}`);
            return res.status(400).json({ success: false, code: 'SESSION_NOT_FOUND', message: 'Session does not exist' });
        }
        if (!sessionCheck.rows[0].is_active) {
            console.error(`[AuthOptions] Session INACTIVE. ID: ${sessionId}, Subject: ${sessionCheck.rows[0].subject}`);
            return res.status(400).json({ success: false, code: 'SESSION_INACTIVE', message: 'Session has ended' });
        }

        // Check token separately
        const tokenCheck = await db.query(
            `SELECT expires_at, (expires_at > NOW()) as is_valid, token_hash 
             FROM qr_tokens 
             WHERE session_id = $1 AND token_hash = $2`,
            [sessionId, tokenHash]
        );

        if (tokenCheck.rows.length === 0) {
            console.error(`[AuthOptions] Token HASH MISMATCH. Session: ${sessionId}, Provided Token: ${qr_token.substring(0, 5)}...`);
            return res.status(400).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid QR token' });
        }
        if (!tokenCheck.rows[0].is_valid) {
            console.error(`[AuthOptions] Token EXPIRED. Session: ${sessionId}, Expired at: ${tokenCheck.rows[0].expires_at}`);
            return res.status(400).json({ success: false, code: 'TOKEN_EXPIRED', message: 'QR code has expired' });
        }

        console.log(`[AuthOptions] QR Validated Successfully. Session: ${sessionId}`);

        // 2. Check if user has passkey
        const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (!user.rows[0].passkey_enabled) {
            return res.status(400).json({ error: 'Passkey not set up. Please register first.' });
        }

        // 3. Get user's credentials
        const credentials = await db.query('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1', [userId]);

        const allowCredentials = credentials.rows.map(row => ({
            id: row.credential_id,
            type: 'public-key',
            transports: row.transports ? JSON.parse(row.transports) : undefined,
        }));

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });

        // Store active challenge
        challengeStore.set(userId, options.challenge);

        res.json(options);

    } catch (error) {
        console.error('Auth options error:', error);
        res.status(500).json({ error: 'Failed to generate auth options' });
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

        if (!qr_session_id || !qr_token) {
            return res.status(400).json({ error: 'Missing QR info' });
        }

        const expectedChallenge = challengeStore.get(userId);
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'Challenge not found or expired' });
        }

        // 1. Double check QR (security layer)
        const sessionId = Number(qr_session_id);
        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }
        const tokenHash = hashToken(qr_token);

        const sessionCheck = await db.query('SELECT is_active FROM sessions WHERE id = $1', [sessionId]);
        if (sessionCheck.rows.length === 0) {
            console.error(`[AuthVerify] Session NOT FOUND. ID: ${sessionId}`);
            return res.status(400).json({ error: 'Session does not exist (Verify Phase)' });
        }
        if (!sessionCheck.rows[0].is_active) {
            console.error(`[AuthVerify] Session INACTIVE. ID: ${sessionId}`);
            return res.status(400).json({ error: 'Session has ended (Verify Phase)' });
        }

        const tokenCheck = await db.query(
            `SELECT expires_at, (expires_at > NOW()) as is_valid 
             FROM qr_tokens 
             WHERE session_id = $1 AND token_hash = $2`,
            [sessionId, tokenHash]
        );

        if (tokenCheck.rows.length === 0) {
            console.error(`[AuthVerify] Token HASH MISMATCH. Session: ${sessionId}`);
            return res.status(400).json({ error: 'Invalid QR token (Verify Phase)' });
        }
        if (!tokenCheck.rows[0].is_valid) {
            console.error(`[AuthVerify] Token EXPIRED. Session: ${sessionId}, Expired at: ${tokenCheck.rows[0].expires_at}`);
            return res.status(400).json({ error: 'QR code session timed out. Please scan again.' });
        }

        console.log(`[AuthVerify] QR Validated. Proceeding with Biometric Verification for User: ${userId}`);

        // 1. Get credential from DB to verify signature
        // The assertion contains the credential ID used.
        const credentialId = assertion.id;
        const credentialResult = await db.query(
            'SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
            [userId, credentialId]
        );

        if (credentialResult.rows.length === 0) {
            return res.status(400).json({ error: 'Credential not found' });
        }

        const credential = credentialResult.rows[0];
        // credential.public_key is stored as base64 string
        // verifyAuthenticationResponse expects Uint8Array for credentialPublicKey if passed?
        // Actually it retrieves it from standard means? No, we must pass it?
        // Docs say: `authenticator` object needed? Or just `credential.publicKey`?
        // Wait, verifyAuthenticationResponse takes `credential` which includes `publicKey`.
        // My DB stores `public_key` as base64 string.

        // Convert base64 public key back to Uint8Array
        const publicKey = new Uint8Array(Buffer.from(credential.public_key, 'base64'));

        console.log(`Verify: Assertion from ${origin} (RPID: ${rpID})`);

        const verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge,
            expectedOrigin: origin, // Allow dynamic origin
            expectedRPID: rpID,
            authenticator: {
                credentialID: credential.credential_id,
                credentialPublicKey: publicKey,
                counter: credential.counter,
                transports: credential.transports ? JSON.parse(credential.transports) : undefined,
            },
        });

        if (verification.verified) {
            const { authenticationInfo } = verification;
            const newCounter = authenticationInfo.newCounter;

            // Update counter
            await db.query(
                'UPDATE webauthn_credentials SET counter = $1 WHERE id = $2',
                [newCounter, credential.id]
            );

            // Clear challenge
            challengeStore.delete(userId);

            // ==========================================
            // ISSUE VERIFICATION TICKET
            // ==========================================
            const ticketToken = crypto.randomBytes(16).toString('hex');
            // Expires in 10 seconds (Strict verification window)
            const expiresAt = new Date(Date.now() + 10000);

            await db.query(
                `INSERT INTO verification_tickets (student_id, session_id, ticket_token, expires_at)
                 VALUES ($1, $2, $3, $4)`,
                [userId, qr_session_id, ticketToken, expiresAt]
            );

            res.json({ success: true, message: 'Verified', ticket_token: ticketToken });
        } else {
            res.status(400).json({ verified: false, error: 'Verification failed' });
        }

    } catch (error) {
        console.error('Auth verification error:', error);
        res.status(500).json({ error: 'Failed to verify auth' });
    }
});

module.exports = router;
