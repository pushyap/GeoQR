/**
 * Quick script to reset admin password
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function resetPassword() {
    console.log('🔄 Starting password reset...');
    const email = '23ituos155@ddu.ac.in'; // As per logs
    const newPassword = '123456';
    const hash = bcrypt.hashSync(newPassword, 12);

    try {
        const result = await pool.query(
            'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING email, role',
            [hash, email]
        );

        if (result.rowCount > 0) {
            console.log('✅ Password updated successfully!');
            console.log(`   Email: ${email}`);
            console.log(`   New Password: ${newPassword}`);
        } else {
            console.log('❌ User not found:', email);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

resetPassword();
