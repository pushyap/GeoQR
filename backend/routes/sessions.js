/**
 * Session Routes for PostgreSQL
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty, isFacultyOrAdmin } = require('../middleware/roleCheck');

const router = express.Router();

/**
 * POST /api/sessions/start
 */
router.post('/start', authenticate, isFaculty, [
    body('location_id').isInt(),
    body('subject').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
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

        // Check for existing active session
        const existingResult = await db.query(
            'SELECT id FROM sessions WHERE location_id = $1 AND is_active = true',
            [location_id]
        );

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'There is already an active session at this location'
            });
        }

        // Calculate end time
        const duration = req.body.duration_minutes || 90; // Default 90 mins
        const endTime = new Date(Date.now() + duration * 60000);

        // Create session
        const result = await db.query(
            `INSERT INTO sessions (faculty_id, location_id, subject, end_time)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [facultyId, location_id, subject || 'General Class', endTime]
        );

        res.status(201).json({
            success: true,
            message: 'Session started successfully',
            session: result.rows[0]
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
        const sessionResult = await db.query(
            'SELECT * FROM sessions WHERE id = $1 AND is_active = true',
            [req.params.id]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Active session not found'
            });
        }

        const session = sessionResult.rows[0];

        // Only owner or admin can end
        if (req.user.role === 'faculty' && session.faculty_id !== req.user.id) {
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

        res.json({
            success: true,
            message: 'Session ended successfully',
            attendanceCount: parseInt(countResult.rows[0].total)
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
                SELECT s.*, l.name as location_name, u.name as faculty_name,
                    (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
                FROM sessions s
                JOIN locations l ON s.location_id = l.id
                JOIN users u ON s.faculty_id = u.id
                WHERE s.is_active = true
                ORDER BY s.start_time DESC
            `);
        } else {
            result = await db.query(`
                SELECT s.*, l.name as location_name,
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
                SELECT s.*, l.name as location_name, u.name as faculty_name,
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
                SELECT s.*, l.name as location_name,
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
