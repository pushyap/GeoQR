
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query('SELECT NOW() as db_now, CURRENT_TIMESTAMP as db_ts');
        console.log('DB Time:', res.rows[0]);
        console.log('JS Time:', new Date().toISOString());

        const sessions = await pool.query('SELECT id, subject, start_time, end_time, is_active FROM sessions WHERE is_active = true LIMIT 5');
        console.log('Active Sessions:', JSON.stringify(sessions.rows, null, 2));

        await pool.end();
    } catch (e) {
        console.error(e);
    }
}
check();
