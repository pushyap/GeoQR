/**
 * Faculty Reports Routes
 * Handles dynamic report generation with date/session filtering
 */
const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty } = require('../middleware/roleCheck');
const { generateAttendancePDF } = require('../utils/pdfGenerator');

const router = express.Router();

// =========================================
// 1️⃣ GET /api/faculty/report/dates
// Unique session dates for the faculty
// =========================================
router.get('/dates', authenticate, isFaculty, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT TO_CHAR(start_time, 'YYYY-MM-DD') as session_date
            FROM sessions
            WHERE faculty_id = $1
            ORDER BY session_date DESC
        `, [req.user.id]);

        const dates = result.rows.map(r => r.session_date);
        res.json({ success: true, dates });
    } catch (error) {
        console.error('Fetch report dates error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dates' });
    }
});

// =========================================
// 2️⃣ GET /api/faculty/report/sessions?date=YYYY-MM-DD
// Sessions for a specific date
// =========================================
router.get('/sessions', authenticate, isFaculty, async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    try {
        const result = await db.query(`
            SELECT s.id as session_id, s.subject, 
                   s.start_time, l.name as location
            FROM sessions s
            JOIN locations l ON s.location_id = l.id
            WHERE s.faculty_id = $1 AND DATE(s.start_time) = $2
            ORDER BY s.start_time ASC
        `, [req.user.id, date]);

        const sessions = result.rows.map(s => ({
            session_id: s.session_id,
            subject: s.subject,
            start_time: new Date(s.start_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            location: s.location
        }));

        res.json({ success: true, sessions });
    } catch (error) {
        console.error('Fetch report sessions error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sessions' });
    }
});

// =========================================
// 3️⃣ POST /api/faculty/report/generate
// Generate structured report data
// =========================================
router.post('/generate', authenticate, isFaculty, async (req, res) => {
    const { date, session_id } = req.body;

    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    try {
        let query;
        let params;

        if (session_id && session_id !== 'all') {
            // Case A: Specific Session
            // First validate ownership
            const sessionCheck = await db.query(
                'SELECT id FROM sessions WHERE id = $1 AND faculty_id = $2',
                [session_id, req.user.id]
            );
            if (sessionCheck.rows.length === 0) {
                return res.status(403).json({ success: false, message: 'Session not found or not owned by you' });
            }

            query = `
                SELECT al.marked_at, al.status, u.name as student_name, u.student_id as student_code, u.email,
                       s.subject, s.expected_students, l.name as location_name
                FROM attendance_logs al
                JOIN users u ON al.student_id = u.id
                JOIN sessions s ON al.session_id = s.id
                JOIN locations l ON al.location_id = l.id
                WHERE al.session_id = $1
                ORDER BY al.marked_at ASC
            `;
            params = [session_id];
        } else {
            // Case B: All Sessions for building merge/summary
            query = `
                SELECT al.marked_at, al.status, u.name as student_name, u.student_id as student_code, u.email,
                       s.subject, s.expected_students, l.name as location_name
                FROM attendance_logs al
                JOIN users u ON al.student_id = u.id
                JOIN sessions s ON al.session_id = s.id
                JOIN locations l ON al.location_id = l.id
                WHERE s.faculty_id = $1 AND DATE(s.start_time) = $2
                ORDER BY s.start_time ASC, al.marked_at ASC
            `;
            params = [req.user.id, date];
        }

        const result = await db.query(query, params);
        const records = result.rows;

        // Aggregate statistics
        const summary = {
            total_records: records.length,
            present: records.filter(r => r.status === 'present').length,
            late: records.filter(r => r.status === 'late').length,
            absent: 0 // In 'All sessions' it's harder to define absent without expected_students sum
        };

        // If specific session, we can calculate absent more accurately
        if (session_id && session_id !== 'all' && records.length > 0) {
            const expected = records[0].expected_students || 60;
            summary.expected_students = expected;
            summary.absent = Math.max(0, expected - summary.total_records);
            summary.attendance_rate = expected > 0 ? Math.round((summary.total_records / expected) * 100) : 0;
        }

        res.json({
            success: true,
            summary,
            records: records.map(r => ({
                name: r.student_name,
                roll: r.student_code || '--',
                email: r.email,
                status: r.status,
                time: r.marked_at,
                subject: r.subject,
                location: r.location_name
            }))
        });

    } catch (error) {
        console.error('Generate report data error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate report data' });
    }
});

// =========================================
// 4️⃣ GET /api/faculty/report/pdf
// Professional PDF generation
// =========================================
router.get('/pdf', authenticate, isFaculty, async (req, res) => {
    const { date, session_id } = req.query;

    if (!date) return res.status(400).send('Date is required');

    try {
        let query;
        let params;
        let reportTitle = `Attendance Report - ${date}`;
        let subtitle = '';

        if (session_id && session_id !== 'all') {
            // Specific session
            const sessionResult = await db.query(
                `SELECT s.subject, s.start_time, l.name as location 
                 FROM sessions s 
                 JOIN locations l ON s.location_id = l.id 
                 WHERE s.id = $1 AND s.faculty_id = $2`,
                [session_id, req.user.id]
            );

            if (sessionResult.rows.length === 0) return res.status(403).send('Unauthorized');

            const s = sessionResult.rows[0];
            reportTitle = `Attendance Report: ${s.subject}`;
            subtitle = `${new Date(s.start_time).toLocaleDateString()} | ${new Date(s.start_time).toLocaleTimeString()} | ${s.location}`;

            query = `
                SELECT al.marked_at as timestamp, al.status, u.name as student_name, u.student_id as student_code, u.email,
                       l.name as location_name, s.subject
                FROM attendance_logs al
                JOIN users u ON al.student_id = u.id
                JOIN sessions s ON al.session_id = s.id
                JOIN locations l ON al.location_id = l.id
                WHERE al.session_id = $1
                ORDER BY al.marked_at ASC
            `;
            params = [session_id];
        } else {
            // All sessions
            subtitle = `All Sessions for ${date}`;
            query = `
                SELECT al.marked_at as timestamp, al.status, u.name as student_name, u.student_id as student_code, u.email,
                       l.name as location_name, s.subject
                FROM attendance_logs al
                JOIN users u ON al.student_id = u.id
                JOIN sessions s ON al.session_id = s.id
                JOIN locations l ON al.location_id = l.id
                WHERE s.faculty_id = $1 AND DATE(s.start_time) = $2
                ORDER BY s.start_time ASC, al.marked_at ASC
            `;
            params = [req.user.id, date];
        }

        const result = await db.query(query, params);

        // Use the existing utility or enhance it
        await generateAttendancePDF(res, result.rows, {
            date,
            title: reportTitle,
            subtitle: subtitle,
            facultyName: req.user.name
        });

    } catch (error) {
        console.error('Faculty PDF report error:', error);
        res.status(500).send('Failed to generate PDF');
    }
});

module.exports = router;
