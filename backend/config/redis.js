/**
 * Redis Configuration
 * Used for OTP storage with TTL
 */

const { createClient } = require('redis');

// Create Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

// Handle Redis errors
redisClient.on('error', (err) => {
    console.error('❌ Redis Error:', err);
});

// Handle successful connection
redisClient.on('connect', () => {
    console.log('🔌 Redis connected');
});

// Connect to Redis immediately
(async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
            console.log('✅ Redis connection established');
        }
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error);
    }
})();

module.exports = redisClient;
