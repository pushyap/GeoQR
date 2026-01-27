/**
 * Device Authentication Middleware
 * JWT-based authentication for QR devices
 */
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || process.env.JWT_SECRET || 'device-secret-key';

/**
 * Authenticate device using JWT token
 */
async function authenticateDevice(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Device authentication required'
            });
        }

        const token = authHeader.split(' ')[1];

        // Verify JWT
        let decoded;
        try {
            decoded = jwt.verify(token, DEVICE_JWT_SECRET);
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Device token expired'
                });
            }
            return res.status(401).json({
                success: false,
                error: 'Invalid device token'
            });
        }

        // Check if token is revoked
        const sessionResult = await db.query(
            `SELECT * FROM device_sessions 
             WHERE device_id = $1 AND is_revoked = false 
             AND expires_at > NOW()
             ORDER BY issued_at DESC LIMIT 1`,
            [decoded.deviceId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Device session not found or revoked'
            });
        }

        // Fetch device details
        const deviceResult = await db.query(
            `SELECT d.*, l.name as location_name, l.latitude, l.longitude, l.radius
             FROM devices d
             LEFT JOIN locations l ON d.location_id = l.id
             WHERE d.id = $1 AND d.is_active = true`,
            [decoded.deviceId]
        );

        if (deviceResult.rows.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Device not found or disabled'
            });
        }

        // Attach device to request
        req.device = deviceResult.rows[0];
        req.deviceSession = sessionResult.rows[0];

        next();
    } catch (error) {
        console.error('Device auth error:', error);
        res.status(500).json({
            success: false,
            error: 'Device authentication failed'
        });
    }
}

/**
 * Generate JWT token for device
 */
function generateDeviceToken(deviceId, expiresIn = '24h') {
    return jwt.sign(
        {
            deviceId,
            type: 'device',
            iat: Math.floor(Date.now() / 1000)
        },
        DEVICE_JWT_SECRET,
        { expiresIn }
    );
}

/**
 * Create device session in database
 */
async function createDeviceSession(deviceId, tokenHash, expiresAt) {
    await db.query(
        `INSERT INTO device_sessions (device_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [deviceId, tokenHash, expiresAt]
    );
}

/**
 * Revoke all device sessions
 */
async function revokeDeviceSessions(deviceId) {
    await db.query(
        `UPDATE device_sessions SET is_revoked = true WHERE device_id = $1`,
        [deviceId]
    );
}

module.exports = {
    authenticateDevice,
    generateDeviceToken,
    createDeviceSession,
    revokeDeviceSessions,
    DEVICE_JWT_SECRET
};
