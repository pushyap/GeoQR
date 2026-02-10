/**
 * Real-Time Routes
 * Server-Sent Events (SSE) for live updates
 */
const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authenticateDevice } = require('../middleware/deviceAuth');
const { isFacultyOrAdmin, isAdmin } = require('../middleware/roleCheck');

const router = express.Router();

// Store active SSE connections
const sessionConnections = new Map(); // sessionId -> Set of response objects
const deviceConnections = new Map();  // deviceId -> Set of response objects

const adminConnections = new Set(); // Set of response objects for admin dashboard

// Helper to broadcast to admins
const broadcastToAdmin = (event, data) => {
    adminConnections.forEach(res => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
};

// Export broadcast function for use in other files
module.exports.broadcastToAdmin = broadcastToAdmin;

/**
 * GET /api/realtime/admin
 * SSE endpoint for admin dashboard live updates
 */
router.get('/admin', authenticate, isAdmin, (req, res) => {
    // SST Setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Add to pool
    adminConnections.add(res);

    // Initial connection message
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ message: 'Connected to Admin Live Feed' })}\n\n`);

    // Remove on close
    req.on('close', () => {
        adminConnections.delete(res);
    });
});

/**
 * GET /api/realtime/session/:id
 * SSE endpoint for live session updates
 */
router.get('/session/:id', authenticate, isFacultyOrAdmin, async (req, res) => {
    const sessionId = parseInt(req.params.id);

    // Verify session exists and user has access
    const sessionResult = await db.query(
        'SELECT * FROM sessions WHERE id = $1',
        [sessionId]
    );

    if (sessionResult.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Check access (only owner or admin)
    if (req.user.role === 'faculty' && session.faculty_id !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Add to connections map
    if (!sessionConnections.has(sessionId)) {
        sessionConnections.set(sessionId, new Set());
    }
    sessionConnections.get(sessionId).add(res);

    console.log(`📡 SSE: Client connected to session ${sessionId}`);

    // Send initial data
    const countResult = await db.query(
        'SELECT COUNT(*) as count FROM attendance_logs WHERE session_id = $1',
        [sessionId]
    );

    sendSSE(res, 'init', {
        sessionId,
        attendanceCount: parseInt(countResult.rows[0].count),
        isActive: session.is_active,
        timestamp: new Date().toISOString()
    });

    // Keep alive ping every 30 seconds
    const keepAlive = setInterval(() => {
        sendSSE(res, 'ping', { timestamp: new Date().toISOString() });
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
        console.log(`📡 SSE: Client disconnected from session ${sessionId}`);
        clearInterval(keepAlive);
        sessionConnections.get(sessionId)?.delete(res);
        if (sessionConnections.get(sessionId)?.size === 0) {
            sessionConnections.delete(sessionId);
        }
    });
});

/**
 * GET /api/realtime/device
 * SSE endpoint for device updates (requires device JWT)
 */
router.get('/device', authenticateDevice, async (req, res) => {
    const deviceId = req.device.id;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Add to connections map
    if (!deviceConnections.has(deviceId)) {
        deviceConnections.set(deviceId, new Set());
    }
    deviceConnections.get(deviceId).add(res);

    console.log(`📡 SSE: Device ${deviceId} connected`);

    // Send initial status
    const sessionResult = await db.query(`
        SELECT s.id, s.subject,
            (SELECT COUNT(*) FROM attendance_logs WHERE session_id = s.id) as attendance_count
        FROM sessions s
        WHERE s.location_id = $1 AND s.is_active = true
        LIMIT 1
    `, [req.device.location_id]);

    sendSSE(res, 'init', {
        deviceId,
        deviceName: req.device.device_name,
        location: req.device.location_name,
        activeSession: sessionResult.rows[0] || null,
        timestamp: new Date().toISOString()
    });

    // Keep alive ping every 15 seconds
    const keepAlive = setInterval(() => {
        sendSSE(res, 'ping', { timestamp: new Date().toISOString() });
    }, 15000);

    // Clean up on disconnect
    req.on('close', () => {
        console.log(`📡 SSE: Device ${deviceId} disconnected`);
        clearInterval(keepAlive);
        deviceConnections.get(deviceId)?.delete(res);
        if (deviceConnections.get(deviceId)?.size === 0) {
            deviceConnections.delete(deviceId);
        }
    });
});

/**
 * Helper: Send SSE event
 */
function sendSSE(res, event, data) {
    try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
        console.error('SSE send error:', error.message);
    }
}

/**
 * Broadcast to all session listeners
 */
function broadcastToSession(sessionId, event, data) {
    const connections = sessionConnections.get(sessionId);
    if (connections) {
        for (const res of connections) {
            sendSSE(res, event, data);
        }
    }
}

/**
 * Broadcast to device listeners
 */
function broadcastToDevice(deviceId, event, data) {
    const connections = deviceConnections.get(deviceId);
    if (connections) {
        for (const res of connections) {
            sendSSE(res, event, data);
        }
    }
}

/**
 * Notify session of new attendance
 */
async function notifyAttendance(sessionId, attendanceData) {
    const countResult = await db.query(
        'SELECT COUNT(*) as count FROM attendance_logs WHERE session_id = $1',
        [sessionId]
    );

    broadcastToSession(sessionId, 'attendance', {
        ...attendanceData,
        totalCount: parseInt(countResult.rows[0].count),
        timestamp: new Date().toISOString()
    });
}

/**
 * Notify device of scan
 */
function notifyDeviceScan(deviceId, scanData) {
    broadcastToDevice(deviceId, 'scan', {
        ...scanData,
        timestamp: new Date().toISOString()
    });
}

/**
 * GET /api/realtime/stats
 * Get real-time connection stats
 */
router.get('/stats', authenticate, isFacultyOrAdmin, (req, res) => {
    res.json({
        success: true,
        stats: {
            activeSessions: sessionConnections.size,
            activeDevices: deviceConnections.size,
            totalSessionClients: Array.from(sessionConnections.values())
                .reduce((sum, set) => sum + set.size, 0),
            totalDeviceClients: Array.from(deviceConnections.values())
                .reduce((sum, set) => sum + set.size, 0)
        }
    });
});

module.exports = {
    router,
    broadcastToSession,
    broadcastToDevice,
    notifyAttendance,
    notifyDeviceScan,
    broadcastToAdmin
};
