/**
 * Admin Routes - Production Grade
 * Dashboard, Reports, Suspicious Activity Detection, User Management
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const { logDeviceActivity } = require('../utils/security');

const router = express.Router();

// =========================================
// ADMIN DASHBOARD
// =========================================

/**
 * GET /api/admin/dashboard
 * Comprehensive system dashboard
 */
router.get('/dashboard', authenticate, isAdmin, async (req, res) => {
    try {
        // 1. System metrics
        const metricsResult = await db.query(`
            SELECT
                (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
                (SELECT COUNT(*) FROM users WHERE role = 'student' AND is_active = true) as students,
                (SELECT COUNT(*) FROM users WHERE role = 'faculty' AND is_active = true) as faculty,
                (SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active = true) as admins,
                (SELECT COUNT(*) FROM devices WHERE is_active = true) as active_devices,
                (SELECT COUNT(*) FROM locations WHERE is_active = true) as locations,
                (SELECT COUNT(*) FROM sessions WHERE is_active = true) as active_sessions,
                (SELECT COUNT(*) FROM attendance_logs WHERE DATE(marked_at) = CURRENT_DATE) as today_attendance
        `);

        // 2. Device status
        const devicesResult = await db.query(`
            SELECT 
                d.id, d.device_code, d.device_name, d.is_active,
                d.last_active,
                l.name as location_name,
                CASE 
                    WHEN d.last_active > NOW() - INTERVAL '5 minutes' THEN 'online'
                    WHEN d.last_active > NOW() - INTERVAL '1 hour' THEN 'idle'
                    ELSE 'offline'
                END as status
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.is_active = true
            ORDER BY d.last_active DESC NULLS LAST
        `);

        // 3. Active sessions with live stats
        const sessionsResult = await db.query(`
            SELECT 
                s.id, s.subject, s.start_time,
                l.name as location_name,
                u.name as faculty_name,
                (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            JOIN users u ON s.faculty_id = u.id
            WHERE s.is_active = true
            ORDER BY s.start_time DESC
        `);

        // 4. Recent activity
        const recentResult = await db.query(`
            SELECT 
                al.marked_at,
                u.name as student_name,
                l.name as location_name,
                s.subject
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            ORDER BY al.marked_at DESC
            LIMIT 10
        `);

        // 5. Weekly trend
        const weeklyResult = await db.query(`
            SELECT 
                DATE(marked_at) as date,
                COUNT(*) as count
            FROM attendance_logs
            WHERE marked_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(marked_at)
            ORDER BY date
        `);

        // 6. Suspicious activity count
        const suspiciousResult = await db.query(`
            SELECT COUNT(*) as count
            FROM device_activity_logs
            WHERE action IN ('scan_rejected', 'auth_failed', 'suspicious')
            AND created_at >= NOW() - INTERVAL '24 hours'
        `);

        const metrics = metricsResult.rows[0];

        res.json({
            success: true,
            dashboard: {
                metrics: {
                    totalUsers: parseInt(metrics.total_users),
                    students: parseInt(metrics.students),
                    faculty: parseInt(metrics.faculty),
                    admins: parseInt(metrics.admins),
                    activeDevices: parseInt(metrics.active_devices),
                    locations: parseInt(metrics.locations),
                    activeSessions: parseInt(metrics.active_sessions),
                    todayAttendance: parseInt(metrics.today_attendance)
                },
                devices: devicesResult.rows,
                activeSessions: sessionsResult.rows,
                recentActivity: recentResult.rows,
                weeklyTrend: weeklyResult.rows.map(r => ({
                    date: r.date,
                    count: parseInt(r.count)
                })),
                alerts: {
                    suspiciousActivity: parseInt(suspiciousResult.rows[0].count)
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load dashboard'
        });
    }
});

// =========================================
// USER MANAGEMENT
// =========================================

/**
 * GET /api/admin/users
 */
router.get('/users', authenticate, isAdmin, async (req, res) => {
    try {
        const { role, search, limit = 100 } = req.query;

        let query = `
            SELECT id, name, email, role, student_id, is_active, created_at,
                (SELECT COUNT(*) FROM attendance_logs WHERE student_id = users.id) as attendance_count
            FROM users
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (role) {
            query += ` AND role = $${paramIndex}`;
            params.push(role);
            paramIndex++;
        }

        if (search) {
            query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR student_id ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
        params.push(parseInt(limit));

        const result = await db.query(query, params);

        res.json({
            success: true,
            users: result.rows,
            count: result.rows.length
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
 * POST /api/admin/users
 * Create new user (including admin)
 */
router.post('/users', authenticate, isAdmin, [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['student', 'faculty', 'admin']),
    body('studentId').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { name, email, password, role, studentId } = req.body;

    try {
        // Check if email exists
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Email already exists'
            });
        }

        const passwordHash = bcrypt.hashSync(password, 12);

        const result = await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, role, student_id, is_active, created_at`,
            [name, email, passwordHash, role, role === 'student' ? studentId : null]
        );

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: result.rows[0]
        });

        await logDeviceActivity(null, 'user_created', {
            email: result.rows[0].email,
            role: result.rows[0].role,
            by: req.user.id
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create user'
        });
    }
});

