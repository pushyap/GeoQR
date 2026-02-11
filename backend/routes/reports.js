/**
 * Reports Routes - Session-scoped Attendance Reports
 * PDF/CSV downloads and report summary generation
 */
const express = require('express');
const { db } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { isFaculty } = require('../middleware/roleCheck');
const PDFDocument = require('pdfkit-table');

const router = express.Router();

// =========================================
// Helper: Validate session ownership
// =========================================
async function validateSessionOwnership(sessionId, facultyId) {
    const result = await db.query(
        `SELECT s.id, s.subject, s.start_time, s.end_time, s.is_active, s.expected_students,
                l.name as location_name, u.name as faculty_name
         FROM sessions s
         JOIN locations l ON s.location_id = l.id
         JOIN users u ON s.faculty_id = u.id
         WHERE s.id = $1`,
        [sessionId]
    );

    if (result.rows.length === 0) {
        return { error: { status: 404, message: 'Session not found', code: 'SESSION_NOT_FOUND' } };
    }

    const session = result.rows[0];

    // Check ownership via faculty_id
    const ownerCheck = await db.query(
        'SELECT faculty_id FROM sessions WHERE id = $1',
        [sessionId]
    );
    if (ownerCheck.rows[0].faculty_id !== facultyId) {
        return { error: { status: 403, message: 'Session does not belong to you', code: 'SESSION_NOT_OWNED' } };
    }

    // Compute status
    const now = new Date();
    const startTime = new Date(session.start_time);
    const endTime = session.end_time ? new Date(session.end_time) : null;

    let status = 'completed';
    if (session.is_active) {
        status = startTime > now ? 'upcoming' : 'live';
    } else if (endTime && endTime > now && startTime > now) {
        status = 'upcoming';
    }

    return {
        session: {
            id: session.id,
            subject: session.subject,
            start_time: session.start_time,
            end_time: session.end_time,
            is_active: session.is_active,
            expected_students: session.expected_students || 60,
            location_name: session.location_name,
            faculty_name: session.faculty_name,
            status
        }
    };
}

// Helper: Fetch attendance records for a session
async function fetchAttendanceRecords(sessionId) {
    const result = await db.query(`
        SELECT 
            al.id, al.marked_at, al.status, al.distance_from_device,
            u.id as student_id, u.name as student_name, u.student_id as student_code, u.email
        FROM attendance_logs al
        JOIN users u ON al.student_id = u.id
        WHERE al.session_id = $1
        ORDER BY al.marked_at ASC
    `, [sessionId]);
    return result.rows;
}

// =========================================
// GET /api/reports/session/:sessionId
// Generate session report summary
// =========================================
router.get('/session/:sessionId', authenticate, isFaculty, async (req, res) => {
    const sessionId = req.params.sessionId;
    const facultyId = req.user.id;

    try {
        const validation = await validateSessionOwnership(sessionId, facultyId);
        if (validation.error) {
            return res.status(validation.error.status).json({
                success: false,
                message: validation.error.message,
                code: validation.error.code
            });
        }

        const { session } = validation;
        const records = await fetchAttendanceRecords(sessionId);

        const present = records.filter(r => r.status === 'present').length;
        const late = records.filter(r => r.status === 'late').length;
        const totalScanned = records.length;
        const expectedStudents = session.expected_students;
        const absent = Math.max(0, expectedStudents - totalScanned);
        const attendanceRate = expectedStudents > 0
            ? Math.round((totalScanned / expectedStudents) * 100)
            : 0;

        res.json({
            success: true,
            session: {
                id: session.id,
                subject: session.subject,
                start_time: session.start_time,
                end_time: session.end_time,
                location_name: session.location_name,
                faculty_name: session.faculty_name,
                expected_students: expectedStudents,
                status: session.status
            },
            summary: {
                total_students: expectedStudents,
                present,
                late,
                absent,
                attendance_rate: attendanceRate
            },
            records: records.map(r => ({
                student_id: r.student_id,
                name: r.student_name,
                roll: r.student_code || '--',
                email: r.email,
                status: r.status,
                scanned_at: r.marked_at,
                distance_m: parseFloat(r.distance_from_device) || null
            }))
        });

    } catch (error) {
        console.error('Session report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate report',
            code: 'DB_ERROR'
        });
    }
});

