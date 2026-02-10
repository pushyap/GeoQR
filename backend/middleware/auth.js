/**
 * Authentication Middleware for PostgreSQL
 */
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

/**
 * Verify JWT token and attach user to request
 */
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    } else {
        return res.status(401).json({
            success: false,
            error: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Get user from database
        const result = await db.query(
            'SELECT id, name, email, role, student_id, is_active FROM users WHERE id = $1',
            [decoded.userId]
        );
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token. User not found.'
            });
        }

        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Account is deactivated.'
            });
        }

        // Attach user to request
        req.user = user;
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                error: 'Token has expired.'
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Invalid token.'
        });
    }
}

module.exports = { authenticate };
