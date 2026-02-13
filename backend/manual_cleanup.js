
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('--- Manual SQL Cleanup ---');
        console.log('DATABASE_URL:', process.env.DATABASE_URL.substring(0, 30) + '...');

        const res = await pool.query(`
            UPDATE sessions 
            SET is_active = false 
            WHERE is_active = true 
            AND end_time < CURRENT_TIMESTAMP
            RETURNING id, subject, end_time
        `);

        console.log(`Updated ${res.rowCount} sessions.`);
        if (res.rowCount > 0) {
            res.rows.forEach(s => console.log(`- ${s.id}: ${s.subject} (Finished: ${s.end_time})`));
        }

        await pool.end();
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}
run();
