/**
 * Admin Routes for PostgreSQL
 */
const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');

const router = express.Router();

/**
 * GET /api/admin/users
 */
router.get('/users', authenticate, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT id, name, email, role, student_id, is_active, created_at
            FROM users
            ORDER BY created_at DESC
        `);

        res.json({
            success: true,
            users: result.rows
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users'
        });
    }
});

/**
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { is_active, role } = req.body;

        const result = await db.query(
            `UPDATE users 
             SET is_active = COALESCE($1, is_active),
                 role = COALESCE($2, role)
             WHERE id = $3 
             RETURNING id, name, email, role, student_id, is_active`,
            [is_active, role, req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

/**
 * GET /api/admin/attendance
 */
router.get('/attendance', authenticate, isAdmin, async (req, res) => {
    try {
        const { date, location_id, limit = 100 } = req.query;

        let query = `
            SELECT 
                al.*,
                u.name as student_name, u.student_id,
                l.name as location_name,
                s.subject
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (date) {
            query += ` AND DATE(al.marked_at) = $${paramIndex}`;
            params.push(date);
            paramIndex++;
        }

        if (location_id) {
            query += ` AND al.location_id = $${paramIndex}`;
            params.push(location_id);
            paramIndex++;
        }

        query += ` ORDER BY al.marked_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        res.json({
            success: true,
            logs: result.rows,
            count: result.rows.length
        });

    } catch (error) {
        console.error('Get attendance logs error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance logs'
        });
    }
});

/**
 * GET /api/admin/stats
 */
router.get('/stats', authenticate, isAdmin, async (req, res) => {
    try {
        const totalUsers = await db.query(
            'SELECT COUNT(*) as count FROM users WHERE is_active = true'
        );

        const usersByRole = await db.query(`
            SELECT role, COUNT(*) as count 
            FROM users WHERE is_active = true 
            GROUP BY role
        `);

        const totalDevices = await db.query(
            'SELECT COUNT(*) as count FROM devices WHERE is_active = true'
        );

        const totalLocations = await db.query(
            'SELECT COUNT(*) as count FROM locations WHERE is_active = true'
        );

        const activeSessions = await db.query(
            'SELECT COUNT(*) as count FROM sessions WHERE is_active = true'
        );

        const todayAttendance = await db.query(`
            SELECT COUNT(*) as count FROM attendance_logs 
            WHERE DATE(marked_at) = CURRENT_DATE
        `);

        res.json({
            success: true,
            stats: {
                totalUsers: parseInt(totalUsers.rows[0].count),
                usersByRole: Object.fromEntries(
                    usersByRole.rows.map(r => [r.role, parseInt(r.count)])
                ),
                totalDevices: parseInt(totalDevices.rows[0].count),
                totalLocations: parseInt(totalLocations.rows[0].count),
                activeSessions: parseInt(activeSessions.rows[0].count),
                todayAttendance: parseInt(todayAttendance.rows[0].count)
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics'
        });
    }
});

module.exports = router;
