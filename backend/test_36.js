
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('--- Targeted Cleanup (ID 36) ---');

        // Check current state again
        const check = await pool.query('SELECT is_active, end_time, CURRENT_TIMESTAMP as now FROM sessions WHERE id = 36');
        console.log('Current state:', check.rows[0]);

        // Try update
        const res = await pool.query(`
            UPDATE sessions 
            SET is_active = false 
            WHERE id = 36 
            AND is_active = true 
            AND end_time < CURRENT_TIMESTAMP
            RETURNING id, is_active
        `);

        console.log('Update result:', res.rows);
        console.log('Rows affected:', res.rowCount);

        await pool.end();
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}
run();
