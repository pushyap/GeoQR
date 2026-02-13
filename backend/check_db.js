
const { db, initDB } = require('./config/database');
require('dotenv').config();

async function check() {
    try {
        await initDB();

        const counts = await Promise.all([
            db.query('SELECT COUNT(*) FROM users'),
            db.query('SELECT COUNT(*) FROM sessions'),
            db.query('SELECT COUNT(*) FROM locations'),
            db.query('SELECT COUNT(*) FROM attendance_logs'),
            db.query("SELECT id, name, role FROM users WHERE role = 'faculty' LIMIT 5")
        ]);

        console.log('--- Database Check ---');
        console.log('Users:', counts[0].rows[0].count);
        console.log('Sessions:', counts[1].rows[0].count);
        console.log('Locations:', counts[2].rows[0].count);
        console.log('Attendance Logs:', counts[3].rows[0].count);
        console.log('Faculty Samples:', counts[4].rows);

        process.exit(0);
    } catch (e) {
        console.error('Check failed:', e);
        process.exit(1);
    }
}

check();
