const PDFDocument = require('pdfkit-table');

/**
 * Generate Attendance Report PDF
 * @param {Object} res - Express response object
 * @param {Array} records - Attendance records
 * @param {Object} filters - Applied filters (date, etc.)
 */
const generateAttendancePDF = (res, records, filters) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    // Set headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${Date.now()}.pdf`);

    doc.pipe(res);

    // Branding
    doc.rect(0, 0, doc.page.width, 50).fill('#4F46E5'); // Indigo header
    doc.fillColor('white').fontSize(20).text('GeoQR Attendance System', 30, 15);

    // Title & Metadata
    doc.moveDown(2);
    doc.fillColor('black').fontSize(16).text('Attendance Report', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor('gray');
    if (filters.date) doc.text(`Date: ${filters.date}`, { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Summary
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const late = records.filter(r => r.status === 'late').length;
    const absent = records.filter(r => r.status === 'absent').length;

    doc.fontSize(12).fillColor('black').text('Summary:', 30);
    doc.fontSize(10).text(`Total Records: ${total} | Present: ${present} | Late: ${late} | Absent: ${absent}`, 30);
    doc.moveDown(1);

    // Table
    const table = {
        title: "Attendance Records",
        headers: ["Time", "Student Name", "Student ID", "Location", "Subject", "Status"],
        rows: records.map(r => [
            new Date(r.timestamp).toLocaleTimeString(),
            r.student_name || 'Unknown',
            r.student_code || '--',
            r.location_name || '--',
            r.subject || '-',
            r.status.toUpperCase()
        ])
    };

    doc.table(table, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(10),
        prepareRow: (row, i) => doc.font('Helvetica').fontSize(10)
    });

    doc.end();
};

module.exports = { generateAttendancePDF };
