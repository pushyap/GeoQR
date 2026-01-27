/**
 * Redis Configuration - Optional Caching Layer
 * Falls back to in-memory store if Redis unavailable
 */
const { createClient } = require('redis');

// In-memory fallback store
const memoryCache = new Map();
const memoryCacheTTL = new Map();

let redisClient = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * @returns {Promise<boolean>} Connection success status
 */
async function initRedis() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('⚠️ REDIS_URL not configured - using in-memory fallback');
        return false;
    }

    try {
        redisClient = createClient({ url: redisUrl });

        redisClient.on('error', (err) => {
            console.error('❌ Redis error:', err.message);
            isConnected = false;
        });

        redisClient.on('connect', () => {
            console.log('✅ Connected to Redis');
            isConnected = true;
        });

        redisClient.on('reconnecting', () => {
            console.log('🔄 Redis reconnecting...');
        });

        await redisClient.connect();
        isConnected = true;
        return true;
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('⚠️ Falling back to in-memory cache');
        isConnected = false;
        return false;
    }
}

/**
 * Check if Redis is connected
 * @returns {boolean}
 */
function isRedisConnected() {
    return isConnected && redisClient?.isOpen;
}

/**
 * Get value from cache (Redis or memory)
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
async function getCache(key) {
    try {
        if (isRedisConnected()) {
            const value = await redisClient.get(key);
            return value ? JSON.parse(value) : null;
        }

        // Memory fallback
        const ttl = memoryCacheTTL.get(key);
        if (ttl && Date.now() > ttl) {
            memoryCache.delete(key);
            memoryCacheTTL.delete(key);
            return null;
        }
        return memoryCache.get(key) || null;
    } catch (error) {
        console.error('Cache get error:', error.message);
        return null;
    }
}

/**
 * Set value in cache (Redis or memory)
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 60)
 * @returns {Promise<boolean>} Success status
 */
async function setCache(key, value, ttlSeconds = 60) {
    try {
        if (isRedisConnected()) {
            await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
            return true;
        }

        // Memory fallback
        memoryCache.set(key, value);
        memoryCacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
        return true;
    } catch (error) {
        console.error('Cache set error:', error.message);
        return false;
    }
}

/**
 * Delete value from cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} Success status
 */
async function deleteCache(key) {
    try {
        if (isRedisConnected()) {
            await redisClient.del(key);
            return true;
        }

        // Memory fallback
        memoryCache.delete(key);
        memoryCacheTTL.delete(key);
        return true;
    } catch (error) {
        console.error('Cache delete error:', error.message);
        return false;
    }
}

/**
 * Acquire a distributed lock (for preventing duplicate scans)
 * @param {string} lockKey - Lock key
 * @param {number} ttlSeconds - Lock expiry in seconds
 * @returns {Promise<boolean>} True if lock acquired
 */
async function acquireLock(lockKey, ttlSeconds = 10) {
    try {
        if (isRedisConnected()) {
            const result = await redisClient.set(lockKey, '1', {
                NX: true,  // Only set if not exists
                EX: ttlSeconds
            });
            return result === 'OK';
        }

        // Memory fallback - simple check
        if (memoryCache.has(lockKey)) {
            const ttl = memoryCacheTTL.get(lockKey);
            if (ttl && Date.now() < ttl) {
                return false; // Lock exists
            }
        }
        memoryCache.set(lockKey, '1');
        memoryCacheTTL.set(lockKey, Date.now() + (ttlSeconds * 1000));
        return true;
    } catch (error) {
        console.error('Lock acquire error:', error.message);
        return true; // Allow on error to avoid blocking
    }
}

/**
 * Release a distributed lock
 * @param {string} lockKey - Lock key
 * @returns {Promise<boolean>} Success status
 */
async function releaseLock(lockKey) {
    return deleteCache(lockKey);
}

/**
 * Cache session data for quick lookup
 * @param {number} sessionId - Session ID
 * @param {Object} sessionData - Session data
 */
async function cacheSession(sessionId, sessionData) {
    const key = `session:${sessionId}`;
    await setCache(key, sessionData, 300); // 5 min TTL
}

/**
 * Get cached session data
 * @param {number} sessionId - Session ID  
 * @returns {Promise<Object|null>} Session data or null
 */
async function getCachedSession(sessionId) {
    const key = `session:${sessionId}`;
    return getCache(key);
}

/**
 * Invalidate session cache
 * @param {number} sessionId - Session ID
 */
async function invalidateSession(sessionId) {
    const key = `session:${sessionId}`;
    await deleteCache(key);
}

/**
 * Get cache status for health checks
 * @returns {Object} Cache status
 */
function getCacheStatus() {
    return {
        type: isRedisConnected() ? 'redis' : 'memory',
        connected: isRedisConnected(),
        memorySize: memoryCache.size
    };
}

// Cleanup expired memory cache entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, ttl] of memoryCacheTTL.entries()) {
        if (now > ttl) {
            memoryCache.delete(key);
            memoryCacheTTL.delete(key);
        }
    }
}, 5 * 60 * 1000);

module.exports = {
    initRedis,
    isRedisConnected,
    getCache,
    setCache,
    deleteCache,
    acquireLock,
    releaseLock,
    cacheSession,
    getCachedSession,
    invalidateSession,
    getCacheStatus
};
