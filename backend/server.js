/**
 * GeoQR Backend Server
 * Main entry point for the API
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { initDB, initializeDatabase } = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/locations');
const deviceRoutes = require('./routes/devices');
const attendanceRoutes = require('./routes/attendance');
const sessionRoutes = require('./routes/sessions');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const facultyRoutes = require('./routes/faculty');
const webhookRoutes = require('./routes/webhook');
const reportRoutes = require('./routes/reports');
const webauthnRoutes = require('./routes/webauthn');
const { router: realtimeRoutes } = require('./routes/realtime');

// Import utilities
const { initRedis, getCacheStatus } = require('./config/redis');
const { errorMiddleware } = require('./utils/errorHandler');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Required for Render/Heroku/Vercel)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: '*', // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
});

// Health check (enhanced with cache status)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        cache: getCacheStatus()
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/faculty', facultyRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/webauthn', webauthnRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/faculty/qr', require('./routes/faculty_qr'));

// Default route
app.get('/', (req, res) => {
    res.json({
        name: 'GeoQR Attendance API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            locations: '/api/locations',
            devices: '/api/devices',
            attendance: '/api/attendance',
            sessions: '/api/sessions',
            admin: '/api/admin',
            student: '/api/student',
            faculty: '/api/faculty',
            webhook: '/api/webhook',
            reports: '/api/reports',
            realtime: '/api/realtime'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Error handler (standardized format)
app.use(errorMiddleware);

// Initialize database, cache, and start server
async function start() {
    try {
        await initDB();
        await initializeDatabase();

        // Initialize Redis (optional - falls back to in-memory)
        await initRedis();

        // Start background task to clean up expired sessions
        const { db } = require('./config/database');
        setInterval(async () => {
            try {
                const result = await db.query(
                    "UPDATE sessions SET is_active = false WHERE is_active = true AND end_time < NOW()"
                );
                if (result.rowCount > 0) {
                    console.log(`Auto-ended ${result.rowCount} expired sessions`);
                }
            } catch (e) { console.error('Auto-end session error:', e); }
        }, 60000); // Check every minute

        app.listen(PORT, () => {
            console.log(`
╔════════════════════════════════════════════╗
║        GeoQR Attendance API Server         ║
╠════════════════════════════════════════════╣
║  Status:  Running                          ║
║  Port:    ${PORT}                              ║
║  URL:     http://localhost:${PORT}             ║
╚════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

if (process.env.NODE_ENV !== 'test') {
    start();
}

module.exports = app;
