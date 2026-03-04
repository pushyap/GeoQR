/**
 * System Settings Utility
 * Fetches settings from the system_settings DB table with defaults
 */
const { db } = require('../config/database');

const DEFAULTS = {
    qr_expiry: '60',
    max_distance: '50',
    system_name: 'GeoQR Attendance',
    late_threshold: '10',
    session_timeout: '120',
    enable_gps_validation: 'true',
    enable_otp: 'true',
    allow_multiple_scans: 'false',
    timezone: 'Asia/Kolkata'
};

/**
 * Get all system settings merged with defaults
 * @returns {Promise<Object>} Settings object with all keys
 */
async function getSystemSettings() {
    try {
        const result = await db.query('SELECT key, value FROM system_settings');
        const dbSettings = {};
        result.rows.forEach(row => {
            dbSettings[row.key] = row.value;
        });
        return { ...DEFAULTS, ...dbSettings };
    } catch (error) {
        console.error('Failed to load system settings, using defaults:', error.message);
        return { ...DEFAULTS };
    }
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @returns {Promise<string>} Setting value
 */
async function getSetting(key) {
    try {
        const result = await db.query(
            'SELECT value FROM system_settings WHERE key = $1',
            [key]
        );
        return result.rows.length > 0 ? result.rows[0].value : (DEFAULTS[key] || null);
    } catch (error) {
        return DEFAULTS[key] || null;
    }
}

module.exports = { getSystemSettings, getSetting, DEFAULTS };
