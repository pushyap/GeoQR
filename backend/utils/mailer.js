/**
 * GeoQR Email Utility
 * Resend API Integration for reliable email delivery
 */

const { Resend } = require('resend');
require('dotenv').config();

// Initialize Resend with API key
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@geo-qr.app';

if (!RESEND_API_KEY) {
    console.warn('⚠️ RESEND_API_KEY not configured in .env');
}

const resend = new Resend(RESEND_API_KEY);

// Log initialization
console.log('✅ Resend email service initialized');

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
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">🔐 GeoQR Login</h1>
                        </div>
                        <!-- Content -->
                        <div style="padding: 30px; color: #e2e8f0;">
                            <p style="line-height: 1.6; margin: 10px 0;">Hi <strong>${name}</strong>,</p>
                            <p style="line-height: 1.6; margin: 10px 0;">Your login verification code is:</p>
                            <!-- OTP Box -->
                            <div style="background: #0f172a; border: 2px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                                <p style="font-size: 36px; font-weight: bold; color: #a855f7; letter-spacing: 8px; margin: 0;">${otp}</p>
                            </div>
                            <p style="line-height: 1.6; margin: 10px 0;">This code expires in <strong>5 minutes</strong>.</p>
                            <p style="line-height: 1.6; margin: 10px 0; color: #94a3b8;">If you didn't attempt to login, please ignore this email.</p>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center;">
                            <p style="margin: 0;">© 2024 GeoQR Attendance System</p>
                        </div>
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
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">🎯 Welcome to GeoQR</h1>
                        </div>
                        <!-- Content -->
                        <div style="padding: 30px; color: #e2e8f0;">
                            <p style="line-height: 1.6; margin: 10px 0;">Hi <strong>${name}</strong>,</p>
                            <p style="line-height: 1.6; margin: 10px 0;">Thanks for registering! Your verification code is:</p>
                            <!-- OTP Box -->
                            <div style="background: #0f172a; border: 2px solid #22c55e; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                                <p style="font-size: 36px; font-weight: bold; color: #22c55e; letter-spacing: 8px; margin: 0;">${otp}</p>
                            </div>
                            <p style="line-height: 1.6; margin: 10px 0;">This code expires in <strong>5 minutes</strong>.</p>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center;">
                            <p style="margin: 0;">© 2024 GeoQR Attendance System</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Welcome Email
    welcome: (name, role) => ({
        subject: 'Welcome to GeoQR! 🎉',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #22c55e 0%, #06b6d4 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Welcome to GeoQR!</h1>
                        </div>
                        <!-- Content -->
                        <div style="padding: 30px; color: #e2e8f0;">
                            <p style="line-height: 1.6; margin: 10px 0;">Hi <strong>${name}</strong>,</p>
                            <p style="line-height: 1.6; margin: 10px 0;">Your <strong style="color: #a855f7;">${role}</strong> account has been created successfully!</p>
                            <p style="line-height: 1.6; margin: 10px 0;">You can now log in and start using the attendance system.</p>
                            <!-- Features Box -->
                            <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <p style="color: #6366f1; font-weight: bold; margin: 0 0 10px 0;">What you can do:</p>
                                <ul style="color: #94a3b8; margin: 0; padding-left: 20px;">
                                    <li style="margin: 5px 0;">Mark attendance with QR codes</li>
                                    <li style="margin: 5px 0;">View your attendance history</li>
                                    <li style="margin: 5px 0;">Track your attendance statistics</li>
                                </ul>
                            </div>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center;">
                            <p style="margin: 0;">© 2024 GeoQR Attendance System</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Password Reset
    passwordReset: (name, otp) => ({
        subject: 'GeoQR - Password Reset Request',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #ef4444 0%, #f97316 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">🔑 Password Reset</h1>
                        </div>
                        <!-- Content -->
                        <div style="padding: 30px; color: #e2e8f0;">
                            <p style="line-height: 1.6; margin: 10px 0;">Hi <strong>${name}</strong>,</p>
                            <p style="line-height: 1.6; margin: 10px 0;">We received a request to reset your password. Your reset code is:</p>
                            <!-- OTP Box -->
                            <div style="background: #0f172a; border: 2px solid #ef4444; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
                                <p style="font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px; margin: 0;">${otp}</p>
                            </div>
                            <p style="line-height: 1.6; margin: 10px 0;">This code expires in <strong>10 minutes</strong>.</p>
                            <p style="line-height: 1.6; margin: 10px 0; color: #94a3b8;">If you didn't request a password reset, please ignore this email or contact support.</p>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center;">
                            <p style="margin: 0;">© 2024 GeoQR Attendance System</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    }),

    // Attendance Confirmation
    attendanceConfirmation: (name, className, date, time, location) => ({
        subject: 'GeoQR - Attendance Marked ✓',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a;">
                <div style="max-width: 500px; margin: 0 auto; padding: 20px;">
                    <div style="background: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.3);">
                        <!-- Header -->
                        <div style="background: linear-gradient(135deg, #22c55e 0%, #10b981 100%); padding: 30px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 28px;">✅ Attendance Confirmed</h1>
                        </div>
                        <!-- Content -->
                        <div style="padding: 30px; color: #e2e8f0;">
                            <p style="line-height: 1.6; margin: 10px 0;">Hi <strong>${name}</strong>,</p>
                            <p style="line-height: 1.6; margin: 10px 0;">Your attendance has been successfully recorded!</p>
                            <!-- Details Box -->
                            <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <table style="width: 100%; color: #e2e8f0;">
                                    <tr><td style="padding: 8px 0; color: #94a3b8;">Class:</td><td style="padding: 8px 0; text-align: right; font-weight: bold;">${className}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #94a3b8;">Date:</td><td style="padding: 8px 0; text-align: right;">${date}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #94a3b8;">Time:</td><td style="padding: 8px 0; text-align: right;">${time}</td></tr>
                                    <tr><td style="padding: 8px 0; color: #94a3b8;">Location:</td><td style="padding: 8px 0; text-align: right;">${location}</td></tr>
                                </table>
                            </div>
                        </div>
                        <!-- Footer -->
                        <div style="padding: 20px 30px; background: #0f172a; color: #64748b; font-size: 12px; text-align: center;">
                            <p style="margin: 0;">© 2024 GeoQR Attendance System</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    })
};

/**
 * Send email using Resend API
 * @param {string} to - Recipient email address
 * @param {string} templateName - Name of the template to use
 * @param {...any} args - Arguments to pass to the template function
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail(to, templateName, ...args) {
    const template = templates[templateName];
    if (!template) {
        console.error(`❌ Email template '${templateName}' not found`);
        return { success: false, error: `Template '${templateName}' not found` };
    }

    const { subject, html } = template(...args);

    // SMART SENDER: If FROM_EMAIL already has <Name <email>>, use it. Else add "GeoQR".
    const sender = FROM_EMAIL.includes('<') ? FROM_EMAIL : `GeoQR <${FROM_EMAIL}>`;

    try {
        const { data, error } = await resend.emails.send({
            from: sender,
            to: [to],
            subject,
            html
        });

        if (error) {
            // Auto-fallback for unverified domains (common in dev)
            if (error.message && (error.message.includes('not verified') || error.message.includes('verified domain'))) {
                console.warn('⚠️ Domain not verified. Retrying with onboarding@resend.dev...');
                const fallback = await resend.emails.send({
                    from: 'onboarding@resend.dev',
                    to: [to],
                    subject,
                    html
                });

                if (!fallback.error) {
                    console.log(`✅ Fallback email sent to ${to} (ID: ${fallback.data.id})`);
                    return { success: true, id: fallback.data.id };
                } else {
                    console.error(`❌ Fallback also failed:`, fallback.error.message);

                    // Specific help for Sandbox restriction
                    if (fallback.error.message && fallback.error.message.includes('only send testing emails to your own email')) {
                        console.log('\n⚠️  RESEND SANDBOX LIMITATION DETECTED ⚠️');
                        console.log('   You are in Sandbox mode. You can ONLY send emails to the address you signed up with.');
                        console.log(`   👉 Try logging in with: ${fallback.error.message.match(/\((.*?)\)/)?.[1] || 'your registered email'}\n`);
                    }
                }
            }

            console.error(`❌ Email failed to ${to}:`, error.message);
            return { success: false, error: error.message };
        }

        console.log(`📧 Email sent to ${to}: ${templateName} (ID: ${data.id})`);
        return { success: true, id: data.id };
    } catch (error) {
        console.error(`❌ Email failed to ${to}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send custom email (not using template)
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} [options.text] - Plain text content
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendCustomEmail({ to, subject, html, text }) {
    try {
        // SMART SENDER: If FROM_EMAIL already has <Name <email>>, use it. Else add "GeoQR".
        const sender = FROM_EMAIL.includes('<') ? FROM_EMAIL : `GeoQR <${FROM_EMAIL}>`;

        const { data, error } = await resend.emails.send({
            from: sender,
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            text
        });

        if (error) {
            console.error(`❌ Custom email failed:`, error.message);
            return { success: false, error: error.message };
        }

        console.log(`📧 Custom email sent (ID: ${data.id})`);
        return { success: true, id: data.id };
    } catch (error) {
        console.error(`❌ Custom email failed:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Process inbound email from Resend webhook
 * @param {object} payload - Webhook payload from Resend
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function processInboundEmail(payload) {
    try {
        const { from, to, subject, text, html } = payload;

        console.log(`📬 Inbound email received:`);
        console.log(`   From: ${from}`);
        console.log(`   To: ${to}`);
        console.log(`   Subject: ${subject}`);

        // You can add custom logic here to process inbound emails
        // For example: auto-reply, parse commands, update database, etc.

        return { success: true, message: 'Inbound email processed' };
    } catch (error) {
        console.error(`❌ Inbound email processing failed:`, error.message);
        return { success: false, message: error.message };
    }
}

module.exports = {
    resend,
    sendEmail,
    sendCustomEmail,
    processInboundEmail,
    templates
};