/**
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const { is_active, role, name } = req.body;

        // Prevent self-deactivation
        if (req.user.id === parseInt(req.params.id) && is_active === false) {
            return res.status(400).json({
                success: false,
                error: 'You cannot deactivate your own account'
            });
        }

        const result = await db.query(
            `UPDATE users 
             SET is_active = COALESCE($1, is_active),
                 role = COALESCE($2, role),
                 name = COALESCE($3, name),
                 updated_at = NOW()
             WHERE id = $4 
             RETURNING id, name, email, role, student_id, is_active`,
            [is_active, role, name, req.params.id]
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

        await logDeviceActivity(null, 'user_updated', {
            target_id: req.params.id,
            updates: { is_active, role, name },
            by: req.user.id
        });

    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update user'
        });
    }
});

// =========================================
// REPORTS
// =========================================

/**
 * GET /api/admin/reports
 * Generate attendance reports
 */
router.get('/reports', authenticate, isAdmin, async (req, res) => {
    const { type = 'daily', date, startDate, endDate, locationId, format = 'json' } = req.query;

    try {
        let result;

        switch (type) {
            case 'daily':
                const reportDate = date || new Date().toISOString().split('T')[0];
                result = await db.query(`
                    SELECT 
                        al.marked_at, al.status, al.distance_from_device,
                        u.name as student_name, u.student_id, u.email,
                        l.name as location_name,
                        s.subject, s.start_time,
                        f.name as faculty_name
                    FROM attendance_logs al
                    JOIN users u ON al.student_id = u.id
                    JOIN locations l ON al.location_id = l.id
                    LEFT JOIN sessions s ON al.session_id = s.id
                    LEFT JOIN users f ON s.faculty_id = f.id
                    WHERE DATE(al.marked_at) = $1
                    ORDER BY al.marked_at
                `, [reportDate]);
                break;

            case 'student':
                result = await db.query(`
                    SELECT 
                        u.id, u.name, u.student_id, u.email,
                        COUNT(al.id) as total_sessions,
                        COUNT(CASE WHEN al.status = 'present' THEN 1 END) as present,
                        COUNT(CASE WHEN al.status = 'late' THEN 1 END) as late,
                        ROUND(
                            COUNT(CASE WHEN al.status = 'present' THEN 1 END)::DECIMAL / 
                            NULLIF(COUNT(al.id), 0) * 100, 1
                        ) as percentage
                    FROM users u
                    LEFT JOIN attendance_logs al ON u.id = al.student_id
                    WHERE u.role = 'student' AND u.is_active = true
                    GROUP BY u.id, u.name, u.student_id, u.email
                    ORDER BY percentage DESC NULLS LAST
                `);
                break;

            case 'session':
                result = await db.query(`
                    SELECT 
                        s.id, s.subject, s.start_time, s.end_time,
                        l.name as location_name,
                        u.name as faculty_name,
                        COUNT(al.id) as attendance_count,
                        s.is_active
                    FROM sessions s
                    JOIN locations l ON s.location_id = l.id
                    JOIN users u ON s.faculty_id = u.id
                    LEFT JOIN attendance_logs al ON s.id = al.session_id
                    WHERE ($1::date IS NULL OR DATE(s.start_time) >= $1::date)
                    AND ($2::date IS NULL OR DATE(s.start_time) <= $2::date)
                    GROUP BY s.id, l.name, u.name
                    ORDER BY s.start_time DESC
                `, [startDate || null, endDate || null]);
                break;

            case 'device':
                result = await db.query(`
                    SELECT 
                        d.id, d.device_code, d.device_name, d.last_active,
                        l.name as location_name,
                        COUNT(al.id) as total_scans,
                        COUNT(DISTINCT al.student_id) as unique_students
                    FROM devices d
                    LEFT JOIN locations l ON d.location_id = l.id
                    LEFT JOIN attendance_logs al ON d.id = al.device_id
                    WHERE d.is_active = true
                    GROUP BY d.id, l.name
                    ORDER BY total_scans DESC
                `);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid report type'
                });
        }

        res.json({
            success: true,
            report: {
                type,
                generatedAt: new Date().toISOString(),
                data: result.rows,
                count: result.rows.length
            }
        });

    } catch (error) {
        console.error('Generate report error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate report'
        });
    }
});

