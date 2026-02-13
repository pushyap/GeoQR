
const { Client } = require('pg');
require('dotenv').config({ path: '../.env' });

async function checkSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to DB');

        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log('Tables in DB:');
        res.rows.forEach(row => console.log(' - ' + row.table_name));

        const challengesTable = res.rows.find(row => row.table_name === 'webauthn_challenges');
        if (challengesTable) {
            console.log('\nSUCCESS: webauthn_challenges table exists.');
        } else {
            console.log('\nFAILURE: webauthn_challenges table is MISSING.');
        }

    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        await client.end();
    }
}

checkSchema();
