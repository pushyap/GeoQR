/**
 * Authentication Routes
 * Email-based OTP for both Login and Registration
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { sendEmail } = require('../utils/mailer');

const router = express.Router();
require('dotenv').config();

// =====================================
// In-memory OTP Stores
// =====================================
const loginOtpStore = new Map();      // For login OTP
const registrationStore = new Map();   // For registration OTP (pending users)

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

    console.log('🔐 Login attempt:', email);

    try {
        const result = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        const user = result.rows[0];
        console.log('👤 User found:', user ? `${user.email} (${user.role})` : 'NOT FOUND');

        if (!user) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        console.log('🔑 is_active:', user.is_active);
        if (!user.is_active) {
            return res.status(401).json({ success: false, error: 'Account deactivated' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        console.log('🔒 Password valid:', validPassword);

        if (!validPassword) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // ===============================
        // ALL ROLES → EMAIL OTP REQUIRED
        // ===============================
        const otp = generateOtp();
        const tempToken = crypto.randomUUID();

        loginOtpStore.set(tempToken, {
            otp,
            userId: user.id,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // Send OTP email
        console.log(`📧 Sending OTP to ${user.email}...`);
        console.log(`🔑 OTP: ${otp}`); // Visible in Render logs
        try {
            await sendEmail(user.email, 'loginOtp', user.name, otp);
            console.log('✅ Email sent successfully');
        } catch (emailErr) {
            console.warn('⚠️ Email failed (Allowing login to proceed):', emailErr.message);
            // Fallback: Proceed even if email fails
        }

        return res.json({
            success: true,
            requiresOtp: true,
            tempToken
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// =====================================
// POST /api/auth/verify-email-otp (LOGIN)
// =====================================
router.post('/verify-email-otp', async (req, res) => {
    const { tempToken, otp } = req.body;

    const record = loginOtpStore.get(tempToken);

    if (!record) {
        return res.status(400).json({ success: false, error: 'OTP expired or invalid' });
    }

    if (record.expiresAt < Date.now()) {
        loginOtpStore.delete(tempToken);
        return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    loginOtpStore.delete(tempToken);

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

    console.log(`✅ OTP Verified for ${user.email} (Role: ${user.role})`);

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
// Sends OTP for verification
// =====================================
router.post('/register', [
    body('name').trim().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('role').isIn(['student', 'faculty', 'admin']),
    body('studentId')
        .if(body('role').equals('student'))
        .trim()
        .notEmpty()
        .withMessage('Student ID is required for students')
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
        // Check if email already exists
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Email already exists'
            });
        }

        // Generate OTP and temp token
        const otp = generateOtp();
        const tempToken = crypto.randomUUID();
        const hash = bcrypt.hashSync(password, 12);

        // Store pending registration
        registrationStore.set(tempToken, {
            otp,
            name,
            email,
            passwordHash: hash,
            role,
            studentId: role === 'student' ? studentId : null,
            expiresAt: Date.now() + 5 * 60 * 1000
        });

        // Send OTP email
        try {
            await sendEmail(email, 'registrationOtp', name, otp);
        } catch (err) {
            console.error('⚠️ Registration email failed:', err.message);
        }

        res.status(200).json({
            success: true,
            requiresOtp: true,
            tempToken,
            message: 'OTP sent to your email'
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

// =====================================
// POST /api/auth/verify-registration-otp
// =====================================
router.post('/verify-registration-otp', async (req, res) => {
    const { tempToken, otp } = req.body;

    const record = registrationStore.get(tempToken);

    if (!record) {
        return res.status(400).json({ success: false, error: 'OTP expired or invalid' });
    }

    if (record.expiresAt < Date.now()) {
        registrationStore.delete(tempToken);
        return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    registrationStore.delete(tempToken);

    try {
        // Create user in database
        const result = await db.query(
            `INSERT INTO users 
             (name, email, password_hash, role, student_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, name, email, role, student_id`,
            [record.name, record.email, record.passwordHash, record.role, record.studentId]
        );

        const user = result.rows[0];

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Send welcome email (async, don't wait)
        sendEmail(user.email, 'welcome', user.name, user.role).catch(console.error);

        res.status(201).json({
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
        console.error('Registration verification error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to complete registration'
        });
    }
});

// =====================================
// POST /api/auth/resend-otp
// =====================================
router.post('/resend-otp', async (req, res) => {
    const { tempToken, type } = req.body; // type: 'login' or 'registration'

    const store = type === 'login' ? loginOtpStore : registrationStore;
    const record = store.get(tempToken);

    if (!record) {
        return res.status(400).json({ success: false, error: 'Session expired. Please start again.' });
    }

    // Generate new OTP
    const newOtp = generateOtp();
    record.otp = newOtp;
    record.expiresAt = Date.now() + 5 * 60 * 1000;
    store.set(tempToken, record);

    try {
        if (type === 'login') {
            const user = await db.query('SELECT name, email FROM users WHERE id = $1', [record.userId]);
            await sendEmail(user.rows[0].email, 'loginOtp', user.rows[0].name, newOtp);
        } else {
            await sendEmail(record.email, 'registrationOtp', record.name, newOtp);
        }

        res.json({ success: true, message: 'OTP resent successfully' });
    } catch (err) {
        console.error('Resend OTP error:', err);
        res.status(500).json({ success: false, error: 'Failed to resend OTP' });
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

// =====================================
// In-memory store for password reset
// =====================================
const passwordResetStore = new Map();

// =====================================
// POST /api/auth/forgot-password
// =====================================
router.post('/forgot-password', [
    body('email').isEmail().normalizeEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email } = req.body;

    try {
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            // Don't reveal if user exists
            return res.json({
                success: true,
                message: 'If an account exists, an OTP has been sent to your email.'
            });
        }

        const otp = generateOtp();
        const tempToken = crypto.randomUUID();

        passwordResetStore.set(tempToken, {
            otp,
            userId: user.id,
            email: user.email,
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        });

        // Send password reset OTP email
        await sendEmail(user.email, 'passwordReset', user.name, otp);

        res.json({
            success: true,
            message: 'OTP sent to your email',
            tempToken
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// =====================================
// POST /api/auth/verify-reset-otp
// =====================================
router.post('/verify-reset-otp', [
    body('tempToken').notEmpty(),
    body('otp').isLength({ min: 4, max: 4 })
], async (req, res) => {
    const { tempToken, otp } = req.body;

    const record = passwordResetStore.get(tempToken);

    if (!record) {
        return res.status(400).json({ success: false, error: 'Session expired' });
    }

    if (Date.now() > record.expiresAt) {
        passwordResetStore.delete(tempToken);
        return res.status(400).json({ success: false, error: 'OTP expired' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    // OTP verified, generate reset token
    const resetToken = crypto.randomUUID();
    record.resetToken = resetToken;
    record.otpVerified = true;
    passwordResetStore.set(tempToken, record);

    res.json({
        success: true,
        message: 'OTP verified',
        resetToken
    });
});

// =====================================
// POST /api/auth/reset-password
// =====================================
router.post('/reset-password', [
    body('resetToken').notEmpty(),
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { resetToken, newPassword } = req.body;

    // Find the record with this resetToken
    let foundRecord = null;
    let foundTempToken = null;

    for (const [tempToken, record] of passwordResetStore.entries()) {
        if (record.resetToken === resetToken && record.otpVerified) {
            foundRecord = record;
            foundTempToken = tempToken;
            break;
        }
    }

    if (!foundRecord) {
        return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    if (Date.now() > foundRecord.expiresAt + 5 * 60 * 1000) {
        passwordResetStore.delete(foundTempToken);
        return res.status(400).json({ success: false, error: 'Reset session expired' });
    }

    try {
        const hashedPassword = bcrypt.hashSync(newPassword, 12);

        await db.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, foundRecord.userId]
        );

        passwordResetStore.delete(foundTempToken);

        res.json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.'
        });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, error: 'Failed to reset password' });
    }
});

module.exports = router;
