/**
 * Database Seed Script for Neon PostgreSQL
 */
require('dotenv').config();

const bcrypt = require('bcryptjs');
const { db, initDB, initializeDatabase } = require('../config/database');

async function seed() {
    console.log('🌱 Starting database seed...\n');

    try {
        await initDB();
        await initializeDatabase();

        // Add password_hash column to devices if it doesn't exist
        try {
            await db.query('ALTER TABLE devices ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)');
            console.log('✅ Devices table updated with password_hash column');
        } catch (e) {
            // Column might already exist
        }

        const password = bcrypt.hashSync('password123', 12);

        // Seed Users
        console.log('👤 Creating users...');

        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['Admin User', 'admin@geoqr.local', password, 'admin', null]
        );
        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['Dr. Sarah Wilson', 'sarah@geoqr.local', password, 'faculty', null]
        );
        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['Prof. Michael Brown', 'michael@geoqr.local', password, 'faculty', null]
        );
        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['John Doe', 'john@geoqr.local', password, 'student', 'STU001']
        );
        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['Jane Smith', 'jane@geoqr.local', password, 'student', 'STU002']
        );
        await db.query(
            `INSERT INTO users (name, email, password_hash, role, student_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING`,
            ['Alex Johnson', 'alex@geoqr.local', password, 'student', 'STU003']
        );

        console.log('   ✅ Created users');

        // Seed Locations
        console.log('📍 Creating locations...');

        await db.query(
            `INSERT INTO locations (name, latitude, longitude, radius) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            ['CS Lab - Room 101', 12.9716, 77.5946, 50]
        );
        await db.query(
            `INSERT INTO locations (name, latitude, longitude, radius) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            ['Lecture Hall A', 12.9720, 77.5950, 75]
        );
        await db.query(
            `INSERT INTO locations (name, latitude, longitude, radius) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            ['Library', 12.9714, 77.5944, 100]
        );

        console.log('   ✅ Created locations');

        // Get location IDs
        const locResult = await db.query('SELECT id FROM locations ORDER BY id LIMIT 3');

        // Seed Devices with passwords
        console.log('📱 Creating devices...');

        const devicePassword = bcrypt.hashSync('device123', 12);

        if (locResult.rows.length >= 3) {
            // Update existing devices to add passwords or insert new
            await db.query(
                `INSERT INTO devices (device_code, device_name, password_hash, location_id) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (device_code) DO UPDATE SET password_hash = $3`,
                ['DEV-001', 'CS Lab Display', devicePassword, locResult.rows[0].id]
            );
            await db.query(
                `INSERT INTO devices (device_code, device_name, password_hash, location_id) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (device_code) DO UPDATE SET password_hash = $3`,
                ['DEV-002', 'Lecture Hall Display', devicePassword, locResult.rows[1].id]
            );
            await db.query(
                `INSERT INTO devices (device_code, device_name, password_hash, location_id) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (device_code) DO UPDATE SET password_hash = $3`,
                ['DEV-003', 'Library Kiosk', devicePassword, locResult.rows[2].id]
            );
        }

        console.log('   ✅ Created devices with passwords');

        // Initialize System Settings
        console.log('⚙️ Initializing system settings...');

        const settings = [
            { key: 'enable_otp', value: 'true' },
            { key: 'qr_expiry', value: '60' },
            { key: 'max_distance', value: '50' },
            { key: 'system_name', value: 'GeoQR Attendance' },
            { key: 'late_threshold', value: '10' },
            { key: 'session_timeout', value: '120' },
            { key: 'enable_gps_validation', value: 'true' },
            { key: 'allow_multiple_scans', value: 'false' },
            { key: 'timezone', value: 'Asia/Kolkata' }
        ];

        for (const setting of settings) {
            await db.query(
                `INSERT INTO system_settings (key, value) 
                 VALUES ($1, $2) 
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [setting.key, setting.value]
            );
        }

        console.log('   ✅ System settings initialized');

        console.log('\n✨ Seed completed successfully!\n');
        console.log('📋 Test Credentials:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(' Role     │ Email/Code            │ Password   ');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(' Admin    │ admin@geoqr.local     │ password123');
        console.log(' Faculty  │ sarah@geoqr.local     │ password123');
        console.log(' Student  │ john@geoqr.local      │ password123');
        console.log(' Device   │ DEV-001               │ device123  ');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        process.exit(0);
    } catch (error) {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    }
}

seed();
