/**
 * Session Helper - Persistent Auto-End Logic
 */
const { db } = require('../config/database');

/**
 * Automatically end all sessions that have passed their finish time
 * but are still marked as active.
 */
async function autoEndSessions() {
    try {
        // Find sessions that should be ended
        const expiredResult = await db.query(`
            UPDATE sessions 
            SET is_active = false 
            WHERE is_active = true 
            AND end_time < CURRENT_TIMESTAMP
            RETURNING id, subject, end_time
        `);

        if (expiredResult.rowCount > 0) {
            console.log(`🧹 Auto-ended ${expiredResult.rowCount} expired sessions:`);
            expiredResult.rows.forEach(s => {
                console.log(`   - [ID: ${s.id}] ${s.subject} (Scheduled end: ${s.end_time})`);
            });
        }

        return expiredResult.rowCount;
    } catch (err) {
        console.error('❌ Session auto-end cleanup failed:', err.message);
        return 0;
    }
}

module.exports = { autoEndSessions };
