/**
 * Device Routes - Production Grade
 * JWT authentication, signed QR codes, heartbeat, rate limiting
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const {
    authenticateDevice,
    generateDeviceToken,
    createDeviceSession,
    revokeDeviceSessions
} = require('../middleware/deviceAuth');
const {
    deviceRateLimit,
    qrGenerationRateLimit,
    authRateLimit,
    getClientIp
} = require('../middleware/rateLimit');
const {
    generateSignedQRPayload,
    logDeviceActivity,
    cleanupOldNonces
} = require('../utils/security');
const { hashToken } = require('../utils/token');

const router = express.Router();

// Schedule nonce cleanup every hour
setInterval(() => cleanupOldNonces(1), 60 * 60 * 1000);

// =========================================
// ADMIN ENDPOINTS (require user auth)
// =========================================

/**
 * GET /api/devices
 * List all devices (admin only)
 */
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        let query = `
            SELECT d.id, d.device_code, d.device_name, d.location_id, d.is_active, d.last_active,
                   l.name as location_name
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
        `;
        const params = [];

        if (status && status !== 'all') {
            query += ` WHERE d.is_active = $1`;
            params.push(status === 'active');
        }

        query += ` ORDER BY d.device_code`;

        const result = await db.query(query, params);

        res.json({
            success: true,
            devices: result.rows
        });

    } catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch devices'
        });
    }
});

/**
 * POST /api/devices/register
 * Admin registers a new device with password
 */
router.post('/register', authenticate, isAdmin, [
    body('device_code').trim().isLength({ min: 3 }),
    body('device_name').optional().trim(),
    body('password').isLength({ min: 4 }),
    body('location_id').isInt()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { device_code, device_name, password, location_id } = req.body;

    try {
        // Check for duplicates
        const duplicateCheck = await db.query(
            'SELECT id FROM devices WHERE LOWER(device_code) = LOWER($1) OR LOWER(device_name) = LOWER($2)',
            [device_code.trim(), (device_name || '').trim()]
        );

        if (duplicateCheck.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Device code or name already exists. Please choose different values.'
            });
        }

        // Hash password
        const passwordHash = bcrypt.hashSync(password, 12);

        const result = await db.query(
            `INSERT INTO devices (device_code, device_name, password_hash, location_id)
             VALUES ($1, $2, $3, $4) RETURNING id, device_code, device_name, location_id`,
            [device_code, device_name || device_code, passwordHash, location_id]
        );

        res.status(201).json({
            success: true,
            device: result.rows[0]
        });

        await logDeviceActivity(result.rows[0].id, 'device_registered', {
            code: result.rows[0].device_code,
            by: req.user.id
        });

    } catch (error) {
        console.error('Register device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register device'
        });
    }
});

// =========================================
// DEVICE AUTHENTICATION (public, rate limited)
// =========================================

/**
 * POST /api/devices/auth
 * Device login - returns JWT token
 */
router.post('/auth', authRateLimit, [
    body('device_code').trim().notEmpty(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { device_code, password } = req.body;
    const ipAddress = getClientIp(req);

    try {
        // Find device
        const result = await db.query(`
            SELECT d.*, l.name as location_name, l.latitude, l.longitude, l.radius
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.device_code = $1
        `, [device_code]);

        const device = result.rows[0];

        if (!device) {
            await logDeviceActivity(null, 'auth_failed', { device_code, reason: 'not_found' }, ipAddress);
            return res.status(401).json({
                success: false,
                error: 'Device not found'
            });
        }

        if (!device.is_active) {
            await logDeviceActivity(device.id, 'auth_failed', { reason: 'disabled' }, ipAddress);
            return res.status(401).json({
                success: false,
                error: 'Device is disabled'
            });
        }

        // Check password
        if (!device.password_hash) {
            return res.status(401).json({
                success: false,
                error: 'Device password not set. Contact admin.'
            });
        }

        const validPassword = bcrypt.compareSync(password, device.password_hash);
        if (!validPassword) {
            await logDeviceActivity(device.id, 'auth_failed', { reason: 'invalid_password' }, ipAddress);
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }

        // Generate JWT token
        const token = generateDeviceToken(device.id, '24h');
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // Revoke old sessions and create new one
        await revokeDeviceSessions(device.id);
        await createDeviceSession(device.id, tokenHash, expiresAt);

        // Update last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        await logDeviceActivity(device.id, 'auth_success', { ip: ipAddress }, ipAddress);

        res.json({
            success: true,
            token,
            expiresAt: expiresAt.toISOString(),
            device: {
                id: device.id,
                code: device.device_code,
                name: device.device_name,
                location: {
                    id: device.location_id,
                    name: device.location_name,
                    latitude: device.latitude,
                    longitude: device.longitude,
                    radius: device.radius
                }
            }
        });

    } catch (error) {
        console.error('Device auth error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to authenticate device'
        });
    }
});

