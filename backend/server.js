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
const webhookRoutes = require('./routes/webhook');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);

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
            webhook: '/api/webhook'
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

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Initialize database and start server
async function start() {
    try {
        await initDB();
        initializeDatabase();

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

start();

module.exports = app;
