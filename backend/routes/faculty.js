/**
 * Faculty Routes - Production Grade
 * Dashboard, Attendance, Reports for Faculty Members
 */
const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty, isFacultyOrAdmin } = require('../middleware/roleCheck');

const router = express.Router();

// =========================================
// FACULTY DASHBOARD
// =========================================

/**
 * GET /api/faculty/dashboard
 * Faculty overview with session stats and recent activity
 */
router.get('/dashboard', authenticate, isFaculty, async (req, res) => {
    const facultyId = req.user.id;

    try {
        // 1. Faculty profile
        const profileResult = await db.query(
            `SELECT id, name, email, created_at FROM users WHERE id = $1`,
            [facultyId]
        );
        const profile = profileResult.rows[0];

        // 2. Session statistics
        const sessionStats = await db.query(`
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN is_active = true THEN 1 END) as active_sessions,
                COUNT(CASE WHEN DATE(start_time) = CURRENT_DATE THEN 1 END) as today_sessions,
                COUNT(CASE WHEN DATE(start_time) >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as week_sessions
            FROM sessions
            WHERE faculty_id = $1
        `, [facultyId]);

        // 3. Attendance statistics
        const attendanceStats = await db.query(`
            SELECT 
                COUNT(DISTINCT al.student_id) as unique_students,
                COUNT(al.id) as total_attendance,
                AVG(al.distance_from_device) as avg_distance,
                COUNT(CASE WHEN al.status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN al.status = 'late' THEN 1 END) as late_count
            FROM attendance_logs al
            JOIN sessions s ON al.session_id = s.id
            WHERE s.faculty_id = $1
        `, [facultyId]);

        // 4. Active session details (if any)
        const activeSessionResult = await db.query(`
            SELECT 
                s.id, s.subject, s.start_time, s.expected_students,
                l.name as location_name,
                (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            WHERE s.faculty_id = $1 AND s.is_active = true
            ORDER BY s.start_time DESC
            LIMIT 1
        `, [facultyId]);

        // 5. Recent sessions
        const recentSessions = await db.query(`
            SELECT 
                s.id, s.subject, s.start_time, s.end_time, s.is_active, s.expected_students,
                l.name as location_name,
                (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            WHERE s.faculty_id = $1
            ORDER BY s.start_time DESC
            LIMIT 5
        `, [facultyId]);

        // 6. Available locations for starting new sessions
        const locationsResult = await db.query(`
            SELECT id, name, latitude, longitude, radius
            FROM locations
            WHERE is_active = true
            ORDER BY name
        `);

        const stats = sessionStats.rows[0];
        const attendance = attendanceStats.rows[0];

        res.json({
            success: true,
            dashboard: {
                profile: {
                    name: profile.name,
                    email: profile.email,
                    memberSince: profile.created_at
                },
                stats: {
                    totalSessions: parseInt(stats.total_sessions) || 0,
                    activeSessions: parseInt(stats.active_sessions) || 0,
                    todaySessions: parseInt(stats.today_sessions) || 0,
                    weekSessions: parseInt(stats.week_sessions) || 0,
                    uniqueStudents: parseInt(attendance.unique_students) || 0,
                    totalAttendance: parseInt(attendance.total_attendance) || 0,
                    avgDistance: parseFloat(attendance.avg_distance) || 0,
                    presentCount: parseInt(attendance.present_count) || 0,
                    lateCount: parseInt(attendance.late_count) || 0
                },
                activeSession: activeSessionResult.rows[0] || null,
                recentSessions: recentSessions.rows.map(s => ({
                    id: s.id,
                    subject: s.subject,
                    location: s.location_name,
                    startTime: s.start_time,
                    endTime: s.end_time,
                    isActive: s.is_active,
                    expectedStudents: s.expected_students || 60,
                    attendanceCount: parseInt(s.attendance_count)
                })),
                locations: locationsResult.rows
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Faculty dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard'
        });
    }
});

// =========================================
// FACULTY ATTENDANCE
// =========================================

/**
 * GET /api/faculty/attendance
 * Attendance records for faculty's sessions
 */
router.get('/attendance', authenticate, isFaculty, async (req, res) => {
    const facultyId = req.user.id;
    const { sessionId, date, status, limit = 50, offset = 0 } = req.query;

    try {
        let query = `
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                u.name as student_name, u.student_id, u.email as student_email,
                s.id as session_id, s.subject,
                l.name as location_name
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            JOIN sessions s ON al.session_id = s.id
            JOIN locations l ON s.location_id = l.id
            WHERE s.faculty_id = $1
        `;
        const params = [facultyId];
        let paramCount = 1;

        if (sessionId) {
            paramCount++;
            query += ` AND s.id = $${paramCount}`;
            params.push(sessionId);
        }

        if (date) {
            paramCount++;
            query += ` AND DATE(al.marked_at) = $${paramCount}`;
            params.push(date);
        }

        if (status) {
            paramCount++;
            query += ` AND al.status = $${paramCount}`;
            params.push(status);
        }

        query += ` ORDER BY al.marked_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get total count
        let countQuery = `
            SELECT COUNT(*) 
            FROM attendance_logs al
            JOIN sessions s ON al.session_id = s.id
            WHERE s.faculty_id = $1
        `;
        const countParams = [facultyId];
        if (sessionId) countQuery += ` AND s.id = $2`;
        if (sessionId) countParams.push(sessionId);

        const countResult = await db.query(countQuery, countParams);

        res.json({
            success: true,
            records: result.rows.map(r => ({
                id: r.id,
                markedAt: r.marked_at,
                status: r.status,
                distance: parseFloat(r.distance_from_device) || null,
                student: {
                    name: r.student_name,
                    studentId: r.student_id,
                    email: r.student_email
                },
                session: {
                    id: r.session_id,
                    subject: r.subject
                },
                location: r.location_name
            })),
            pagination: {
                total: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Faculty attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance'
        });
    }
});

/**
 * GET /api/faculty/attendance/session/:id
 * Detailed attendance for a specific session
 */
router.get('/attendance/session/:id', authenticate, isFacultyOrAdmin, async (req, res) => {
    const sessionId = req.params.id;

    try {
        // Verify session belongs to faculty (unless admin)
        if (req.user.role === 'faculty') {
            const sessionCheck = await db.query(
                'SELECT faculty_id FROM sessions WHERE id = $1',
                [sessionId]
            );
            if (sessionCheck.rows.length === 0 || sessionCheck.rows[0].faculty_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
        }

        // Session info
        const sessionResult = await db.query(`
            SELECT s.*, l.name as location_name, u.name as faculty_name
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            JOIN users u ON s.faculty_id = u.id
            WHERE s.id = $1
        `, [sessionId]);

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        // Attendance records
        const attendanceResult = await db.query(`
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                u.id as student_id, u.name as student_name, u.student_id as student_code, u.email
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            WHERE al.session_id = $1
            ORDER BY al.marked_at ASC
        `, [sessionId]);

        // Summary stats
        const present = attendanceResult.rows.filter(r => r.status === 'present').length;
        const late = attendanceResult.rows.filter(r => r.status === 'late').length;
        const total = attendanceResult.rows.length;

        const session = sessionResult.rows[0];

        res.json({
            success: true,
            session: {
                id: session.id,
                subject: session.subject,
                location: session.location_name,
                faculty: session.faculty_name,
                startTime: session.start_time,
                endTime: session.end_time,
                isActive: session.is_active,
                expectedStudents: session.expected_students || 60
            },
            summary: {
                total,
                present,
                late,
                absent: 0, // Would need enrollment data
                percentage: total > 0 ? Math.round((present + late) / total * 100) : 0
            },
            attendance: attendanceResult.rows.map(r => ({
                id: r.id,
                student: {
                    id: r.student_id,
                    name: r.student_name,
                    studentId: r.student_code,
                    email: r.email
                },
                markedAt: r.marked_at,
                status: r.status,
                distance: parseFloat(r.distance_from_device) || null
            }))
        });

    } catch (error) {
        console.error('Faculty session attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session attendance'
        });
    }
});

// =========================================
// FACULTY SESSIONS LIST
// =========================================

/**
 * GET /api/faculty/sessions
 * All sessions for logged-in faculty (for reports dropdown)
 */
router.get('/sessions', authenticate, isFaculty, async (req, res) => {
    const facultyId = req.user.id;

    try {
        const result = await db.query(`
            SELECT 
                s.id as session_id, s.subject, s.start_time, s.end_time,
                s.is_active, s.expected_students,
                l.name as location_name
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            WHERE s.faculty_id = $1
            ORDER BY s.start_time DESC
        `, [facultyId]);

        const now = new Date();
        const sessions = result.rows.map(s => {
            const startTime = new Date(s.start_time);
            const endTime = s.end_time ? new Date(s.end_time) : null;

            let status = 'completed';
            if (s.is_active) {
                status = startTime > now ? 'upcoming' : 'live';
            } else if (!endTime || endTime > now) {
                if (startTime > now) status = 'upcoming';
            }

            return {
                session_id: s.session_id,
                subject: s.subject,
                date: s.start_time,
                start_time: s.start_time,
                end_time: s.end_time,
                location_name: s.location_name,
                expected_students: s.expected_students || 60,
                status
            };
        });

        res.json({ success: true, sessions });

    } catch (error) {
        console.error('Faculty sessions list error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sessions',
            code: 'DB_ERROR'
        });
    }
});

// =========================================
// FACULTY STUDENTS
// =========================================

/**
 * GET /api/faculty/students
 * Students who have attended faculty's sessions
 */
router.get('/students', authenticate, isFaculty, async (req, res) => {
    const facultyId = req.user.id;

    try {
        const result = await db.query(`
            SELECT DISTINCT
                u.id, u.name, u.student_id, u.email, u.is_active,
                COUNT(al.id) as attendance_count,
                MAX(al.marked_at) as last_attendance
            FROM users u
            JOIN attendance_logs al ON u.id = al.student_id
            JOIN sessions s ON al.session_id = s.id
            WHERE s.faculty_id = $1 AND u.role = 'student'
            GROUP BY u.id, u.name, u.student_id, u.email, u.is_active
            ORDER BY last_attendance DESC
        `, [facultyId]);

        res.json({
            success: true,
            students: result.rows.map(r => ({
                id: r.id,
                name: r.name,
                studentId: r.student_id,
                email: r.email,
                isActive: r.is_active,
                attendanceCount: parseInt(r.attendance_count),
                lastAttendance: r.last_attendance
            })),
            count: result.rows.length
        });

    } catch (error) {
        console.error('Faculty students error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch students'
        });
    }
});

module.exports = router;
