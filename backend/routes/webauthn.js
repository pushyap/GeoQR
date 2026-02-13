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
    const clientOrigin = req.get('Origin') || process.env.ORIGIN || 'https://geo-qr.app';

    // Explicit production override
    if (clientOrigin.includes('geo-qr.app')) {
        return { rpID: 'geo-qr.app', origin: 'https://geo-qr.app' };
    }

    let currentRPID = process.env.RP_ID || 'localhost';

    try {
        const originUrl = new URL(clientOrigin);
        currentRPID = originUrl.hostname;
    } catch (e) {
        console.warn('Invalid client origin URL, using fallback RPID:', clientOrigin);
    }

    if (clientOrigin.includes('127.0.0.1')) {
        currentRPID = '127.0.0.1';
    } else if (clientOrigin.includes('localhost')) {
        currentRPID = 'localhost';
    }

    return { rpID: currentRPID, origin: clientOrigin };
}

/**
 * Challenge Management Helpers (DB Backed)
 */
async function storeChallenge(userId, challenge) {
    const expiresAt = new Date(Date.now() + 2 * 60000); // 2 minutes
    await db.query(
        `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET challenge = $2, expires_at = $3`,
        [userId, challenge, expiresAt]
    );
}

async function getAndDeleteChallenge(userId) {
    const result = await db.query(
        'DELETE FROM webauthn_challenges WHERE user_id = $1 AND expires_at > NOW() RETURNING challenge',
        [userId]
    );
    return result.rows[0]?.challenge;
}

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

        // Store challenge in DB
        await storeChallenge(userId, options.challenge);

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

        const expectedChallenge = await getAndDeleteChallenge(userId);
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
            // Ensure credentialID is stored as base64url string for consistency
            const credentialIDString = typeof credentialID === 'string' ? credentialID : Buffer.from(credentialID).toString('base64url');

            await db.query(
                `INSERT INTO webauthn_credentials (user_id, credential_id, public_key, counter, transports)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                    userId,
                    credentialIDString,
                    Buffer.from(credentialPublicKey).toString('base64'),
                    counter,
                    JSON.stringify(body.response.transports || []) // Save transports hint
                ]
            );

            // Enable passkey for user
            await db.query('UPDATE users SET passkey_enabled = true WHERE id = $1', [userId]);

            // Challenge already deleted by getAndDeleteChallenge

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
            console.error(`[AuthOptions] Missing info: sid=${qr_session_id}, token=${qr_token ? 'present' : 'missing'}`);
            return res.status(400).json({ error: 'Missing QR session info' });
        }

        const sessionId = Number(qr_session_id);
        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID format' });
        }

        // 1. Validate QR Token
        const tokenHash = hashToken(qr_token);
        console.log(`[AuthOptions] Verifying token for session ${qr_session_id}`);
        console.log(`[AuthOptions] Incoming token: ${qr_token.substring(0, 8)}...`);
        console.log(`[AuthOptions] Computed hash: ${tokenHash}`);

        const tokenCheck = await db.query(
            'SELECT * FROM qr_tokens WHERE session_id = $1 AND token_hash = $2 AND expires_at > NOW()',
            [sessionId, tokenHash]
        );

        if (tokenCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired QR code' });
        }

        // 2. Check if user has passkey
        const userResult = await db.query('SELECT passkey_enabled FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length === 0 || !userResult.rows[0].passkey_enabled) {
            return res.status(400).json({
                success: false,
                code: 'PASSKEY_NOT_FOUND',
                error: 'Passkey not set up. Please register first.'
            });
        }

        // 3. Get user's credentials
        const credentials = await db.query('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = $1', [userId]);

        if (credentials.rows.length === 0) {
            return res.status(400).json({
                success: false,
                code: 'PASSKEY_NOT_FOUND',
                error: 'No registered credentials found.'
            });
        }

        const allowCredentials = credentials.rows.map(row => {
            // SimpleWebAuthn library expects id to be Uint8Array (binary)
            // But we store it as a base64url string in the DB.
            return {
                id: Buffer.from(row.credential_id, 'base64url'),
                type: 'public-key',
                transports: row.transports ? JSON.parse(row.transports) : undefined,
            };
        });

        console.log(`[AuthOptions] Found ${allowCredentials.length} credentials for user ${userId}`);

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred',
        });

        // Store active challenge in DB
        await storeChallenge(userId, options.challenge);

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

        const expectedChallenge = await getAndDeleteChallenge(userId);
        if (!expectedChallenge) {
            console.error(`[AuthVerify] Challenge not found for user ${userId}`);
            return res.status(400).json({ error: 'Challenge not found or expired' });
        }

        // 1. Double check QR (security layer)
        const tokenHash = hashToken(qr_token);
        const tokenCheck = await db.query(
            'SELECT id FROM qr_tokens WHERE session_id = $1 AND token_hash = $2 AND expires_at > NOW()',
            [qr_session_id, tokenHash]
        );

        if (tokenCheck.rows.length === 0) {
            console.error(`[AuthVerify] QR Validation Failed. Hash: ${tokenHash}`);
            return res.status(400).json({ error: 'Invalid or expired QR code (Verify Phase)' });
        }

        // 1. Get credential from DB to verify signature
        const credentialId = assertion.id;
        const credentialResult = await db.query(
            'SELECT * FROM webauthn_credentials WHERE user_id = $1 AND credential_id = $2',
            [userId, credentialId]
        );

        if (credentialResult.rows.length === 0) {
            console.error(`[AuthVerify] Credential not found: ${credentialId} for user ${userId}`);
            return res.status(400).json({ error: 'Credential not found' });
        }

        const credential = credentialResult.rows[0];

        // IMPORTANT: SimpleWebAuthn expects Uint8Array for binary fields in the authenticator object
        const publicKey = new Uint8Array(Buffer.from(credential.public_key, 'base64'));
        const credentialIDBytes = new Uint8Array(Buffer.from(credential.credential_id, 'base64url'));

        console.log(`[AuthVerify] Verifying for user ${userId} with RPID: ${rpID}, Origin: ${origin}`);

        const verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            authenticator: {
                credentialID: credentialIDBytes,
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

            // Challenge already deleted by getAndDeleteChallenge

            // ==========================================
            // ISSUE VERIFICATION TICKET
            // ==========================================
            const ticketToken = crypto.randomBytes(16).toString('hex');
            // Expires in 60 seconds (increased from 20s)
            const expiresAt = new Date(Date.now() + 60000);

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