/**
 * POST /api/devices/login (legacy - kept for backwards compatibility)
 */
router.post('/login', authRateLimit, [
    body('device_code').trim().notEmpty(),
    body('password').notEmpty()
], async (req, res) => {
    // Redirect to new auth endpoint logic
    const { device_code, password } = req.body;

    try {
        const result = await db.query(`
            SELECT d.*, l.name as location_name
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.device_code = $1 AND d.is_active = true
        `, [device_code]);

        const device = result.rows[0];

        if (!device) {
            return res.status(401).json({
                success: false,
                error: 'Device not found or inactive'
            });
        }

        if (!device.password_hash) {
            return res.status(401).json({
                success: false,
                error: 'Device password not set. Contact admin.'
            });
        }

        const validPassword = bcrypt.compareSync(password, device.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid password'
            });
        }

        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        res.json({
            success: true,
            device: {
                id: device.id,
                code: device.device_code,
                name: device.device_name,
                location: device.location_name
            }
        });

    } catch (error) {
        console.error('Device login error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to authenticate device'
        });
    }
});

// =========================================
// PROTECTED DEVICE ENDPOINTS (require device JWT)
// =========================================

/**
 * GET /api/devices/session
 * Get active session for device's location
 */
router.get('/session', authenticateDevice, deviceRateLimit, async (req, res) => {
    try {
        const device = req.device;

        const sessionResult = await db.query(`
            SELECT s.*, l.name as location_name, u.name as faculty_name,
                (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            JOIN users u ON s.faculty_id = u.id
            WHERE s.location_id = $1 AND s.is_active = true
            ORDER BY s.start_time DESC LIMIT 1
        `, [device.location_id]);

        const session = sessionResult.rows[0];

        res.json({
            success: true,
            hasActiveSession: !!session,
            session: session || null,
            device: {
                id: device.id,
                name: device.device_name,
                location: device.location_name
            }
        });

    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch session'
        });
    }
});

/**
 * GET /api/devices/qr
 * Generate signed QR code
 */
