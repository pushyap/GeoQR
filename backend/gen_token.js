
const { db, initDB } = require('./config/database');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function run() {
    try {
        await initDB();
        const res = await db.query("SELECT id, name, role, email FROM users WHERE role = 'faculty' LIMIT 1");
        if (res.rows.length === 0) {
            console.log('No faculty found');
            process.exit(0);
        }
        const user = res.rows[0];
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        console.log('--- TEST DATA ---');
        console.log('User:', JSON.stringify(user));
        console.log('Token:', token);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
