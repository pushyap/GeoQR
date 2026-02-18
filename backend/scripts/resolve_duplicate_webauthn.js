#!/usr/bin/env node
/**
 * Resolve duplicate webauthn credentials per user by keeping the newest entry.
 * Usage:
 *   # Dry run (default)
 *   node resolve_duplicate_webauthn.js
 *
 *   # To actually delete duplicates, set CONFIRM=1
 *   CONFIRM=1 node resolve_duplicate_webauthn.js
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
  const client = await pool.connect();

  try {
    // Find users with more than one credential
    const dupRes = await client.query(`
      SELECT user_id, array_agg(id ORDER BY created_at DESC) AS ids
      FROM webauthn_credentials
      GROUP BY user_id
      HAVING COUNT(*) > 1
    `);

    if (dupRes.rows.length === 0) {
      console.log('No duplicate credentials found. Nothing to do.');
      await client.release();
      await pool.end();
      process.exit(0);
    }

    console.log('Found users with duplicate credentials:');
    let totalToDelete = 0;
    const deletions = [];

    for (const row of dupRes.rows) {
      const userId = row.user_id;
      const ids = row.ids; // ordered newest -> oldest
      const keep = ids[0];
      const remove = ids.slice(1);
      totalToDelete += remove.length;
      console.log(` user_id=${userId} keep=${keep} remove=${remove.join(',')}`);
      deletions.push({ userId, keep, remove });
    }

    if (!process.env.CONFIRM) {
      console.log('\nDry run complete. To actually delete duplicates, re-run with CONFIRM=1');
      process.exit(0);
    }

    console.log('\nDeleting duplicates...');
    for (const d of deletions) {
      await client.query('DELETE FROM webauthn_credentials WHERE id = ANY($1)', [d.remove]);
      console.log(`Deleted ${d.remove.length} credentials for user ${d.userId}`);
    }

    console.log(`\nDeleted ${totalToDelete} credential(s).`);

    await client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Error resolving duplicates:', err);
    process.exit(1);
  }
}

main();