// =========================================
// SUSPICIOUS ACTIVITY DETECTION
// =========================================

/**
 * GET /api/admin/suspicious
 * Get suspicious activity logs
 */
router.get('/suspicious', authenticate, isAdmin, async (req, res) => {
    try {
        // 1. Recent suspicious device activity
        const deviceActivityResult = await db.query(`
            SELECT 
                dal.id, dal.action, dal.details, dal.ip_address, dal.created_at,
                d.device_code, d.device_name
            FROM device_activity_logs dal
            LEFT JOIN devices d ON dal.device_id = d.id
            WHERE dal.action IN ('scan_rejected', 'auth_failed', 'suspicious', 'qr_expired')
            ORDER BY dal.created_at DESC
            LIMIT 50
        `);

        // 2. Rapid scan detection (multiple scans from same IP in short time)
        const rapidScansResult = await db.query(`
            SELECT 
                ip_address,
                COUNT(*) as scan_count,
                MIN(created_at) as first_scan,
                MAX(created_at) as last_scan
            FROM device_activity_logs
            WHERE action = 'scan_success'
            AND created_at >= NOW() - INTERVAL '10 minutes'
            GROUP BY ip_address
            HAVING COUNT(*) > 5
        `);

        // 3. GPS anomaly detection (large distance variations)
        const gpsAnomalyResult = await db.query(`
            SELECT 
                u.name as student_name, u.student_id,
                l.name as location_name,
                al.distance_from_device,
                al.marked_at
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            JOIN locations l ON al.location_id = l.id
            WHERE al.distance_from_device > 40
            AND al.marked_at >= NOW() - INTERVAL '24 hours'
            ORDER BY al.distance_from_device DESC
            LIMIT 20
        `);

        // 4. Failed login attempts
        const failedLoginsResult = await db.query(`
            SELECT 
                details->>'device_code' as device_code,
                details->>'reason' as reason,
                ip_address,
                created_at
            FROM device_activity_logs
            WHERE action = 'auth_failed'
            AND created_at >= NOW() - INTERVAL '24 hours'
            ORDER BY created_at DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            suspicious: {
                deviceActivity: deviceActivityResult.rows,
                rapidScans: rapidScansResult.rows,
                gpsAnomalies: gpsAnomalyResult.rows,
                failedLogins: failedLoginsResult.rows,
                summary: {
                    totalAlerts: deviceActivityResult.rows.length,
                    rapidScanIPs: rapidScansResult.rows.length,
                    gpsAnomalies: gpsAnomalyResult.rows.length,
                    failedLogins: failedLoginsResult.rows.length
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Suspicious activity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch suspicious activity'
        });
    }
});

// =========================================
// ATTENDANCE LOGS
// =========================================

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

// =========================================
// ACTIVITY LOG
// =========================================

/**
 * GET /api/admin/activity
 * System activity log with filters
 */
router.get('/activity', authenticate, isAdmin, async (req, res) => {
    const { type, limit = 50, offset = 0 } = req.query;

    try {
        let query = `
            SELECT 
                dal.id, dal.device_id, dal.action, dal.details, dal.created_at,
                d.device_code, d.device_name
            FROM device_activity_logs dal
            LEFT JOIN devices d ON dal.device_id = d.id
        `;
        const params = [];
        let paramCount = 0;

        if (type) {
            paramCount++;
            query += ` WHERE dal.action = $${paramCount}`;
            params.push(type);
        }

        query += ` ORDER BY dal.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get count
        let countQuery = 'SELECT COUNT(*) FROM device_activity_logs';
        if (type) countQuery += ` WHERE action = $1`;
        const countResult = await db.query(countQuery, type ? [type] : []);

        // Also include recent attendance as activity
        const attendanceActivity = await db.query(`
            SELECT 
                al.id, al.marked_at, al.status,
                u.name as student_name,
                l.name as location_name,
                s.subject
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            LEFT JOIN sessions s ON al.session_id = s.id
            LEFT JOIN locations l ON al.location_id = l.id
            ORDER BY al.marked_at DESC
            LIMIT 20
        `);

        res.json({
            success: true,
            activity: {
                deviceLogs: result.rows.map(r => ({
                    id: r.id,
                    deviceId: r.device_id,
                    deviceCode: r.device_code,
                    deviceName: r.device_name,
                    action: r.action,
                    details: r.details,
                    timestamp: r.created_at
                })),
                recentAttendance: attendanceActivity.rows.map(r => ({
                    id: r.id,
                    studentName: r.student_name,
                    location: r.location_name,
                    subject: r.subject,
                    status: r.status,
                    timestamp: r.marked_at
                }))
            },
            pagination: {
                total: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Get activity log error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch activity log'
        });
    }
});

// =========================================
// ATTENDANCE MANAGEMENT
// =========================================

/**
 * GET /api/admin/attendance
 * All attendance records with filters
 */
router.get('/attendance', authenticate, isAdmin, async (req, res) => {
    const { date, locationId, sessionId, studentId, status, limit = 50, offset = 0 } = req.query;

    try {
        let query = `
            SELECT 
                al.id, al.marked_at, al.status, al.distance_from_device,
                al.device_verified, al.location_verified,
                u.id as student_id, u.name as student_name, u.student_id as student_code, u.email,
                l.name as location_name, l.id as location_id,
                s.id as session_id, s.subject,
                f.name as faculty_name
            FROM attendance_logs al
            JOIN users u ON al.student_id = u.id
            LEFT JOIN locations l ON al.location_id = l.id
            LEFT JOIN sessions s ON al.session_id = s.id
            LEFT JOIN users f ON s.faculty_id = f.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (date) {
            paramCount++;
            query += ` AND DATE(al.marked_at) = $${paramCount}`;
            params.push(date);
        }

        if (locationId) {
            paramCount++;
            query += ` AND al.location_id = $${paramCount}`;
            params.push(locationId);
        }

        if (sessionId) {
            paramCount++;
            query += ` AND al.session_id = $${paramCount}`;
            params.push(sessionId);
        }

        if (studentId) {
            paramCount++;
            query += ` AND al.student_id = $${paramCount}`;
            params.push(studentId);
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
        const countResult = await db.query('SELECT COUNT(*) FROM attendance_logs');

        res.json({
            success: true,
            records: result.rows.map(r => ({
                id: r.id,
                markedAt: r.marked_at,
                status: r.status,
                distance: parseFloat(r.distance_from_device) || null,
                verified: {
                    device: r.device_verified,
                    location: r.location_verified
                },
                student: {
                    id: r.student_id,
                    name: r.student_name,
                    studentId: r.student_code,
                    email: r.email
                },
                location: {
                    id: r.location_id,
                    name: r.location_name
                },
                session: {
                    id: r.session_id,
                    subject: r.subject,
                    faculty: r.faculty_name
                }
            })),
            pagination: {
                total: parseInt(countResult.rows[0].count),
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch attendance records'
        });
    }
});

// =========================================
// SYSTEM SETTINGS
// =========================================

/**
 * GET /api/admin/settings
 * Get system settings (stored in a settings table or defaults)
 */
router.get('/settings', authenticate, isAdmin, async (req, res) => {
    try {
        // Check if settings table exists
        const settingsResult = await db.query(`
            SELECT key, value FROM system_settings
        `).catch(() => ({ rows: [] }));

        const settings = {};
        settingsResult.rows.forEach(row => {
            settings[row.key] = row.value;
        });

        // Default settings
        const defaults = {
            qrExpiry: settings.qr_expiry || '15',
            maxDistance: settings.max_distance || '100',
            lateThreshold: settings.late_threshold || '10',
            sessionTimeout: settings.session_timeout || '120',
            allowMultipleScans: settings.allow_multiple_scans || 'false',
            requireLocationVerification: settings.require_location_verification || 'true',
            systemName: settings.system_name || 'GeoQR Attendance',
            timezone: settings.timezone || 'Asia/Kolkata'
        };

        res.json({
            success: true,
            settings: defaults
        });

    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings'
        });
    }
});

/**
 * PUT /api/admin/settings
 * Update system settings
 */
router.put('/settings', authenticate, isAdmin, async (req, res) => {
    const settings = req.body;

    try {
        // Upsert each setting
        for (const [key, value] of Object.entries(settings)) {
            await db.query(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (key) 
                DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP
            `, [key, String(value)]).catch(() => {
                // Table might not exist, that's ok
            });
        }

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });

        await logDeviceActivity(null, 'settings_updated', {
            updates: settings,
            by: req.user.id
        });

    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings'
        });
    }
});

module.exports = router;

