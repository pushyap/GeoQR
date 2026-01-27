/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse
 */

// In-memory store for rate limiting
const rateLimitStore = new Map();

// Cleanup old entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);

/**
 * Create rate limiter with custom options
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60s)
 * @param {number} options.max - Max requests per window (default: 30)
 * @param {string} options.keyGenerator - 'ip', 'device', or 'combined'
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
        max = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30,
        keyGenerator = 'ip',
        message = 'Too many requests. Please try again later.'
    } = options;

    return (req, res, next) => {
        // Generate key based on strategy
        let key;
        switch (keyGenerator) {
            case 'device':
                key = req.device?.id ? `device:${req.device.id}` : `ip:${getClientIp(req)}`;
                break;
            case 'combined':
                key = req.device?.id
                    ? `combined:${req.device.id}:${getClientIp(req)}`
                    : `ip:${getClientIp(req)}`;
                break;
            case 'ip':
            default:
                key = `ip:${getClientIp(req)}`;
        }

        const now = Date.now();
        let record = rateLimitStore.get(key);

        if (!record || now > record.resetTime) {
            // Create new window
            record = {
                count: 1,
                resetTime: now + windowMs
            };
            rateLimitStore.set(key, record);
        } else {
            record.count++;
        }

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

        if (record.count > max) {
            return res.status(429).json({
                success: false,
                error: message,
                retryAfter: Math.ceil((record.resetTime - now) / 1000)
            });
        }

        next();
    };
}

/**
 * Get client IP address
 */
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || req.socket?.remoteAddress
        || 'unknown';
}

// Pre-configured rate limiters
const deviceRateLimit = createRateLimiter({
    windowMs: 60000,
    max: 60,
    keyGenerator: 'device',
    message: 'Device rate limit exceeded'
});

const qrGenerationRateLimit = createRateLimiter({
    windowMs: 10000,  // 10 seconds
    max: 3,           // Max 3 QR generations per 10s
    keyGenerator: 'device',
    message: 'QR generation rate limit exceeded'
});

const scanRateLimit = createRateLimiter({
    windowMs: 60000,
    max: 10,
    keyGenerator: 'ip',
    message: 'Too many scan attempts'
});

const authRateLimit = createRateLimiter({
    windowMs: 300000,  // 5 minutes
    max: 10,
    keyGenerator: 'ip',
    message: 'Too many authentication attempts'
});

module.exports = {
    createRateLimiter,
    deviceRateLimit,
    qrGenerationRateLimit,
    scanRateLimit,
    authRateLimit,
    getClientIp
};
