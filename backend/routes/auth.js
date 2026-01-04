/**
 * Authentication Routes
 * Handles login, registration, and user info
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ===============================
// OTP Store Redis Setup
// ===============================
const redisClient = require('../config/redis');


const router = express.Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 4 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { email, password } = req.body;

    try {
        // Find user by email
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check if active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Account is deactivated'
            });
        }

        // Verify password
        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // ===============================
        // STUDENT → OTP REQUIRED
        // ===============================
        if (user.role === 'student') {

            // Generate OTP
            const otp = Math.floor(1000 + Math.random() * 9000);
            const tempToken = require('crypto').randomUUID();

            await redisClient.setEx(
                `otp:${tempToken}`,
                300, // 5 minutes in seconds
                JSON.stringify({
                    otp,
                    userId: user.id
                })
            );


            // 🔔 SEND OTP VIA SMS HERE
            console.log(`OTP for ${user.email}: ${otp}`);

            return res.json({
                success: true,
                requiresOtp: true,
                tempToken,
                maskedMobile: 'XXXXXX' + (user.mobile_number || '0000').slice(-4)
            });
        }

        // ===============================
        // FACULTY / ADMIN → NORMAL LOGIN
        // ===============================
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                studentId: user.student_id
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
        });
    }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP and issue JWT
 */
router.post('/verify-otp', async (req, res) => {
    const { tempToken, otp } = req.body;

    const data = await redisClient.get(`otp:${tempToken}`);

    if (!data) {
        return res.status(400).json({
            success: false,
            error: 'OTP not found or expired'
        });
    }

    const record = JSON.parse(data);

    if (record.otp != otp) {
        return res.status(400).json({
            success: false,
            error: 'Invalid OTP'
        });
    }

    // Delete OTP after success
    await redisClient.del(`otp:${tempToken}`);

    const result = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [record.userId]
    );
    const user = result.rows[0];

    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );

    res.json({
        success: true,
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            studentId: user.student_id
        }
    });
});



/**
 * POST /api/auth/register
 * Create new user
 */
router.post('/register', [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['student', 'faculty', 'admin', 'device']),
    body('studentId').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }

    const { name, email, password, role, studentId } = req.body;

    try {
        // Check if email exists
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Hash password
        const salt = bcrypt.genSaltSync(12);
        const passwordHash = bcrypt.hashSync(password, salt);

        // Insert user
        const result = await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [name, email, passwordHash, role, studentId || null]
        );

        // Generate JWT
        const token = jwt.sign(
            { userId: result.rows[0].id, role },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        res.status(201).json({
            success: true,
            token,
            user: {
                id: result.rows[0].id,
                name,
                email,
                role,
                studentId
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during registration'
        });
    }
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;
