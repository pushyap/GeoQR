/**
 * Attendance Routes - Production Grade
 * With signature verification, nonce validation, and enhanced security
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isStudent, isFacultyOrAdmin } = require('../middleware/roleCheck');
const { scanRateLimit, getClientIp } = require('../middleware/rateLimit');
const { hashToken } = require('../utils/token');
const { isWithinRadius } = require('../utils/gps');
const {
    verifyQRContent,
    validateAndConsumeNonce,
    validateTimestamp,
    logDeviceActivity
} = require('../utils/security');

const router = express.Router();

/**
 * POST /api/attendance/mark
 * Mark attendance with comprehensive security validation
 */
router.post('/mark', authenticate, isStudent, scanRateLimit, [
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
    const ipAddress = getClientIp(req);

    try {
        // ==========================================
        // STEP 1: Verify QR Signature (Anti-tampering)
        // ==========================================
        const verification = verifyQRContent(token);

        if (!verification.valid) {
            console.log(`❌ QR verification failed for student ${studentId}:`, verification.error);
            return res.status(400).json({
                success: false,
                error: verification.error || 'Invalid QR code'
            });
        }

        const payload = verification.payload;

        // ==========================================
        // STEP 2: Validate Timestamp (Anti-replay)
        // ==========================================
        if (!validateTimestamp(payload.ts, 30000)) {
            console.log(`❌ Timestamp validation failed for student ${studentId}`);
            return res.status(400).json({
                success: false,
                error: 'QR code has expired. Please scan a new code.'
            });
        }

        // ==========================================
        // STEP 3: Validate & Consume Nonce (Single-use)
        // ==========================================
        const nonceValid = await validateAndConsumeNonce(payload.nonce, payload.did);

        if (!nonceValid) {
            console.log(`❌ Nonce already used for student ${studentId}:`, payload.nonce);
            return res.status(400).json({
                success: false,
                error: 'This QR code has already been used. Please scan a new code.'
            });
        }

        // ==========================================
        // STEP 4: Fetch location details
        // ==========================================
        const locationResult = await db.query(`
            SELECT id, name, latitude, longitude, radius
            FROM locations
            WHERE id = $1 AND is_active = true
        `, [payload.lid]);

        const location = locationResult.rows[0];

        if (!location) {
            return res.status(400).json({
                success: false,
                error: 'Location not found or inactive'
            });
        }

        // ==========================================
        // STEP 5: Check for active session
        // ==========================================
        let session;

        if (payload.sid) {
            // Use session from QR if available
            const sessionResult = await db.query(`
                SELECT id, subject FROM sessions 
                WHERE id = $1 AND is_active = true
            `, [payload.sid]);
            session = sessionResult.rows[0];
        }

        if (!session) {
            // Fallback: find any active session at location
            const sessionResult = await db.query(`
                SELECT id, subject FROM sessions 
                WHERE location_id = $1 AND is_active = true
                ORDER BY start_time DESC LIMIT 1
            `, [payload.lid]);
            session = sessionResult.rows[0];
        }

        if (!session) {
            return res.status(400).json({
                success: false,
                error: 'No active attendance session at this location'
            });
        }

        // ==========================================
        // STEP 6: Check duplicate attendance
        // ==========================================
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

        // ==========================================
        // STEP 7: Validate GPS location
        // ==========================================
        const gpsCheck = isWithinRadius(
            latitude, longitude,
            parseFloat(location.latitude), parseFloat(location.longitude),
            location.radius
        );

        if (!gpsCheck.isWithin) {
            console.log(`❌ GPS validation failed for student ${studentId}: ${gpsCheck.distance}m away`);

            // Log failed attempt
            await logDeviceActivity(payload.did, 'scan_rejected', {
                studentId,
                reason: 'gps_out_of_range',
                distance: gpsCheck.distance,
                maxRadius: location.radius
            }, ipAddress);

            return res.status(400).json({
                success: false,
                error: `You are too far from the classroom (${gpsCheck.distance}m away, max ${location.radius}m allowed)`
            });
        }

        // ==========================================
        // STEP 8: Mark attendance
        // ==========================================
        await db.query(`
            INSERT INTO attendance_logs 
            (student_id, session_id, location_id, device_id, latitude, longitude, distance_from_device, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'present')
        `, [studentId, session.id, location.id, payload.did, latitude, longitude, gpsCheck.distance]);

        // Log successful scan
        await logDeviceActivity(payload.did, 'scan_success', {
            studentId,
            sessionId: session.id,
            distance: gpsCheck.distance
        }, ipAddress);

        console.log(`✅ Attendance marked: Student ${studentId} at ${location.name}`);

        res.json({
            success: true,
            message: 'Attendance marked successfully!',
            attendance: {
                location: location.name,
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
 * POST /api/attendance/scan
 * Alternative endpoint name for marking attendance
 */
router.post('/scan', authenticate, isStudent, scanRateLimit, [
    body('qr').trim().notEmpty(),
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 })
], async (req, res) => {
    // Extract fields
    const { qr, lat, lng } = req.body;

    // Validate inputs
    if (!qr || !lat || !lng) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: qr, lat, lng'
        });
    }

    const { token, latitude, longitude } = {
        token: qr,
        latitude: lat,
        longitude: lng
    };
    const studentId = req.user.id;
    const ipAddress = getClientIp(req);

    try {
        const verification = verifyQRContent(token);

        if (!verification.valid) {
            return res.status(400).json({
                success: false,
                error: verification.error || 'Invalid QR code'
            });
        }

        const payload = verification.payload;

        if (!validateTimestamp(payload.ts, 30000)) {
            return res.status(400).json({
                success: false,
                error: 'QR code has expired'
            });
        }

        const nonceValid = await validateAndConsumeNonce(payload.nonce, payload.did);
        if (!nonceValid) {
            return res.status(400).json({
                success: false,
                error: 'QR code already used'
            });
        }

        // Get location
        const locationResult = await db.query(
            'SELECT * FROM locations WHERE id = $1',
            [payload.lid]
        );
        const location = locationResult.rows[0];

        if (!location) {
            return res.status(400).json({ success: false, error: 'Location not found' });
        }

        // Get session
        const sessionResult = await db.query(`
            SELECT id, subject FROM sessions 
            WHERE location_id = $1 AND is_active = true LIMIT 1
        `, [payload.lid]);
        const session = sessionResult.rows[0];

        if (!session) {
            return res.status(400).json({ success: false, error: 'No active session' });
        }

        // Check duplicate
        const existing = await db.query(
            'SELECT id FROM attendance_logs WHERE student_id = $1 AND session_id = $2',
            [studentId, session.id]
        );
        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Already marked' });
        }

        // GPS check
        const gpsCheck = isWithinRadius(
            latitude, longitude,
            parseFloat(location.latitude), parseFloat(location.longitude),
            location.radius
        );

        if (!gpsCheck.isWithin) {
            return res.status(400).json({
                success: false,
                error: `Too far: ${gpsCheck.distance}m (max ${location.radius}m)`
            });
        }

        // Mark
        await db.query(`
            INSERT INTO attendance_logs 
            (student_id, session_id, location_id, device_id, latitude, longitude, distance_from_device, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'present')
        `, [studentId, session.id, location.id, payload.did, latitude, longitude, gpsCheck.distance]);

        res.json({
            success: true,
            message: 'Attendance marked!',
            attendance: {
                location: location.name,
                subject: session.subject,
                distance: gpsCheck.distance
            }
        });

    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ success: false, error: 'Failed to mark attendance' });
    }
});

/**
 * GET /api/attendance/my
 * Get student's attendance records
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
 * Get attendance for a specific session
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
                al.latitude, al.longitude,
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

/**
 * GET /api/attendance/stats
 * Get attendance statistics for current user
 */
router.get('/stats', authenticate, async (req, res) => {
    try {
        const userId = req.user.id;
        const role = req.user.role;

        if (role === 'student') {
            const result = await db.query(`
                SELECT 
                    COUNT(*) as total_sessions,
                    COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
                    COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count,
                    COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count
                FROM attendance_logs
                WHERE student_id = $1
            `, [userId]);

            res.json({
                success: true,
                stats: result.rows[0]
            });
        } else {
            // Faculty/Admin stats
            const result = await db.query(`
                SELECT 
                    COUNT(DISTINCT s.id) as total_sessions,
                    COUNT(al.id) as total_attendance,
                    COUNT(DISTINCT al.student_id) as unique_students
                FROM sessions s
                LEFT JOIN attendance_logs al ON s.id = al.session_id
                WHERE s.faculty_id = $1
            `, [userId]);

            res.json({
                success: true,
                stats: result.rows[0]
            });
        }

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

module.exports = router;
