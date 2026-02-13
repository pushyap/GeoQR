
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sessions'");
        console.log('Columns:', res.rows);
        await pool.end();
    } catch (e) {
        console.error(e);
    }
}
run();
