/**
 * Webhook Routes for GeoQR
 * Handles Resend inbound emails and email events
 * Includes signature verification for security
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { processInboundEmail } = require('../utils/mailer');

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

/**
 * Verify Resend webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - svix-signature header
 * @param {string} timestamp - svix-timestamp header
 * @returns {boolean}
 */
function verifyWebhookSignature(payload, signature, timestamp) {
    if (!WEBHOOK_SECRET) {
        console.warn('⚠️ RESEND_WEBHOOK_SECRET not set - skipping verification');
        return true; // Skip verification if secret not configured
    }

    try {
        // Resend uses Svix for webhooks
        const signedContent = `${timestamp}.${payload}`;
        const expectedSignature = crypto
            .createHmac('sha256', WEBHOOK_SECRET)
            .update(signedContent)
            .digest('base64');

        // Signature header format: v1,signature
        const signatureParts = signature.split(',');
        const actualSignature = signatureParts.find(s => s.startsWith('v1,'))?.replace('v1,', '')
            || signatureParts[1];

        return crypto.timingSafeEquals(
            Buffer.from(expectedSignature),
            Buffer.from(actualSignature || '')
        );
    } catch (error) {
        console.error('Signature verification error:', error.message);
        return false;
    }
}

/**
 * Middleware to verify webhook signature
 */
function verifySignature(req, res, next) {
    const signature = req.headers['svix-signature'];
    const timestamp = req.headers['svix-timestamp'];
    const messageId = req.headers['svix-id'];

    // If no signature headers, might be a test or signature not configured
    if (!signature || !timestamp) {
        if (WEBHOOK_SECRET) {
            console.warn('⚠️ Missing signature headers on webhook request');
            return res.status(401).json({ error: 'Missing signature' });
        }
        return next();
    }

    // Check timestamp to prevent replay attacks (5 min tolerance)
    const timestampDate = new Date(parseInt(timestamp) * 1000);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (Math.abs(now - timestampDate) > fiveMinutes) {
        console.warn('⚠️ Webhook timestamp too old');
        return res.status(401).json({ error: 'Timestamp too old' });
    }

    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature, timestamp)) {
        console.warn('⚠️ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log(`✅ Webhook signature verified (ID: ${messageId})`);
    next();
}

/**
 * POST /api/webhook/email
 * Resend inbound email webhook endpoint
 */
router.post('/email', verifySignature, async (req, res) => {
    try {
        const payload = req.body;

        if (!payload || !payload.from) {
            return res.status(400).json({
                success: false,
                error: 'Invalid webhook payload'
            });
        }

        console.log('📬 Received inbound email webhook');

        const result = await processInboundEmail(payload);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: 'Email processed successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.message
            });
        }
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Webhook processing failed'
        });
    }
});

/**
 * POST /api/webhook/email/events
 * Resend email events webhook (delivery, bounce, open, click, etc.)
 */
router.post('/email/events', verifySignature, async (req, res) => {
    try {
        const event = req.body;

        console.log(`📊 Email event received: ${event.type}`);
        console.log(`   Email ID: ${event.data?.email_id || 'N/A'}`);

        switch (event.type) {
            case 'email.received':
                console.log('   📩 Incoming email received');
                console.log('   From:', event.data.from);
                console.log('   To:', event.data.to);
                console.log('   Subject:', event.data.subject);

                // Fetch full email content
                if (event.data.email_id) {
                    try {
                        const email = await require('../utils/mailer').resend.emails.get(event.data.email_id);
                        console.log('   📄 Email Body Fetched:', email.data ? (email.data.subject || 'No subject') : 'Failed to fetch');
                        // TODO: Store in DB or trigger Logic
                    } catch (err) {
                        console.error('   ❌ Failed to fetch email content:', err.message);
                    }
                }
                break;
            case 'email.sent':
                console.log('   ✅ Email sent');
                break;
            case 'email.delivered':
                console.log('   📬 Email delivered');
                break;
            case 'email.opened':
                console.log('   👁️ Email opened');
                break;
            case 'email.clicked':
                console.log('   🔗 Link clicked');
                break;
            case 'email.bounced':
                console.log('   ⚠️ Email bounced:', event.data?.bounce_type);
                break;
            case 'email.complained':
                console.log('   🚫 Spam complaint');
                break;
            default:
                console.log(`   ℹ️ Event: ${event.type}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('❌ Email event webhook error:', error.message);
        res.status(500).json({ error: 'Event processing failed' });
    }
});

module.exports = router;
