/**
 * Device Routes for PostgreSQL
 * With password authentication
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isAdmin } = require('../middleware/roleCheck');
const { generateTokenWithExpiry } = require('../utils/token');

const router = express.Router();

/**
 * GET /api/devices
 */
router.get('/', authenticate, isAdmin, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT d.id, d.device_code, d.device_name, d.location_id, d.is_active, d.last_active,
                   l.name as location_name
            FROM devices d
            LEFT JOIN locations l ON d.location_id = l.id
            ORDER BY d.device_code
        `);

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

    } catch (error) {
        console.error('Register device error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register device'
        });
    }
});

/**
 * POST /api/devices/login
 * Device authentication with password
 */
router.post('/login', [
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
        // Find device
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

        // Check password
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

        // Update last_active
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

/**
 * POST /api/devices/token
 * Generate a new QR token for authenticated device
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

        // Generate token
        const expirySeconds = parseInt(process.env.QR_TOKEN_EXPIRY_SECONDS) || 20;
        const { token, tokenHash, expiresAt } = generateTokenWithExpiry(expirySeconds);

        // Store token
        await db.query(`
            INSERT INTO qr_tokens (token_hash, raw_token, device_id, location_id, session_id, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [tokenHash, token, device.id, device.location_id, session?.id || null, expiresAt]);

        // Update device last_active
        await db.query(
            'UPDATE devices SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
            [device.id]
        );

        res.json({
            success: true,
            token,
            expiresAt,
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

module.exports = router;
