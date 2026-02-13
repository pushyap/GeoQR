/**
 * Faculty QR Routes - Live QR Session Management
 * Handles dynamic QR code generation and rotation for attendance
 */
const express = require('express');
const crypto = require('crypto');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty } = require('../middleware/roleCheck');
const { hashToken } = require('../utils/token');

const router = express.Router();

const QR_EXPIRY_SECONDS = 60;

/**
 * Helper: Generate and store a new QR token for a session
 */
async function generateQRToken(sessionId, deviceId = null) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    // In a real high-security app, you might hash this. 
    // For this phase, storing raw for simplicity as per requirements (or hash if verified by device).
    // The requirement says "qr_token" matches. We'll store it as is or hash? 
    // config/database.js has token_hash AND raw_token columns.
    // We'll store raw_token for now to match the user's flow where student sends it back.

    // Calculate expiry
    const expiresAt = new Date(Date.now() + QR_EXPIRY_SECONDS * 1000);

    // Generate hash
    const tokenHash = hashToken(rawToken);

    // Insert into qr_tokens
    await db.query(
        `INSERT INTO qr_tokens (session_id, raw_token, token_hash, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, rawToken, tokenHash, expiresAt]
    );

    return {
        qr_token: rawToken,
        expires_in: QR_EXPIRY_SECONDS
    };
}

/**
 * POST /api/faculty/qr/start
 * Starts a session (or uses active one) and generates the first QR token
 */
router.post('/start', authenticate, isFaculty, async (req, res) => {
    try {
        const facultyId = req.user.id;
        // Optional: location_id if starting a NEW session
        const { location_id, subject } = req.body;

        // 1. Check for existing active session
        const existingSession = await db.query(
            'SELECT id, subject, location_id FROM sessions WHERE faculty_id = $1 AND is_active = true',
            [facultyId]
        );

        let sessionId;
        let createdNew = false;

        if (existingSession.rows.length > 0) {
            // Use existing session
            sessionId = existingSession.rows[0].id;
        } else {
            // Create new session
            if (!location_id) {
                return res.status(400).json({ error: 'location_id is required to start a new session' });
            }

            // Verify location (optional check, db enforces FK)

            const startTime = new Date();
            const result = await db.query(
                `INSERT INTO sessions (faculty_id, location_id, subject, start_time, is_active)
                 VALUES ($1, $2, $3, $4, true) RETURNING id`,
                [facultyId, location_id, subject || 'Live Class', startTime]
            );
            sessionId = result.rows[0].id;
            createdNew = true;
        }

        // 2. Generate QR Token
        const tokenData = await generateQRToken(sessionId);

        res.json({
            success: true,
            qr_session_id: sessionId,
            qr_token: tokenData.qr_token,
            expires_in: tokenData.expires_in,
            message: createdNew ? 'New session started' : 'Resumed existing session'
        });

    } catch (error) {
        console.error('QR Start error:', error);
        res.status(500).json({ error: 'Failed to start QR session' });
    }
});

/**
 * POST /api/faculty/qr/refresh
 * Generates a new QR token for an active session
 */
router.post('/refresh', authenticate, isFaculty, async (req, res) => {
    try {
        const { qr_session_id } = req.body;
        const facultyId = req.user.id;

        if (!qr_session_id) {
            return res.status(400).json({ error: 'qr_session_id is required' });
        }

        // 1. Verify session ownership and status
        const sessionCheck = await db.query(
            'SELECT id FROM sessions WHERE id = $1 AND faculty_id = $2 AND is_active = true',
            [qr_session_id, facultyId]
        );

        if (sessionCheck.rows.length === 0) {
            return res.status(403).json({ error: 'Session not active or access denied' });
        }

        // 2. Generate new token
        const tokenData = await generateQRToken(qr_session_id);

        res.json({
            success: true,
            qr_token: tokenData.qr_token,
            expires_in: tokenData.expires_in
        });

    } catch (error) {
        console.error('QR Refresh error:', error);
        res.status(500).json({ error: 'Failed to refresh QR' });
    }
});

/**
 * POST /api/faculty/qr/stop
 * Ends the session
 */
router.post('/stop', authenticate, isFaculty, async (req, res) => {
    try {
        const { qr_session_id } = req.body;
        const facultyId = req.user.id;

        if (!qr_session_id) {
            return res.status(400).json({ error: 'qr_session_id is required' });
        }

        // 1. Verify and End
        const result = await db.query(
            `UPDATE sessions 
             SET is_active = false, end_time = CURRENT_TIMESTAMP 
             WHERE id = $1 AND faculty_id = $2 AND is_active = true
             RETURNING id`,
            [qr_session_id, facultyId]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Session not active or access denied' });
        }

        res.json({
            success: true,
            message: 'Session ended'
        });

    } catch (error) {
        console.error('QR Stop error:', error);
        res.status(500).json({ error: 'Failed to stop session' });
    }
});

module.exports = router;
