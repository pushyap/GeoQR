/**
 * Database Configuration - Neon PostgreSQL
 */
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
    console.log('✅ Connected to Neon PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Database pool error:', err);
});

const db = {
    async query(sql, params = []) {
        const client = await pool.connect();
        try {
            const result = await client.query(sql, params);
            return result;
        } finally {
            client.release();
        }
    },

    prepare(sql) {
        return {
            async run(...params) {
                const result = await db.query(sql, params);
                return {
                    lastInsertRowid: result.rows[0]?.id,
                    changes: result.rowCount
                };
            },
            async get(...params) {
                const result = await db.query(sql, params);
                return result.rows[0];
            },
            async all(...params) {
                const result = await db.query(sql, params);
                return result.rows;
            }
        };
    }
};

/**
 * Initialize database schema - creates tables in correct order
 */
async function initializeDatabase() {
    try {
        // 1. Users table (no foreign keys)
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'faculty', 'admin', 'device')),
                student_id VARCHAR(50) UNIQUE,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Locations table (no foreign keys)
        await db.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                radius INTEGER DEFAULT 50,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. Devices table (references locations)
        await db.query(`
            CREATE TABLE IF NOT EXISTS devices (
                id SERIAL PRIMARY KEY,
                device_code VARCHAR(50) UNIQUE NOT NULL,
                device_name VARCHAR(100),
                password_hash VARCHAR(255),
                location_id INTEGER REFERENCES locations(id),
                is_active BOOLEAN DEFAULT true,
                last_active TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. Sessions table (references users, locations)
        await db.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                faculty_id INTEGER REFERENCES users(id),
                location_id INTEGER REFERENCES locations(id),
                subject VARCHAR(100),
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP,
                is_active BOOLEAN DEFAULT true,
                expected_students INTEGER DEFAULT 60
            )
        `);

        // Migration: add expected_students if missing (for existing databases)
        await db.query(`
            ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expected_students INTEGER DEFAULT 60
        `);

        // 5. QR Tokens table (references devices, locations, sessions)
        await db.query(`
            CREATE TABLE IF NOT EXISTS qr_tokens (
                id SERIAL PRIMARY KEY,
                token_hash VARCHAR(255) NOT NULL,
                raw_token VARCHAR(255),
                device_id INTEGER REFERENCES devices(id),
                location_id INTEGER REFERENCES locations(id),
                session_id INTEGER REFERENCES sessions(id),
                expires_at TIMESTAMP NOT NULL,
                is_used BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 6. Attendance Logs table (references users, sessions, locations, devices)
        await db.query(`
            CREATE TABLE IF NOT EXISTS attendance_logs (
                id SERIAL PRIMARY KEY,
                student_id INTEGER REFERENCES users(id),
                session_id INTEGER REFERENCES sessions(id),
                location_id INTEGER REFERENCES locations(id),
                device_id INTEGER REFERENCES devices(id),
                latitude DECIMAL(10, 8),
                longitude DECIMAL(11, 8),
                distance_from_device INTEGER,
                status VARCHAR(20) DEFAULT 'present',
                marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(student_id, session_id)
            )
        `);

        // 7. Device Sessions table (JWT session tracking)
        await db.query(`
            CREATE TABLE IF NOT EXISTS device_sessions (
                id SERIAL PRIMARY KEY,
                device_id INTEGER REFERENCES devices(id),
                token_hash VARCHAR(255) NOT NULL,
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                is_revoked BOOLEAN DEFAULT false
            )
        `);

        // 8. Device Activity Logs table (audit trail)
        await db.query(`
            CREATE TABLE IF NOT EXISTS device_activity_logs (
                id SERIAL PRIMARY KEY,
                device_id INTEGER REFERENCES devices(id),
                action VARCHAR(50) NOT NULL,
                details JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 9. QR Nonces table (replay prevention)
        await db.query(`
            CREATE TABLE IF NOT EXISTS qr_nonces (
                id SERIAL PRIMARY KEY,
                nonce VARCHAR(64) UNIQUE NOT NULL,
                device_id INTEGER REFERENCES devices(id),
                used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 10. System Settings table
        await db.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(50) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 11. Student Passkeys table (WebAuthn credentials)
        await db.query(`
            CREATE TABLE IF NOT EXISTS student_passkeys (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                credential_id TEXT UNIQUE NOT NULL,
                public_key TEXT NOT NULL,
                counter INTEGER DEFAULT 0,
                device_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP
            )
        `);

        // 12. WebAuthn Challenges table (short-lived, 2-min expiry)
        await db.query(`
            CREATE TABLE IF NOT EXISTS webauthn_challenges (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                challenge TEXT NOT NULL,
                type VARCHAR(20) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes
        await db.query('CREATE INDEX IF NOT EXISTS idx_tokens_hash ON qr_tokens(token_hash)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_tokens_expires ON qr_tokens(expires_at)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_logs(student_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance_logs(session_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_device_sessions_device ON device_sessions(device_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_device_activity_device ON device_activity_logs(device_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_nonces_nonce ON qr_nonces(nonce)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_passkeys_student ON student_passkeys(student_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_passkeys_credential ON student_passkeys(credential_id)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_challenges_user ON webauthn_challenges(user_id)');

        console.log('✅ Database schema initialized');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        throw error;
    }
}

async function initDB() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ Database connection established');
        return true;
    } catch (error) {
        console.error('❌ Failed to connect to database:', error.message);
        throw error;
    }
}

module.exports = { db, pool, initDB, initializeDatabase };
