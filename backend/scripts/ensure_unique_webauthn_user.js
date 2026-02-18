#!/usr/bin/env node
/**
 * Ensure unique webauthn per user migration helper
 * - Connects to DATABASE_URL
 * - Detects users with multiple credentials and aborts with instructions
 * - If safe, creates unique index on user_id
 */

require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set in environment. Aborting.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    const client = await pool.connect();

    // Find users with more than 1 credential
    const dupRes = await client.query(`
      SELECT user_id, COUNT(*) AS cnt
      FROM webauthn_credentials
      GROUP BY user_id
      HAVING COUNT(*) > 1
    `);

    if (dupRes.rows.length > 0) {
      console.error('Found users with multiple passkeys. Please resolve before creating unique index:');
      dupRes.rows.forEach(r => console.error(`  user_id=${r.user_id} count=${r.cnt}`));
      console.error('\nOptions:');
      console.error('  - Manually review and remove duplicate credentials for affected users');
      console.error('  - Or run a script to keep the most recent credential per user and delete others');
      process.exit(3);
    }

    console.log('No duplicate credentials found. Creating unique index...');
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS webauthn_unique_user ON webauthn_credentials (user_id)`);
    console.log('Unique index created successfully.');

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Migration helper error:', err);
    process.exit(1);
  }
}

main();
