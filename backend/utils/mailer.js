/**
 * GeoQR Email Utility
 * Nodemailer configuration with professional email templates
 */

const nodemailer = require('nodemailer');
require('dotenv').config();

// Email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Add timeouts to prevent hanging
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,   // 10 seconds
    socketTimeout: 10000      // 10 seconds
});

// Verify connection on startup
transporter.verify((err) => {
    if (err) {
        console.error('❌ Email server error:', err.message);
    } else {
        console.log('✅ Email server ready');
    }
});

/**
 * Email Templates
 */
const templates = {
    // Registration OTP
    registrationOtp: (name, otp) => ({
        subject: 'GeoQR - Verify Your Registration',
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
                        <p>Thank you for registering with GeoQR Attendance System. Please verify your email with the OTP below:</p>
                        <div class="otp-box">
                            <p class="otp">${otp}</p>
                        </div>
                        <p>This code expires in <strong>5 minutes</strong>.</p>
                        <p>If you didn't request this, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System | College Project</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Login OTP
    loginOtp: (name, otp) => ({
        subject: 'GeoQR - Login Verification',
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
                        <p>If you didn't attempt to login, please secure your account.</p>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System | College Project</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Welcome Email
    welcome: (name, role) => ({
        subject: 'Welcome to GeoQR Attendance System!',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
                    .header { background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%); padding: 30px; text-align: center; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { padding: 30px; color: #e2e8f0; }
                    .role-badge { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: white; padding: 8px 20px; border-radius: 20px; font-weight: bold; text-transform: capitalize; }
                    .features { background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; }
                    .features li { margin: 10px 0; color: #94a3b8; }
                    .footer { padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center; }
                    p { line-height: 1.6; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Welcome to GeoQR!</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>Your account has been successfully created!</p>
                        <p>Role: <span class="role-badge">${role}</span></p>
                        <div class="features">
                            <p><strong>What you can do:</strong></p>
                            <ul>
                                ${role === 'student' ? `
                                    <li>✅ Scan QR codes to mark attendance</li>
                                    <li>📊 View your attendance history</li>
                                    <li>📈 Track your attendance percentage</li>
                                ` : role === 'admin' ? `
                                    <li>📍 Manage attendance locations</li>
                                    <li>📱 Configure QR devices</li>
                                    <li>📊 View attendance reports</li>
                                ` : `
                                    <li>📋 Manage sessions</li>
                                    <li>👥 View student attendance</li>
                                    <li>📊 Generate reports</li>
                                `}
                            </ul>
                        </div>
                        <p>Get started by logging in to your dashboard!</p>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System | College Project</p>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Password Reset OTP
    passwordReset: (name, otp) => ({
        subject: 'GeoQR - Password Reset',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; margin: 0; padding: 20px; }
                    .container { max-width: 500px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; }
                    .header { background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); padding: 30px; text-align: center; }
                    .header h1 { color: white; margin: 0; font-size: 28px; }
                    .content { padding: 30px; color: #e2e8f0; }
                    .otp-box { background: #0f172a; border: 2px solid #ef4444; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp { font-size: 36px; font-weight: bold; color: #f97316; letter-spacing: 8px; margin: 0; }
                    .warning { background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 12px 16px; margin: 15px 0; border-radius: 0 8px 8px 0; }
                    .footer { padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center; }
                    p { line-height: 1.6; margin: 10px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔑 Password Reset</h1>
                    </div>
                    <div class="content">
                        <p>Hi <strong>${name}</strong>,</p>
                        <p>We received a request to reset your password. Use the OTP below to proceed:</p>
                        <div class="otp-box">
                            <p class="otp">${otp}</p>
                        </div>
                        <p>This code expires in <strong>10 minutes</strong>.</p>
                        <div class="warning">
                            <p style="margin: 0;"><strong>⚠️ Security Notice:</strong> If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
                        </div>
                    </div>
                    <div class="footer">
                        <p>© 2024 GeoQR Attendance System | College Project</p>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

/**
 * Send email helper
 */
async function sendEmail(to, templateName, ...args) {
    const template = templates[templateName];
    if (!template) {
        throw new Error(`Email template '${templateName}' not found`);
    }

    const { subject, html } = template(...args);

    try {
        await transporter.sendMail({
            from: `"GeoQR System" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log(`📧 Email sent to ${to}: ${templateName}`);
        return true;
    } catch (error) {
        console.error(`❌ Email failed to ${to}:`, error.message);
        throw error;
    }
}

module.exports = {
    transporter,
    sendEmail,
    templates
};