router.get('/qr', authenticateDevice, qrGenerationRateLimit, async (req, res) => {
    try {
        const device = req.device;
        const ipAddress = getClientIp(req);

        // Find active session
        const sessionResult = await db.query(`
            SELECT id FROM sessions 
            WHERE location_id = $1 AND is_active = true
            ORDER BY start_time DESC LIMIT 1
        `, [device.location_id]);

        const session = sessionResult.rows[0];

        // Generate signed QR payload
        const expirySeconds = parseInt(process.env.QR_TOKEN_EXPIRY_SECONDS) || 10;
        const qrData = generateSignedQRPayload({
            sessionId: session?.id || null,
            deviceId: device.id,
            locationId: device.location_id
        }, expirySeconds);

        // Store token for legacy support
        await db.query(`
            INSERT INTO qr_tokens (token_hash, raw_token, device_id, location_id, session_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            hashToken(qrData.qrContent),
            qrData.qrContent,
            device.id,
            device.location_id,
            session?.id || null,
            qrData.expiresAt
        ]);

        // Update device last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        await logDeviceActivity(device.id, 'qr_generated', {
            sessionId: session?.id,
            nonce: qrData.nonce
        }, ipAddress);

        res.json({
            success: true,
            qr: {
                content: qrData.qrContent,
                nonce: qrData.nonce,
                expiresAt: qrData.expiresAt,
                expirySeconds
            },
            hasActiveSession: !!session,
            device: {
                id: device.id,
                name: device.device_name,
                location: device.location_name
            }
        });

    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR code'
        });
    }
});

/**
 * POST /api/devices/heartbeat
 * Device health ping
 */
router.post('/heartbeat', authenticateDevice, deviceRateLimit, async (req, res) => {
    try {
        const device = req.device;
        const ipAddress = getClientIp(req);
        const { status = 'online', metadata = {} } = req.body;

        // Update last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        await logDeviceActivity(device.id, 'heartbeat', { status, ...metadata }, ipAddress);

        // Get active session count
        const sessionResult = await db.query(`
            SELECT 
                (SELECT COUNT(*) FROM sessions WHERE location_id = $1 AND is_active = true) as active_sessions,
                (SELECT COUNT(*) FROM attendance_logs al 
                 JOIN sessions s ON al.session_id = s.id 
                 WHERE s.location_id = $1 AND s.is_active = true) as scan_count
        `, [device.location_id]);

        const stats = sessionResult.rows[0];

        res.json({
            success: true,
            acknowledged: true,
            timestamp: new Date().toISOString(),
            device: {
                id: device.id,
                name: device.device_name,
                location: device.location_name
            },
            stats: {
                activeSessions: parseInt(stats.active_sessions) || 0,
                scanCount: parseInt(stats.scan_count) || 0
            }
        });

    } catch (error) {
        console.error('Heartbeat error:', error);
        res.status(500).json({
            success: false,
            error: 'Heartbeat failed'
        });
    }
});

/**
 * GET /api/devices/status
 * Device info and health status
 */
router.get('/status', authenticateDevice, deviceRateLimit, async (req, res) => {
    try {
        const device = req.device;

        // Get recent activity
        const activityResult = await db.query(`
            SELECT action, created_at 
            FROM device_activity_logs 
            WHERE device_id = $1 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [device.id]);

        // Get session info
        const sessionResult = await db.query(`
            SELECT s.*, 
                (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
            FROM sessions s
            WHERE s.location_id = $1 AND s.is_active = true
            LIMIT 1
        `, [device.location_id]);

        res.json({
            success: true,
            device: {
                id: device.id,
                code: device.device_code,
                name: device.device_name,
                isActive: device.is_active,
                lastActive: device.last_active,
                location: {
                    id: device.location_id,
                    name: device.location_name,
                    latitude: device.latitude,
                    longitude: device.longitude,
                    radius: device.radius
                }
            },
            session: sessionResult.rows[0] || null,
            recentActivity: activityResult.rows,
            serverTime: new Date().toISOString()
        });

    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get status'
        });
    }
});

/**
 * POST /api/devices/logout
 * Revoke device session
 */
router.post('/logout', authenticateDevice, async (req, res) => {
    try {
        const device = req.device;
        const ipAddress = getClientIp(req);

        await revokeDeviceSessions(device.id);
        await logDeviceActivity(device.id, 'logout', {}, ipAddress);

        res.json({
            success: true,
            message: 'Device logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed'
        });
    }
});

// =========================================
// LEGACY ENDPOINT (kept for backwards compatibility)
// =========================================

/**
 * POST /api/devices/token
 * Generate a new QR token (legacy - requires password each time)
 */
