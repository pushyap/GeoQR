/**
 * Token Utility Functions
 * Generates and hashes secure tokens for QR codes
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a secure random token
 * @returns {string} Random token string
 */
function generateToken() {
    // Combine UUID with random bytes for extra security
    const uuid = uuidv4();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `${uuid}-${randomBytes}`;
}

/**
 * Generate a shorter token for QR display (still secure)
 * @returns {string} Shorter token (32 chars)
 */
function generateShortToken() {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash a token using SHA-256
 * @param {string} token - Raw token to hash
 * @returns {string} Hashed token
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify a token against a hash
 * @param {string} token - Raw token
 * @param {string} hash - Stored hash
 * @returns {boolean} True if matches
 */
function verifyToken(token, hash) {
    const tokenHash = hashToken(token);
    return crypto.timingSafeEqual(
        Buffer.from(tokenHash),
        Buffer.from(hash)
    );
}

/**
 * Generate token with expiry timestamp
 * @param {number} expirySeconds - Seconds until expiry
 * @returns {Object} { token, tokenHash, expiresAt }
 */
function generateTokenWithExpiry(expirySeconds = 20) {
    const token = generateShortToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

    return {
        token,
        tokenHash,
        expiresAt
    };
}

module.exports = {
    generateToken,
    generateShortToken,
    hashToken,
    verifyToken,
    generateTokenWithExpiry
};
