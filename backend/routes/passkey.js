/**
 * WebAuthn Passkey Routes
 * Handles passkey registration, authentication, and management
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isStudent } = require('../middleware/roleCheck');
const rateLimit = require('express-rate-limit');

// Rate limiting for passkey endpoints
const passkeyRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    message: { success: false, error: 'Too many attempts. Try again in a minute.' }
});

// RP (Relying Party) configuration
const rpName = 'GeoQR Attendance';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:5500';

// Lazy-load SimpleWebAuthn (ESM module)
let _webauthn = null;
async function getWebAuthn() {
    if (!_webauthn) {
        _webauthn = await import('@simplewebauthn/server');
    }
    return _webauthn;
}

// ============================================
// Helper: Store challenge in DB (2-min expiry)
// ============================================
async function storeChallenge(userId, challenge, type) {
    // Clean old challenges for this user
    await db.query(
        'DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2',
        [userId, type]
    );
    await db.query(
        `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at) 
         VALUES ($1, $2, $3, NOW() + INTERVAL '2 minutes')`,
        [userId, challenge, type]
    );
}

async function getChallenge(userId, type) {
    const result = await db.query(
        `SELECT challenge FROM webauthn_challenges 
         WHERE user_id = $1 AND type = $2 AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [userId, type]
    );
    if (result.rows.length === 0) return null;
    // Clean up after use
    await db.query(
        'DELETE FROM webauthn_challenges WHERE user_id = $1 AND type = $2',
        [userId, type]
    );
    return result.rows[0].challenge;
}

// ============================================
// POST /register/options — Start registration
// ============================================
router.post('/register/options', authenticate, isStudent, passkeyRateLimit, async (req, res) => {
    try {
        const { generateRegistrationOptions } = await getWebAuthn();
        const userId = req.user.id;

        // Get existing passkeys for this user
        const existing = await db.query(
            'SELECT credential_id FROM student_passkeys WHERE student_id = $1',
            [userId]
        );

        const excludeCredentials = existing.rows.map(row => ({
            id: row.credential_id,
            type: 'public-key'
        }));

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new TextEncoder().encode(String(userId)),
            userName: req.user.email,
            userDisplayName: req.user.name,
            attestationType: 'none',
            excludeCredentials,
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform' // fingerprint/face only (not USB keys)
            }
        });

        // Store challenge
        await storeChallenge(userId, options.challenge, 'registration');

        res.json({ success: true, options });
    } catch (error) {
        console.error('Registration options error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate registration options' });
    }
});

// ============================================
// POST /register/verify — Complete registration
// ============================================
router.post('/register/verify', authenticate, isStudent, passkeyRateLimit, async (req, res) => {
    try {
        const { verifyRegistrationResponse } = await getWebAuthn();
        const userId = req.user.id;
        const { attestation, deviceName } = req.body;

        if (!attestation) {
            return res.status(400).json({ success: false, error: 'Missing attestation response' });
        }

        // Get stored challenge
        const expectedChallenge = await getChallenge(userId, 'registration');
        if (!expectedChallenge) {
            return res.status(400).json({ success: false, error: 'Challenge expired or not found. Please try again.' });
        }

        const verification = await verifyRegistrationResponse({
            response: attestation,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID
        });

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ success: false, error: 'Verification failed' });
        }

        const { credential } = verification.registrationInfo;

        // Store credential — encode binary fields as base64url
        const credentialIdB64 = Buffer.from(credential.id).toString('base64url');
        const publicKeyB64 = Buffer.from(credential.publicKey).toString('base64url');

        await db.query(
            `INSERT INTO student_passkeys (student_id, credential_id, public_key, counter, device_name)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, credentialIdB64, publicKeyB64, credential.counter || 0, deviceName || 'My Device']
        );

        res.json({
            success: true,
            message: 'Passkey registered successfully!',
            passkey: {
                device_name: deviceName || 'My Device',
                created_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Registration verify error:', error);
        res.status(500).json({ success: false, error: 'Failed to verify registration' });
    }
});

// ============================================
// POST /login/options — Start authentication
// ============================================
router.post('/login/options', authenticate, isStudent, passkeyRateLimit, async (req, res) => {
    try {
        const { generateAuthenticationOptions } = await getWebAuthn();
        const userId = req.user.id;

        // Get user's passkeys
        const passkeys = await db.query(
            'SELECT credential_id FROM student_passkeys WHERE student_id = $1',
            [userId]
        );

        if (passkeys.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No passkeys registered. Please register a passkey first.',
                noPasskeys: true
            });
        }

        const allowCredentials = passkeys.rows.map(row => ({
            id: row.credential_id,
            type: 'public-key'
        }));

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials,
            userVerification: 'preferred'
        });

        // Store challenge
        await storeChallenge(userId, options.challenge, 'authentication');

        res.json({ success: true, options });
    } catch (error) {
        console.error('Login options error:', error);
        res.status(500).json({ success: false, error: 'Failed to generate authentication options' });
    }
});

// ============================================
// POST /login/verify — Complete authentication
// Returns a short-lived biometricToken for use in /attendance/scan
// ============================================
router.post('/login/verify', authenticate, isStudent, passkeyRateLimit, async (req, res) => {
    try {
        const { verifyAuthenticationResponse } = await getWebAuthn();
        const userId = req.user.id;
        const { assertion } = req.body;

        if (!assertion) {
            return res.status(400).json({ success: false, error: 'Missing assertion response' });
        }

        // Get stored challenge
        const expectedChallenge = await getChallenge(userId, 'authentication');
        if (!expectedChallenge) {
            return res.status(400).json({ success: false, error: 'Challenge expired or not found. Please try again.' });
        }

        // Find the credential being used
        const credentialIdB64 = assertion.id;
        const credResult = await db.query(
            'SELECT * FROM student_passkeys WHERE credential_id = $1 AND student_id = $2',
            [credentialIdB64, userId]
        );

        if (credResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Unknown credential' });
        }

        const storedPasskey = credResult.rows[0];

        const verification = await verifyAuthenticationResponse({
            response: assertion,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: storedPasskey.credential_id,
                publicKey: Buffer.from(storedPasskey.public_key, 'base64url'),
                counter: storedPasskey.counter
            }
        });

        if (!verification.verified) {
            return res.status(400).json({ success: false, error: 'Biometric verification failed' });
        }

        // Update counter and last_used_at
        await db.query(
            'UPDATE student_passkeys SET counter = $1, last_used_at = NOW() WHERE id = $2',
            [verification.authenticationInfo.newCounter, storedPasskey.id]
        );

        // Generate short-lived biometric token (5 minutes)
        const biometricToken = crypto.randomBytes(32).toString('hex');
        await db.query(
            `INSERT INTO webauthn_challenges (user_id, challenge, type, expires_at) 
             VALUES ($1, $2, 'biometric_token', NOW() + INTERVAL '5 minutes')`,
            [userId, biometricToken]
        );

        res.json({
            success: true,
            verified: true,
            biometricToken,
            message: 'Biometric verified! You can now mark attendance.'
        });
    } catch (error) {
        console.error('Login verify error:', error);
        res.status(500).json({ success: false, error: 'Biometric verification failed' });
    }
});

// ============================================
// GET /list — List user's passkeys
// ============================================
router.get('/list', authenticate, isStudent, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, device_name, created_at, last_used_at 
             FROM student_passkeys WHERE student_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json({ success: true, passkeys: result.rows });
    } catch (error) {
        console.error('List passkeys error:', error);
        res.status(500).json({ success: false, error: 'Failed to list passkeys' });
    }
});

// ============================================
// DELETE /remove/:id — Remove a passkey
// ============================================
router.delete('/remove/:id', authenticate, isStudent, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM student_passkeys WHERE id = $1 AND student_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Passkey not found' });
        }

        res.json({ success: true, message: 'Passkey removed successfully' });
    } catch (error) {
        console.error('Remove passkey error:', error);
        res.status(500).json({ success: false, error: 'Failed to remove passkey' });
    }
});

// ============================================
// GET /status — Check if user has passkeys
// ============================================
router.get('/status', authenticate, isStudent, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM student_passkeys WHERE student_id = $1',
            [req.user.id]
        );
        const hasPasskeys = parseInt(result.rows[0].count) > 0;
        res.json({ success: true, hasPasskeys, count: parseInt(result.rows[0].count) });
    } catch (error) {
        console.error('Passkey status error:', error);
        res.status(500).json({ success: false, error: 'Failed to check passkey status' });
    }
});

module.exports = router;
