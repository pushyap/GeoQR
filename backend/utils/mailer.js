/**
 * GeoQR Email Utility
 * Enhanced Nodemailer configuration with Gmail App Password support
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// Validate email configuration
const EMAIL_USER = process.env.EMAIL_USER || process.env.GMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS || process.env.GMAIL_APP_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn('⚠️ Email credentials not configured. Set EMAIL_USER and EMAIL_PASS in .env');
}

// Create transporter with Gmail configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS  // Must be App Password (16 chars) from myaccount.google.com/apppasswords
    },
    // Timeouts to prevent hanging
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

// Verify connection on startup
transporter.verify((err) => {
    if (err) {
        console.error('❌ Email server error:', err.message);
        console.log('📝 To fix: Enable 2FA on Gmail, then create App Password at:');
        console.log('   https://myaccount.google.com/apppasswords');
    } else {
        console.log('✅ Email server ready');
    }
});

/**
 * Email Templates
 */
const templates = {
    // Login OTP
    loginOtp: (name, otp) => ({
        subject: 'GeoQR - Login Verification Code',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
                    .header { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; text-align: center; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { padding: 30px; color: #e2e8f0; }
                    .otp-box { background: #0f172a; border: 2px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp { font-size: 36px; font-weight: bold; color: #a855f7; letter-spacing: 8px; margin: 0; }
                    .footer { padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center; }
                    p { line-height: 1.6; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔐 GeoQR Login</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>Your login verification code is:</p>
                        <div class="otp-box">
                            <p class="otp">${otp}</p>
                        </div>
                        <p>This code expires in <strong>5 minutes</strong>.</p>
                        <p>If you didn't attempt to login, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Registration OTP
    registrationOtp: (name, otp) => ({
        subject: 'GeoQR - Verify Your Email',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
                    .header { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; text-align: center; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { padding: 30px; color: #e2e8f0; }
                    .otp-box { background: #0f172a; border: 2px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp { font-size: 36px; font-weight: bold; color: #a855f7; letter-spacing: 8px; margin: 0; }
                    .footer { padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center; }
                    p { line-height: 1.6; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎯 GeoQR</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>Your verification code is:</p>
                        <div class="otp-box">
                            <p class="otp">${otp}</p>
                        </div>
                        <p>This code expires in <strong>5 minutes</strong>.</p>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Welcome Email
    welcome: (name, role) => ({
        subject: 'Welcome to GeoQR!',
        html: `
            <div style="font-family: Arial; max-width: 500px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #6366f1;">Welcome to GeoQR!</h1>
                <p>Hi <strong>${name}</strong>,</p>
                <p>Your account (${role}) has been created successfully.</p>
                <p>You can now login and start using the attendance system.</p>
            </div>
        `
    }),

    // Password Reset
    passwordReset: (name, otp) => ({
        subject: 'GeoQR - Password Reset',
        html: `
            <div style="font-family: Arial; max-width: 500px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #ef4444;">Password Reset</h1>
                <p>Hi <strong>${name}</strong>,</p>
                <p>Your password reset code is: <strong style="font-size: 24px;">${otp}</strong></p>
                <p>This code expires in 10 minutes.</p>
            </div>
        `
    })
};

/**
 * Send email with fallback logging
 */
async function sendEmail(to, templateName, ...args) {
    const template = templates[templateName];
    if (!template) {
        throw new Error(`Email template '${templateName}' not found`);
    }

    const { subject, html } = template(...args);

    try {
        const result = await transporter.sendMail({
            from: `"GeoQR System" <${EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`📧 Email sent to ${to}: ${templateName}`);
        return { success: true, messageId: result.messageId };
    } catch (error) {
        console.error(`❌ Email failed to ${to}:`, error.message);
        // Don't throw - allow process to continue
        return { success: false, error: error.message };
    }
}

module.exports = {
    transporter,
    sendEmail,
    templates
};
