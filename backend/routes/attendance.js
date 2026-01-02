/**
 * Attendance Routes for PostgreSQL
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isStudent, isFacultyOrAdmin } = require('../middleware/roleCheck');
const { hashToken } = require('../utils/token');
const { isWithinRadius } = require('../utils/gps');

const router = express.Router();

/**
 * POST /api/attendance/mark
 */
router.post('/mark', authenticate, isStudent, [
    body('token').trim().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { token, latitude, longitude } = req.body;
    const studentId = req.user.id;

    try {
        // Hash token and look up
        const tokenHash = hashToken(token);
        const tokenResult = await db.query(`
            SELECT qt.*, l.latitude as loc_lat, l.longitude as loc_lng, l.radius, l.name as location_name
            FROM qr_tokens qt
            JOIN locations l ON qt.location_id = l.id
            WHERE qt.token_hash = $1
        `, [tokenHash]);

        const qrToken = tokenResult.rows[0];

        if (!qrToken) {
            return res.status(400).json({
                success: false,
                error: 'Invalid QR code'
            });
        }

        // Check token not expired
        const now = new Date();
        const expiresAt = new Date(qrToken.expires_at);
        if (now > expiresAt) {
            return res.status(400).json({
                success: false,
                error: 'QR code has expired. Please scan a new code.'
            });
        }

        // Check token not used
        if (qrToken.is_used) {
            return res.status(400).json({
                success: false,
                error: 'QR code has already been used'
            });
        }

        // Check for active session
        const sessionResult = await db.query(`
            SELECT id, subject FROM sessions 
            WHERE location_id = $1 AND is_active = true
            LIMIT 1
        `, [qrToken.location_id]);

        const session = sessionResult.rows[0];

        if (!session) {
            return res.status(400).json({
                success: false,
                error: 'No active attendance session at this location'
            });
        }

        // Check if student already marked
        const existingResult = await db.query(`
            SELECT id FROM attendance_logs 
            WHERE student_id = $1 AND session_id = $2
        `, [studentId, session.id]);

        if (existingResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'You have already marked attendance for this session'
            });
        }

        // Calculate distance
        const gpsCheck = isWithinRadius(
            latitude, longitude,
            parseFloat(qrToken.loc_lat), parseFloat(qrToken.loc_lng),
            qrToken.radius
        );

        if (!gpsCheck.isWithin) {
            return res.status(400).json({
                success: false,
                error: `You are too far from the classroom (${gpsCheck.distance}m away, max ${qrToken.radius}m allowed)`
            });
        }

        // Mark attendance
        await db.query(`
            INSERT INTO attendance_logs (student_id, session_id, location_id, device_id, latitude, longitude, distance_from_device, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'present')
        `, [studentId, session.id, qrToken.location_id, qrToken.device_id, latitude, longitude, gpsCheck.distance]);

        // Mark token as used
        await db.query(
            'UPDATE qr_tokens SET is_used = true WHERE id = $1',
            [qrToken.id]
        );

        res.json({
            success: true,
            message: 'Attendance marked successfully!',
            attendance: {
                location: qrToken.location_name,
                subject: session.subject,
                distance: gpsCheck.distance,
                markedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Mark attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to mark attendance'
        });
    }
});

/**
 * GET /api/attendance/my
 */
router.get('/my', authenticate, isStudent, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                l.name as location_name,
                s.subject, s.start_time as session_start
            FROM attendance_logs al
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            WHERE al.student_id = $1
            ORDER BY al.marked_at DESC
            LIMIT 50
        `, [req.user.id]);

        res.json({
            success: true,
            records: result.rows
        });

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance records'
        });
    }
});

/**
 * GET /api/attendance/session/:id
 */
router.get('/session/:id', authenticate, isFacultyOrAdmin, async (req, res) => {
    try {
        const sessionResult = await db.query(`
            SELECT s.*, l.name as location_name, u.name as faculty_name
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            JOIN users u ON s.faculty_id = u.id
            WHERE s.id = $1
        `, [req.params.id]);

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        const attendanceResult = await db.query(`
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                u.name as student_name, u.student_id, u.email
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            WHERE al.session_id = $1
            ORDER BY al.marked_at
        `, [req.params.id]);

        res.json({
            success: true,
            session: sessionResult.rows[0],
            attendance: attendanceResult.rows,
            count: attendanceResult.rows.length
        });

    } catch (error) {
        console.error('Get session attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session attendance'
        });
    }
});

module.exports = router;