// =========================================
// GET /api/reports/session/:sessionId/pdf
// Download attendance report as PDF
// =========================================
router.get('/session/:sessionId/pdf', authenticate, isFaculty, async (req, res) => {
    const sessionId = req.params.sessionId;
    const facultyId = req.user.id;

    try {
        const validation = await validateSessionOwnership(sessionId, facultyId);
        if (validation.error) {
            return res.status(validation.error.status).json({
                success: false,
                message: validation.error.message,
                code: validation.error.code
            });
        }

        const { session } = validation;
        const records = await fetchAttendanceRecords(sessionId);

        const present = records.filter(r => r.status === 'present').length;
        const late = records.filter(r => r.status === 'late').length;
        const totalScanned = records.length;
        const absent = Math.max(0, session.expected_students - totalScanned);
        const attendanceRate = session.expected_students > 0
            ? Math.round((totalScanned / session.expected_students) * 100) : 0;

        // Create PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition',
            `attachment; filename=attendance_report_session_${sessionId}_${Date.now()}.pdf`);
        doc.pipe(res);

        // Header bar
        doc.rect(0, 0, doc.page.width, 55).fill('#4F46E5');
        doc.fillColor('white').fontSize(22).text('GeoQR Attendance Report', 30, 17);

        // Session details
        doc.moveDown(2.5);
        doc.fillColor('#333').fontSize(14).text(session.subject, { align: 'center' });
        doc.moveDown(0.3);

        doc.fontSize(10).fillColor('#666');
        const sessionDate = new Date(session.start_time).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata'
        });
        const startTime = new Date(session.start_time).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
        });
        const endTime = session.end_time ? new Date(session.end_time).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
        }) : 'N/A';

        doc.text(`Faculty: ${session.faculty_name}`, { align: 'center' });
        doc.text(`Date: ${sessionDate} | Time: ${startTime} – ${endTime}`, { align: 'center' });
        doc.text(`Location: ${session.location_name}`, { align: 'center' });
        doc.moveDown(1.5);

        // Summary
        doc.fontSize(12).fillColor('#333').text('Summary', 30);
        doc.fontSize(10).fillColor('#555');
        doc.text(`Expected: ${session.expected_students} | Present: ${present} | Late: ${late} | Absent: ${absent} | Rate: ${attendanceRate}%`, 30);
        doc.moveDown(1);

        // Table
        if (records.length > 0) {
            const table = {
                title: 'Attendance Records',
                headers: ['#', 'Student Name', 'Roll No', 'Email', 'Status', 'Time', 'Distance'],
                rows: records.map((r, i) => [
                    String(i + 1),
                    r.student_name || 'Unknown',
                    r.student_code || '--',
                    r.email || '--',
                    r.status.toUpperCase(),
                    new Date(r.marked_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
                    }),
                    r.distance_from_device ? `${r.distance_from_device}m` : '--'
                ])
            };

            doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
                prepareRow: () => doc.font('Helvetica').fontSize(9)
            });
        } else {
            doc.fontSize(11).fillColor('#999')
                .text('No attendance records found for this session.', { align: 'center' });
        }

        // Footer
        doc.moveDown(2);
        doc.fontSize(8).fillColor('#aaa')
            .text(`Generated on: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`, { align: 'center' });

        doc.end();

    } catch (error) {
        console.error('PDF generation error:', error);
        // Fallback: try to send error JSON if headers not sent yet
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'PDF generation failed. Try CSV download instead.',
                code: 'PDF_GENERATION_FAILED'
            });
        }
    }
});

// =========================================
// GET /api/reports/session/:sessionId/csv
// Download attendance report as CSV
// =========================================
router.get('/session/:sessionId/csv', authenticate, isFaculty, async (req, res) => {
    const sessionId = req.params.sessionId;
    const facultyId = req.user.id;

    try {
        const validation = await validateSessionOwnership(sessionId, facultyId);
        if (validation.error) {
            return res.status(validation.error.status).json({
                success: false,
                message: validation.error.message,
                code: validation.error.code
            });
        }

        const records = await fetchAttendanceRecords(sessionId);

        // Build CSV
        let csv = 'Student Name,Roll No,Email,Status,Scan Time,Distance\n';
        records.forEach(r => {
            const scanTime = new Date(r.marked_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            const distance = r.distance_from_device ? `${r.distance_from_device}m` : '';
            csv += `"${r.student_name || 'Unknown'}","${r.student_code || ''}","${r.email || ''}","${r.status}","${scanTime}","${distance}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition',
            `attachment; filename=attendance_report_session_${sessionId}_${Date.now()}.csv`);
        res.send(csv);

    } catch (error) {
        console.error('CSV generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate CSV',
            code: 'CSV_GENERATION_FAILED'
        });
    }
});

module.exports = router;
