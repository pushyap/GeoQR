/**
 * Session Routes for PostgreSQL
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty, isFacultyOrAdmin } = require('../middleware/roleCheck');
const { logDeviceActivity } = require('../utils/security');
const { autoEndSessions } = require('../utils/sessionHelper');

const router = express.Router();

/**
 * POST /api/sessions/start
 */
router.post('/start', authenticate, isFaculty, [
    body('location_id').isInt(),
    body('subject').optional().trim()
], async (req, res) => {
    // 0. Auto-end expired sessions first
    await autoEndSessions();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Session start validation errors:', errors.array(), 'Body:', req.body);
        return res.status(400).json({
            success: false,
            error: 'Validation failed: ' + errors.array().map(e => e.msg).join(', '),
            errors: errors.array()
        });
    }

    const { location_id, subject } = req.body;
    const facultyId = req.user.id;

    try {
        // Check if location exists
        const locationResult = await db.query(
            'SELECT * FROM locations WHERE id = $1 AND is_active = true',
            [location_id]
        );

        if (locationResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Location not found or inactive'
            });
        }

        // Check for existing active session by this faculty
        const existingResult = await db.query(
            'SELECT id, subject FROM sessions WHERE faculty_id = $1 AND is_active = true',
            [facultyId]
        );

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: `You already have an active session: "${existingResult.rows[0].subject}" (ID: ${existingResult.rows[0].id}). End it first.`
            });
        }

        // Use start_time from frontend or default to now
        const duration = req.body.duration_minutes || 90;
        let startTime;
        if (req.body.start_time) {
            startTime = new Date(req.body.start_time);
        } else {
            startTime = new Date();
        }
        const endTime = new Date(startTime.getTime() + duration * 60000);

        // Create session with explicit start_time
        const result = await db.query(
            `INSERT INTO sessions (faculty_id, location_id, subject, start_time, end_time, expected_students)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [facultyId, location_id, subject || 'General Class', startTime, endTime, req.body.expected_students || 60]
        );

        const session = result.rows[0];
        console.log(`Session ${session.id} created | Start: ${startTime.toISOString()} | End: ${endTime.toISOString()}`);

        // Schedule auto-end when end_time is reached
        const msUntilEnd = endTime.getTime() - Date.now();
        if (msUntilEnd > 0) {
            setTimeout(async () => {
                try {
                    const check = await db.query('SELECT is_active FROM sessions WHERE id = $1', [session.id]);
                    if (check.rows.length > 0 && check.rows[0].is_active) {
                        await db.query(
                            'UPDATE sessions SET is_active = false WHERE id = $1',
                            [session.id]
                        );
                        console.log(`Session ${session.id} auto-ended after ${duration} minutes`);
                    }
                } catch (err) {
                    console.error(`Auto-end failed for session ${session.id}:`, err);
                }
            }, msUntilEnd);
        }

        res.status(201).json({
            success: true,
            session
        });

        await logDeviceActivity(null, 'session_started', {
            sessionId: session.id,
            subject: session.subject,
            locationId: location_id,
            by: req.user.id
        });

    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to start session'
        });
    }
});

/**
 * POST /api/sessions/end/:id
 */
router.post('/end/:id', authenticate, isFacultyOrAdmin, async (req, res) => {
    try {
        // First check if session exists at all
        const sessionCheck = await db.query(
            'SELECT id, is_active, subject FROM sessions WHERE id = $1',
            [req.params.id]
        );

        if (sessionCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Session ${req.params.id} does not exist`
            });
        }

        if (!sessionCheck.rows[0].is_active) {
            // Session exists but already ended — treat as success so UI can recover
            console.log(`Session ${req.params.id} already ended, returning success for UI recovery`);
            return res.json({
                success: true,
                alreadyEnded: true,
                attendanceCount: 0
            });
        }

        const session = sessionCheck.rows[0];

        // Only owner or admin can end
        const fullSession = await db.query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
        if (req.user.role === 'faculty' && fullSession.rows[0].faculty_id !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'You can only end your own sessions'
            });
        }

        // End session
        await db.query(
            'UPDATE sessions SET is_active = false, end_time = CURRENT_TIMESTAMP WHERE id = $1',
            [req.params.id]
        );

        // Get attendance count
        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM attendance_logs WHERE session_id = $1',
            [req.params.id]
        );

        console.log(`Session ${req.params.id} ended. Attendance: ${countResult.rows[0].total}`);

        res.json({
            success: true,
            attendanceCount: parseInt(countResult.rows[0].total)
        });

        await logDeviceActivity(null, 'session_ended', {
            sessionId: req.params.id,
            attendanceCount: parseInt(countResult.rows[0].total),
            by: req.user.id
        });

    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to end session'
        });
    }
});

/**
 * GET /api/sessions/active
 */
router.get('/active', authenticate, isFacultyOrAdmin, async (req, res) => {
    try {
        let result;

        if (req.user.role === 'admin') {
            result = await db.query(`
                SELECT s.*, s.expected_students, l.name as location_name, u.name as faculty_name,
                    (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
                FROM sessions s
                JOIN locations l ON s.location_id = l.id
                JOIN users u ON s.faculty_id = u.id
                WHERE s.is_active = true
                ORDER BY s.start_time DESC
            `);
        } else {
            result = await db.query(`
                SELECT s.*, s.expected_students, l.name as location_name,
                    (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
                FROM sessions s
                JOIN locations l ON s.location_id = l.id
                WHERE s.faculty_id = $1 AND s.is_active = true
                ORDER BY s.start_time DESC
            `, [req.user.id]);
        }

        res.json({
            success: true,
            sessions: result.rows
        });

    } catch (error) {
        console.error('Get active sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sessions'
        });
    }
});

/**
 * GET /api/sessions/history
 */
router.get('/history', authenticate, isFacultyOrAdmin, async (req, res) => {
    try {
        let result;

        if (req.user.role === 'admin') {
            result = await db.query(`
                SELECT s.*, s.expected_students, l.name as location_name, u.name as faculty_name,
                    (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
                FROM sessions s
                JOIN locations l ON s.location_id = l.id
                JOIN users u ON s.faculty_id = u.id
                WHERE s.is_active = false
                ORDER BY s.start_time DESC
                LIMIT 50
            `);
        } else {
            result = await db.query(`
                SELECT s.*, s.expected_students, l.name as location_name,
                    (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
                FROM sessions s
                JOIN locations l ON s.location_id = l.id
                WHERE s.faculty_id = $1 AND s.is_active = false
                ORDER BY s.start_time DESC
                LIMIT 50
            `, [req.user.id]);
        }

        res.json({
            success: true,
            sessions: result.rows
        });

    } catch (error) {
        console.error('Get session history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session history'
        });
    }
});

module.exports = router;