router.post('/token', [
    body('device_code').trim().notEmpty(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { device_code, password } = req.body;

    try {
        // Find device with location
        const deviceResult = await db.query(`
            SELECT d.*, l.latitude, l.longitude, l.radius, l.name as location_name
            FROM devices d
            JOIN locations l ON d.location_id = l.id
            WHERE d.device_code = $1 AND d.is_active = true AND l.is_active = true
        `, [device_code]);

        const device = deviceResult.rows[0];

        if (!device) {
            return res.status(404).json({
                success: false,
                error: 'Device not found or inactive'
            });
        }

        // Verify password
        if (!device.password_hash) {
            return res.status(401).json({
                success: false,
                error: 'Device password not set'
            });
        }

        const validPassword = bcrypt.compareSync(password, device.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid device password'
            });
        }

        // Find active session
        const sessionResult = await db.query(`
            SELECT id FROM sessions 
            WHERE location_id = $1 AND is_active = true
            ORDER BY start_time DESC LIMIT 1
        `, [device.location_id]);

        const session = sessionResult.rows[0];

        // Generate signed QR
        const expirySeconds = parseInt(process.env.QR_TOKEN_EXPIRY_SECONDS) || 20;
        const qrData = generateSignedQRPayload({
            sessionId: session?.id || null,
            deviceId: device.id,
            locationId: device.location_id
        }, expirySeconds);

        // Store token
        await db.query(`
            INSERT INTO qr_tokens (token_hash, raw_token, device_id, location_id, session_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            hashToken(qrData.qrContent),
            qrData.qrContent,
            device.id,
            device.location_id,
            session?.id || null,
            qrData.expiresAt
        ]);

        // Update device last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        res.json({
            success: true,
            token: qrData.qrContent,
            expiresAt: qrData.expiresAt,
            expirySeconds,
            device: {
                id: device.id,
                code: device.device_code,
                name: device.device_name,
                location: device.location_name
            },
            hasActiveSession: !!session
        });

    } catch (error) {
        console.error('Generate token error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate token'
        });
    }
});

// =========================================
// ADMIN DEVICE CRUD (continued)
// =========================================

/**
 * PUT /api/devices/:id
 * Update device details (admin only)
 */
router.put('/:id', authenticate, isAdmin, async (req, res) => {
    const deviceId = req.params.id;
    const { device_name, location_id, is_active, password } = req.body;

    try {
        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 0;

        if (device_name !== undefined) {
            paramCount++;
            updates.push(`device_name = $${paramCount}`);
            values.push(device_name);
        }

        if (location_id !== undefined) {
            paramCount++;
            updates.push(`location_id = $${paramCount}`);
            values.push(location_id);
        }

        if (is_active !== undefined) {
            paramCount++;
            updates.push(`is_active = $${paramCount}`);
            values.push(is_active);
        }

        if (password) {
            paramCount++;
            updates.push(`password_hash = $${paramCount}`);
            values.push(bcrypt.hashSync(password, 12));
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        paramCount++;
        values.push(deviceId);

        const result = await db.query(`
            UPDATE devices 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, device_code, device_name, location_id, is_active, last_active
        `, values);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        // Get location name
        const locationResult = await db.query(
            'SELECT name FROM locations WHERE id = $1',
            [result.rows[0].location_id]
        );

        res.json({
            success: true,
            device: {
                ...result.rows[0],
                location_name: locationResult.rows[0]?.name || null
            }
        });

        await logDeviceActivity(deviceId, 'device_updated', {
            updates: { device_name, location_id, is_active },
            by: req.user.id
        });

    } catch (error) {
        console.error('Update device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update device'
        });
    }
});

/**
 * DELETE /api/devices/:id
 * Deactivate device (soft delete, admin only)
 */
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
    const deviceId = req.params.id;

    try {
        // 1. Revoke all sessions first
        await revokeDeviceSessions(deviceId);

        // 2. Delete dependencies
        await db.query('DELETE FROM attendance_logs WHERE device_id = $1', [deviceId]);
        await db.query('DELETE FROM qr_tokens WHERE device_id = $1', [deviceId]);
        await db.query('DELETE FROM device_sessions WHERE device_id = $1', [deviceId]);
        await db.query('DELETE FROM device_activity_logs WHERE device_id = $1', [deviceId]);
        await db.query('DELETE FROM qr_nonces WHERE device_id = $1', [deviceId]);

        // 3. Delete the device
        const result = await db.query(
            'DELETE FROM devices WHERE id = $1 RETURNING id, device_code',
            [deviceId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        // We can't log to device_activity_logs anymore for THIS device as it's gone, 
        // but we can log a system-level event if needed.
        await logDeviceActivity(null, 'device_deleted', {
            id: deviceId,
            code: result.rows[0].device_code,
            by: req.user.id
        });

        res.json({
            success: true,
            message: `Device ${result.rows[0].device_code} and all associated logs deleted permanently`
        });

    } catch (error) {
        console.error('Delete device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete device permanently'
        });
    }
});

/**
 * GET /api/devices/:id
 * Get single device details (admin only)
 */
router.get('/:id', authenticate, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT d.id, d.device_code, d.device_name, d.location_id, d.is_active, 
                   d.last_active, d.created_at,
                   l.name as location_name, l.latitude, l.longitude, l.radius
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            WHERE d.id = $1
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Device not found'
            });
        }

        // Get recent activity for this device
        const activityResult = await db.query(`
            SELECT action, details, created_at
            FROM device_activity_logs
            WHERE device_id = $1
            ORDER BY created_at DESC
            LIMIT 10
        `, [req.params.id]);

        res.json({
            success: true,
            device: result.rows[0],
            recentActivity: activityResult.rows
        });

    } catch (error) {
        console.error('Get device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch device'
        });
    }
});

/**
 * POST /api/devices/ping
 * Alias for heartbeat (spec compatibility)
 */
router.post('/ping', authenticateDevice, deviceRateLimit, async (req, res) => {
    try {
        const device = req.device;
        const ipAddress = getClientIp(req);

        // Update last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        await logDeviceActivity(device.id, 'ping', {}, ipAddress);

        res.json({
            success: true,
            acknowledged: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Ping error:', error);
        res.status(500).json({
            success: false,
            error: 'Ping failed'
        });
    }
});

/**
 * GET /api/devices/health
 * Admin endpoint - get all devices health status with offline detection
 */
router.get('/health', authenticate, isAdmin, async (req, res) => {
    try {
        const offlineThresholdSeconds = parseInt(req.query.threshold) || 45;

        const result = await db.query(`
            SELECT 
                d.id, 
                d.device_code, 
                d.device_name, 
                d.is_active,
                d.last_active,
                l.name as location_name,
                CASE 
                    WHEN d.last_active IS NULL THEN 'never_seen'
                    WHEN d.last_active < NOW() - INTERVAL '${offlineThresholdSeconds} seconds' THEN 'offline'
                    ELSE 'online'
                END as status,
                EXTRACT(EPOCH FROM (NOW() - d.last_active)) as seconds_since_last_active,
                (SELECT COUNT(*) FROM sessions s WHERE s.location_id = d.location_id AND s.is_active = true) as active_sessions
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            ORDER BY 
                CASE 
                    WHEN d.last_active < NOW() - INTERVAL '${offlineThresholdSeconds} seconds' THEN 0
                    ELSE 1
                END,
                d.last_active DESC
        `);

        const devices = result.rows;
        const online = devices.filter(d => d.status === 'online').length;
        const offline = devices.filter(d => d.status === 'offline').length;
        const neverSeen = devices.filter(d => d.status === 'never_seen').length;

        res.json({
            success: true,
            summary: {
                total: devices.length,
                online,
                offline,
                neverSeen,
                offlineThresholdSeconds
            },
            devices: devices.map(d => ({
                id: d.id,
                code: d.device_code,
                name: d.device_name,
                location: d.location_name,
                isActive: d.is_active,
                status: d.status,
                lastActive: d.last_active,
                secondsSinceActive: Math.round(d.seconds_since_last_active) || null,
                activeSessions: parseInt(d.active_sessions)
            })),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get health status'
        });
    }
});

module.exports = router;

