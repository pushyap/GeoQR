
const { db, initDB } = require('./config/database');
require('dotenv').config();

async function run() {
    try {
        await initDB();
        const users = await db.query("SELECT id, name, role, email FROM users LIMIT 10");
        const sessions = await db.query("SELECT id, subject, faculty_id FROM sessions LIMIT 10");
        const locations = await db.query("SELECT id, name FROM locations LIMIT 10");

        console.log('--- DATABASE DUMP ---');
        console.log('USERS:', JSON.stringify(users.rows, null, 2));
        console.log('SESSIONS:', JSON.stringify(sessions.rows, null, 2));
        console.log('LOCATIONS:', JSON.stringify(locations.rows, null, 2));
        process.exit(0);
    } catch (e) {
        console.error('DB DUMP FAILED:', e.message);
        process.exit(1);
    }
}
run();
