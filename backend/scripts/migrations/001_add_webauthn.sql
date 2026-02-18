-- Migration: Add WebAuthn support (passkeys)
-- Run this on your PostgreSQL database to add required columns and tables
-- Safe: uses IF NOT EXISTS where supported and ALTER TABLE ... ADD COLUMN IF NOT EXISTS

-- 1) Add passkey_enabled to users
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS passkey_enabled BOOLEAN DEFAULT false;

-- 2) Create webauthn_credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    credential_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER DEFAULT 0,
    transports TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, credential_id)
);

-- 3) Create verification_tickets table (used for short-lived attendance verification)
CREATE TABLE IF NOT EXISTS verification_tickets (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id),
    session_id INTEGER REFERENCES sessions(id),
    ticket_token VARCHAR(255),
    verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN DEFAULT false
);

-- 4) Optional: Indexes to speed lookups
CREATE INDEX IF NOT EXISTS idx_webauthn_user_id ON webauthn_credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_verification_ticket_student_session ON verification_tickets (student_id, session_id);

-- Note:
-- The application enforces "one passkey per user" at the API layer. If you prefer a DB-level
-- constraint to strictly enforce one passkey per user, you can add a UNIQUE index on (user_id).
-- Be cautious: creating a unique index will fail if duplicate credentials already exist.
-- Example (run only when safe):
-- CREATE UNIQUE INDEX webauthn_unique_user ON webauthn_credentials (user_id);
