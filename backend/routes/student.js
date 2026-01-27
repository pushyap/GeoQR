/**
 * Student Routes - Production Grade
 * Dashboard, Statistics, Profile Management
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isStudent } = require('../middleware/roleCheck');

const router = express.Router();

// =========================================
// STUDENT DASHBOARD
// =========================================

/**
 * GET /api/student/dashboard
 * Load complete dashboard data for student
 */
router.get('/dashboard', authenticate, isStudent, async (req, res) => {
    const studentId = req.user.id;

    try {
        // 1. Profile data
        const profileResult = await db.query(
            `SELECT id, name, email, student_id, created_at 
             FROM users WHERE id = $1`,
            [studentId]
        );
        const profile = profileResult.rows[0];

        // 2. Attendance summary
        const summaryResult = await db.query(`
            SELECT 
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN status = 'present' THEN 1 END) as present_count,
                COUNT(CASE WHEN status = 'late' THEN 1 END) as late_count,
                COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent_count,
                ROUND(
                    COUNT(CASE WHEN status = 'present' THEN 1 END)::DECIMAL / 
                    NULLIF(COUNT(*), 0) * 100, 1
                ) as attendance_percentage
            FROM attendance_logs
            WHERE student_id = $1
        `, [studentId]);
        const summary = summaryResult.rows[0];

        // 3. Today's sessions (attended)
        const todayResult = await db.query(`
            SELECT 
                al.marked_at, al.status, al.distance_from_device,
                l.name as location_name,
                s.subject, s.start_time
            FROM attendance_logs al
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            WHERE al.student_id = $1 
            AND DATE(al.marked_at) = CURRENT_DATE
            ORDER BY al.marked_at DESC
        `, [studentId]);

        // 4. Recent activity (last 5)
        const recentResult = await db.query(`
            SELECT 
                al.marked_at, al.status,
                l.name as location_name,
                s.subject
            FROM attendance_logs al
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            WHERE al.student_id = $1
            ORDER BY al.marked_at DESC
            LIMIT 5
        `, [studentId]);

        // 5. Active sessions available for scanning
        const activeSessionsResult = await db.query(`
            SELECT 
                s.id, s.subject, s.start_time,
                l.name as location_name,
                u.name as faculty_name,
                NOT EXISTS (
                    SELECT 1 FROM attendance_logs 
                    WHERE student_id = $1 AND session_id = s.id
                ) as can_mark
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            JOIN users u ON s.faculty_id = u.id
            WHERE s.is_active = true
            ORDER BY s.start_time DESC
        `, [studentId]);

        // 6. Achievements / Streaks
        const streakResult = await db.query(`
            WITH daily_attendance AS (
                SELECT DATE(marked_at) as attend_date
                FROM attendance_logs
                WHERE student_id = $1 AND status = 'present'
                GROUP BY DATE(marked_at)
                ORDER BY DATE(marked_at) DESC
            ),
            streak AS (
                SELECT COUNT(*) as current_streak
                FROM (
                    SELECT attend_date,
                           attend_date - (ROW_NUMBER() OVER (ORDER BY attend_date DESC))::int as grp
                    FROM daily_attendance
                ) t
                WHERE grp = (SELECT attend_date - 1 FROM daily_attendance LIMIT 1)
                   OR attend_date = CURRENT_DATE
            )
            SELECT COALESCE(current_streak, 0) as current_streak FROM streak
        `, [studentId]);

        res.json({
            success: true,
            dashboard: {
                profile: {
                    name: profile.name,
                    email: profile.email,
                    studentId: profile.student_id,
                    memberSince: profile.created_at
                },
                summary: {
                    totalSessions: parseInt(summary.total_sessions) || 0,
                    presentCount: parseInt(summary.present_count) || 0,
                    lateCount: parseInt(summary.late_count) || 0,
                    absentCount: parseInt(summary.absent_count) || 0,
                    attendancePercentage: parseFloat(summary.attendance_percentage) || 0
                },
                today: {
                    sessions: todayResult.rows,
                    count: todayResult.rows.length
                },
                recentActivity: recentResult.rows,
                activeSessions: activeSessionsResult.rows,
                achievements: {
                    currentStreak: parseInt(streakResult.rows[0]?.current_streak) || 0
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Student dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard'
        });
    }
});

// =========================================
// STUDENT STATISTICS
// =========================================

/**
 * GET /api/student/statistics
 * Detailed attendance analytics
 */
router.get('/statistics', authenticate, isStudent, async (req, res) => {
    const studentId = req.user.id;

    try {
        // 1. Overall statistics
        const overallResult = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'present' THEN 1 END) as present,
                COUNT(CASE WHEN status = 'late' THEN 1 END) as late,
                COUNT(CASE WHEN status = 'absent' THEN 1 END) as absent,
                ROUND(AVG(distance_from_device), 1) as avg_distance
            FROM attendance_logs
            WHERE student_id = $1
        `, [studentId]);

        // 2. Subject-wise breakdown
        const subjectResult = await db.query(`
            SELECT 
                COALESCE(s.subject, 'General') as subject,
                COUNT(*) as sessions,
                COUNT(CASE WHEN al.status = 'present' THEN 1 END) as present,
                ROUND(
                    COUNT(CASE WHEN al.status = 'present' THEN 1 END)::DECIMAL / 
                    NULLIF(COUNT(*), 0) * 100, 1
                ) as percentage
            FROM attendance_logs al
            LEFT JOIN sessions s ON al.session_id = s.id
            WHERE al.student_id = $1
            GROUP BY s.subject
            ORDER BY sessions DESC
        `, [studentId]);

        // 3. Monthly trend (last 6 months)
        const monthlyResult = await db.query(`
            SELECT 
                TO_CHAR(marked_at, 'YYYY-MM') as month,
                TO_CHAR(marked_at, 'Mon') as month_name,
                COUNT(*) as total,
                COUNT(CASE WHEN status = 'present' THEN 1 END) as present,
                ROUND(
                    COUNT(CASE WHEN status = 'present' THEN 1 END)::DECIMAL / 
                    NULLIF(COUNT(*), 0) * 100, 1
                ) as percentage
            FROM attendance_logs
            WHERE student_id = $1
            AND marked_at >= NOW() - INTERVAL '6 months'
            GROUP BY TO_CHAR(marked_at, 'YYYY-MM'), TO_CHAR(marked_at, 'Mon')
            ORDER BY month DESC
        `, [studentId]);

        // 4. Weekly pattern
        const weeklyResult = await db.query(`
            SELECT 
                EXTRACT(DOW FROM marked_at) as day_num,
                TO_CHAR(marked_at, 'Day') as day_name,
                COUNT(*) as count
            FROM attendance_logs
            WHERE student_id = $1 AND status = 'present'
            GROUP BY EXTRACT(DOW FROM marked_at), TO_CHAR(marked_at, 'Day')
            ORDER BY day_num
        `, [studentId]);

        // 5. Location breakdown
        const locationResult = await db.query(`
            SELECT 
                l.name as location,
                COUNT(*) as visits,
                ROUND(AVG(al.distance_from_device), 1) as avg_distance
            FROM attendance_logs al
            JOIN locations l ON al.location_id = l.id
            WHERE al.student_id = $1
            GROUP BY l.name
            ORDER BY visits DESC
            LIMIT 10
        `, [studentId]);

        // 6. Eligibility check (configurable threshold)
        const threshold = parseInt(process.env.ATTENDANCE_THRESHOLD) || 75;
        const overall = overallResult.rows[0];
        const percentage = overall.total > 0
            ? (parseInt(overall.present) / parseInt(overall.total)) * 100
            : 0;

        res.json({
            success: true,
            statistics: {
                overall: {
                    total: parseInt(overall.total) || 0,
                    present: parseInt(overall.present) || 0,
                    late: parseInt(overall.late) || 0,
                    absent: parseInt(overall.absent) || 0,
                    avgDistance: parseFloat(overall.avg_distance) || 0,
                    percentage: Math.round(percentage * 10) / 10
                },
                bySubject: subjectResult.rows.map(r => ({
                    subject: r.subject,
                    sessions: parseInt(r.sessions),
                    present: parseInt(r.present),
                    percentage: parseFloat(r.percentage) || 0
                })),
                monthlyTrend: monthlyResult.rows.map(r => ({
                    month: r.month,
                    monthName: r.month_name.trim(),
                    total: parseInt(r.total),
                    present: parseInt(r.present),
                    percentage: parseFloat(r.percentage) || 0
                })),
                weeklyPattern: weeklyResult.rows.map(r => ({
                    day: r.day_name.trim(),
                    count: parseInt(r.count)
                })),
                byLocation: locationResult.rows.map(r => ({
                    location: r.location,
                    visits: parseInt(r.visits),
                    avgDistance: parseFloat(r.avg_distance) || 0
                })),
                eligibility: {
                    threshold,
                    current: Math.round(percentage * 10) / 10,
                    isEligible: percentage >= threshold,
                    requiredMore: percentage < threshold
                        ? Math.ceil((threshold * parseInt(overall.total) / 100) - parseInt(overall.present))
                        : 0
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Student statistics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load statistics'
        });
    }
});

// =========================================
// STUDENT PROFILE
// =========================================

/**
 * GET /api/student/profile
 */
router.get('/profile', authenticate, isStudent, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, name, email, student_id, is_active, created_at, updated_at
             FROM users WHERE id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                studentId: user.student_id,
                isActive: user.is_active,
                createdAt: user.created_at,
                updatedAt: user.updated_at
            }
        });

    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch profile'
        });
    }
});

/**
 * PUT /api/student/profile
 * Update student profile (only allowed fields)
 */
router.put('/profile', authenticate, isStudent, [
    body('name').optional().trim().isLength({ min: 2, max: 100 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { name } = req.body;
    const studentId = req.user.id;

    // Security: Only name can be updated
    // email, student_id, role cannot be changed by student
    if (!name) {
        return res.status(400).json({
            success: false,
            error: 'No valid fields to update'
        });
    }

    try {
        const result = await db.query(
            `UPDATE users 
             SET name = $1, updated_at = NOW()
             WHERE id = $2
             RETURNING id, name, email, student_id`,
            [name, studentId]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: result.rows[0]
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

/**
 * GET /api/student/attendance
 * Get detailed attendance history
 */
router.get('/attendance', authenticate, isStudent, async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;

    try {
        const result = await db.query(`
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                al.latitude, al.longitude,
                l.name as location_name,
                s.subject, s.start_time as session_start,
                u.name as faculty_name
            FROM attendance_logs al
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            LEFT JOIN users u ON s.faculty_id = u.id
            WHERE al.student_id = $1
            ORDER BY al.marked_at DESC
            LIMIT $2 OFFSET $3
        `, [req.user.id, parseInt(limit), parseInt(offset)]);

        const countResult = await db.query(
            'SELECT COUNT(*) as total FROM attendance_logs WHERE student_id = $1',
            [req.user.id]
        );

        res.json({
            success: true,
            records: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].total)
            }
        });

    } catch (error) {
        console.error('Get attendance history error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance history'
        });
    }
});

module.exports = router;
