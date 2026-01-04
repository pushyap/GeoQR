/**
 * Authentication Routes
 * Email-based OTP (No Redis, No Mobile)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

require('dotenv').config();
const nodemailer = require('nodemailer');

/* ============================
   EMAIL TRANSPORTER (GLOBAL)
   ============================ */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS   // Gmail App Password
    }
});

// Verify transporter ONCE
transporter.verify((err) => {
    if (err) {
        console.error('❌ Email server error:', err);
    } else {
        console.log('✅ Email server ready');
    }
});


// =====================================
// In-memory OTP Store (email → otp)
// =====================================
const emailOtpStore = new Map();

function generateOtp() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// =====================================
// POST /api/auth/login
// =====================================
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 4 })
], async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        if (!user.is_active) {
            return res.status(401).json({ success: false, error: 'Account deactivated' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // ===============================
        // STUDENT → EMAIL OTP REQUIRED
        // ===============================
        if (user.role === 'student') {

            const otp = generateOtp();          // e.g. 6-digit
            const tempToken = crypto.randomUUID();

            emailOtpStore.set(tempToken, {
                otp,
                userId: user.id,
                expiresAt: Date.now() + 5 * 60 * 1000
            });

            /* ===============================
               SEND OTP EMAIL (BACKEND)
               =============================== */
            await transporter.sendMail({
                from: `"GeoQR System" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: 'GeoQR Login OTP',
                html: `
                    <h2>GeoQR Login Verification</h2>
                    <p>Your OTP is:</p>
                    <h1>${otp}</h1>
                    <p>This OTP is valid for 5 minutes.</p>
                `
            });

            console.log(`📧 OTP sent to ${user.email}`);

            return res.json({
                success: true,
                requiresOtp: true,
                tempToken
            });
        }

        // ===============================
        // FACULTY / ADMIN → DIRECT LOGIN
        // ===============================
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

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});


// =====================================
// POST /api/auth/verify-email-otp
// =====================================
router.post('/verify-email-otp', async (req, res) => {
    const { tempToken, otp } = req.body;

    const record = emailOtpStore.get(tempToken);

    if (!record) {
        return res.status(400).json({ success: false, error: 'OTP expired or invalid' });
    }

    if (record.expiresAt < Date.now()) {
        emailOtpStore.delete(tempToken);
        return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    emailOtpStore.delete(tempToken);

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

// =====================================
// POST /api/auth/register
// =====================================
router.post('/register', [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['student', 'faculty', 'admin']),
    body('studentId').optional().trim()
], async (req, res) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role, studentId } = req.body;

    try {
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }

        const hash = bcrypt.hashSync(password, 12);

        const result = await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [name, email, hash, role, studentId || null]
        );

        const token = jwt.sign(
            { userId: result.rows[0].id, role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
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

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

// =====================================
// GET /api/auth/me
// =====================================
router.get('/me', authenticate, (req, res) => {
    res.json({ success: true, user: req.user });
});

// =====================================
// POST /api/auth/logout
// =====================================
router.post('/logout', authenticate, (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
