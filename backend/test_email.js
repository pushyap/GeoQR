
const { sendEmail } = require('./utils/mailer');
require('dotenv').config();

console.log('Testing email sending...');
console.log('User:', process.env.EMAIL_USER);

async function test() {
    try {
        console.log('Sending test email...');
        const start = Date.now();
        await sendEmail(process.env.EMAIL_USER, 'loginOtp', 'Test User', '1234');
        console.log('✅ Email sent successfully in', Date.now() - start, 'ms');
    } catch (err) {
        console.error('❌ Failed:', err);
    }
}

test();
