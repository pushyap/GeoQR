/**
 * Security Utilities
 * HMAC signing, nonce generation, and validation utilities
 */
const crypto = require('crypto');
const { db } = require('../config/database');
// Lazy load to avoid circular dependency if possible, or use event bus.
// For now, we will require it inside the function or use a global if initialized.
// But better to just try require outside if no circular dep with utils/security -> ...
// realtime.js depends on auth -> db. security -> db. 
// realtime does NOT depend on security. So we can require realtime here.
let broadcastToAdmin;
try {
    const rt = require('../routes/realtime');
    broadcastToAdmin = rt.broadcastToAdmin;
} catch (e) {
    console.warn('Realtime module not loaded yet');
}

const QR_SIGNING_SECRET = process.env.QR_SIGNING_SECRET || process.env.JWT_SECRET || 'qr-signing-secret';

/**
 * Generate a cryptographically secure nonce
 * @returns {string} 32-character hex nonce
 */
function generateNonce() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Create HMAC-SHA256 signature for QR payload
 * @param {Object} payload - Data to sign
 * @returns {string} Hex signature
 */
function signPayload(payload) {
    const data = JSON.stringify(payload);
    return crypto
        .createHmac('sha256', QR_SIGNING_SECRET)
        .update(data)
        .digest('hex');
}

/**
 * Verify HMAC-SHA256 signature
 * @param {Object} payload - Original payload (without signature)
 * @param {string} signature - Signature to verify
 * @returns {boolean} True if valid
 */
function verifySignature(payload, signature) {
    const expectedSignature = signPayload(payload);
    try {
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * Generate signed QR payload
 * @param {Object} data - { sessionId, deviceId, locationId, timestamp }
 * @returns {Object} { payload, signature, nonce, expiresAt }
 */
function generateSignedQRPayload(data, expirySeconds = 10) {
    const nonce = generateNonce();
    const timestamp = Date.now();
    const expiresAt = timestamp + (expirySeconds * 1000);

    const payload = {
        sid: data.sessionId,       // Session ID
        did: data.deviceId,        // Device ID
        lid: data.locationId,      // Location ID
        ts: timestamp,             // Timestamp
        nonce: nonce,              // Unique nonce
        exp: expiresAt             // Expiry timestamp
    };

    const signature = signPayload(payload);

    return {
        payload,
        signature,
        nonce,
        expiresAt: new Date(expiresAt).toISOString(),
        // Full QR content (compact)
        qrContent: `${Buffer.from(JSON.stringify(payload)).toString('base64')}.${signature}`
    };
}

/**
 * Verify and decode QR content
 * @param {string} qrContent - Base64 payload + signature
 * @returns {Object} { valid, payload, error }
 */
function verifyQRContent(qrContent) {
    try {
        const [payloadB64, signature] = qrContent.split('.');

        if (!payloadB64 || !signature) {
            return { valid: false, error: 'Invalid QR format' };
        }

        const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

        // Verify signature
        if (!verifySignature(payload, signature)) {
            return { valid: false, error: 'Invalid signature' };
        }

        // Check expiry
        if (Date.now() > payload.exp) {
            return { valid: false, error: 'QR code expired' };
        }

        return { valid: true, payload };
    } catch (error) {
        return { valid: false, error: 'Failed to verify QR: ' + error.message };
    }
}

/**
 * Check if nonce has been used (and mark as used)
 * @param {string} nonce - Nonce to check
 * @param {number} deviceId - Device ID
 * @returns {Promise<boolean>} True if nonce is fresh (not used)
 */
async function validateAndConsumeNonce(nonce, deviceId) {
    try {
        // Try to insert - will fail if already exists (unique constraint)
        await db.query(
            `INSERT INTO qr_nonces (nonce, device_id) VALUES ($1, $2)`,
            [nonce, deviceId]
        );
        return true;
    } catch (error) {
        // Unique violation means nonce was already used
        if (error.code === '23505') {
            return false;
        }
        throw error;
    }
}

/**
 * Validate request timestamp (prevent replay with old requests)
 * @param {number} timestamp - Request timestamp
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 30s)
 * @returns {boolean} True if valid
 */
function validateTimestamp(timestamp, maxAgeMs = 30000) {
    const now = Date.now();
    const age = now - timestamp;

    // Reject if too old or from future (clock skew > 5s)
    return age >= -5000 && age <= maxAgeMs;
}

/**
 * Clean up old nonces (run periodically)
 */
async function cleanupOldNonces(maxAgeHours = 1) {
    try {
        const result = await db.query(
            `DELETE FROM qr_nonces WHERE used_at < NOW() - INTERVAL '${maxAgeHours} hours'`
        );
        console.log(`🧹 Cleaned up ${result.rowCount} old nonces`);
    } catch (error) {
        console.error('Nonce cleanup error:', error);
    }
}

/**
 * Log device activity
 */
async function logDeviceActivity(deviceId, action, details = {}, ipAddress = null) {
    try {
        await db.query(
            `INSERT INTO device_activity_logs (device_id, action, details, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [deviceId, action, JSON.stringify(details), ipAddress]
        );
    } catch (error) {
        console.error('Activity log error:', error);
    }
}

module.exports = {
    generateNonce,
    signPayload,
    verifySignature,
    generateSignedQRPayload,
    verifyQRContent,
    validateAndConsumeNonce,
    validateTimestamp,
    cleanupOldNonces,
    logDeviceActivity,
    QR_SIGNING_SECRET
};
