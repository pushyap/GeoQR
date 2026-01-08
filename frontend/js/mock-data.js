/**
 * GeoQR Attendance System - Mock Data
 * Complete mock data for frontend-only demonstrations
 */

// Mock Students
const MOCK_STUDENTS = [
    { id: 1, name: 'John Smith', email: 'john@college.edu', studentId: 'STU001', role: 'student', isActive: true, attendanceRate: 92 },
    { id: 2, name: 'Emily Davis', email: 'emily@college.edu', studentId: 'STU002', role: 'student', isActive: true, attendanceRate: 88 },
    { id: 3, name: 'Michael Brown', email: 'michael@college.edu', studentId: 'STU003', role: 'student', isActive: true, attendanceRate: 75 },
    { id: 4, name: 'Sarah Wilson', email: 'sarah@college.edu', studentId: 'STU004', role: 'student', isActive: true, attendanceRate: 95 },
    { id: 5, name: 'David Lee', email: 'david@college.edu', studentId: 'STU005', role: 'student', isActive: true, attendanceRate: 68 },
    { id: 6, name: 'Jessica Taylor', email: 'jessica@college.edu', studentId: 'STU006', role: 'student', isActive: true, attendanceRate: 85 },
    { id: 7, name: 'Robert Martinez', email: 'robert@college.edu', studentId: 'STU007', role: 'student', isActive: false, attendanceRate: 42 },
    { id: 8, name: 'Amanda Johnson', email: 'amanda@college.edu', studentId: 'STU008', role: 'student', isActive: true, attendanceRate: 91 },
];

// Mock Faculty
const MOCK_FACULTY = [
    { id: 101, name: 'Dr. James Anderson', email: 'j.anderson@college.edu', role: 'faculty', department: 'Computer Science' },
    { id: 102, name: 'Prof. Lisa Chen', email: 'l.chen@college.edu', role: 'faculty', department: 'Information Technology' },
    { id: 103, name: 'Dr. Mark Thompson', email: 'm.thompson@college.edu', role: 'admin', department: 'Administration' },
];

// Mock Devices
const MOCK_DEVICES = [
    { id: 1, deviceCode: 'DEV-001', deviceName: 'CS Lab Display', locationId: 1, locationName: 'Room 101 - CS Lab', status: 'online', lastActive: '2 min ago' },
    { id: 2, deviceCode: 'DEV-002', deviceName: 'IT Lab Display', locationId: 2, locationName: 'Room 203 - IT Lab', status: 'online', lastActive: '5 min ago' },
    { id: 3, deviceCode: 'DEV-003', deviceName: 'Main Gate Scanner', locationId: 3, locationName: 'Main Gate', status: 'offline', lastActive: 'Yesterday' },
    { id: 4, deviceCode: 'DEV-004', deviceName: 'Library Display', locationId: 4, locationName: 'Central Library', status: 'online', lastActive: '1 hour ago' },
    { id: 5, deviceCode: 'DEV-005', deviceName: 'Seminar Hall Device', locationId: 5, locationName: 'Room 301 - Seminar Hall', status: 'online', lastActive: '30 min ago' },
];

// Mock Locations
const MOCK_LOCATIONS = [
    { id: 1, name: 'Room 101 - CS Lab', latitude: 17.3850, longitude: 78.4867, radius: 50, isActive: true },
    { id: 2, name: 'Room 203 - IT Lab', latitude: 17.3852, longitude: 78.4869, radius: 50, isActive: true },
    { id: 3, name: 'Main Gate', latitude: 17.3840, longitude: 78.4860, radius: 100, isActive: true },
    { id: 4, name: 'Central Library', latitude: 17.3855, longitude: 78.4872, radius: 75, isActive: true },
    { id: 5, name: 'Room 301 - Seminar Hall', latitude: 17.3858, longitude: 78.4875, radius: 60, isActive: true },
    { id: 6, name: 'Network Lab', latitude: 17.3848, longitude: 78.4865, radius: 50, isActive: false },
];

// Mock Sessions
const MOCK_SESSIONS = [
    { id: 1, subject: 'Data Structures', facultyId: 101, locationId: 1, date: '2024-01-08', startTime: '09:00', endTime: '10:30' },
    { id: 2, subject: 'Database Systems', facultyId: 102, locationId: 2, date: '2024-01-08', startTime: '11:00', endTime: '12:30' },
    { id: 3, subject: 'Computer Networks', facultyId: 101, locationId: 1, date: '2024-01-07', startTime: '14:00', endTime: '15:30' },
    { id: 4, subject: 'Web Development', facultyId: 102, locationId: 2, date: '2024-01-07', startTime: '10:00', endTime: '11:30' },
    { id: 5, subject: 'Operating Systems', facultyId: 101, locationId: 1, date: '2024-01-06', startTime: '09:00', endTime: '10:30' },
    { id: 6, subject: 'Software Engineering', facultyId: 102, locationId: 5, date: '2024-01-06', startTime: '14:00', endTime: '16:00' },
];

// Generate attendance records for students
function generateAttendanceRecords() {
    const records = [];
    const statuses = ['present', 'present', 'present', 'present', 'absent']; // 80% present rate

    MOCK_STUDENTS.forEach(student => {
        MOCK_SESSIONS.forEach(session => {
            const location = MOCK_LOCATIONS.find(l => l.id === session.locationId);
            records.push({
                id: records.length + 1,
                studentId: student.id,
                studentName: student.name,
                sessionId: session.id,
                subject: session.subject,
                sessionName: session.subject,
                locationId: session.locationId,
                location: location?.name,
                locationName: location?.name,
                date: session.date,
                time: session.startTime,
                status: statuses[Math.floor(Math.random() * statuses.length)],
                createdAt: `${session.date}T${session.startTime}:00`
            });
        });
    });

    return records;
}

const MOCK_ATTENDANCE = generateAttendanceRecords();

// Mock API Functions (return arrays directly for easier use)
const MockAPI = {
    // Admin stats
    getAdminStats() {
        return {
            totalStudents: MOCK_STUDENTS.length,
            activeDevices: MOCK_DEVICES.filter(d => d.status === 'online').length,
            todayAttendance: 78,
            activeLocations: MOCK_LOCATIONS.filter(l => l.isActive).length
        };
    },

    // Get students (returns array)
    getStudents() {
        return MOCK_STUDENTS;
    },

    // Get devices (returns array)
    getDevices() {
        return MOCK_DEVICES;
    },

    // Get locations (returns array)
    getLocations() {
        return MOCK_LOCATIONS;
    },

    // Get sessions
    getSessions() {
        return MOCK_SESSIONS.map(s => ({
            ...s,
            facultyName: MOCK_FACULTY.find(f => f.id === s.facultyId)?.name || 'Unknown',
            locationName: MOCK_LOCATIONS.find(l => l.id === s.locationId)?.name || 'Unknown'
        }));
    },

    // Get all attendance records
    getAttendance() {
        return MOCK_ATTENDANCE.slice(0, 50); // First 50 records
    },

    // Get attendance for current student
    getStudentAttendance() {
        // Return records for first student as demo
        return MOCK_ATTENDANCE.filter(a => a.studentId === 1);
    },

    // Scan attendance (mock)
    scanAttendance(qrData, location) {
        return {
            success: true,
            message: 'Attendance marked successfully!',
            session: {
                subject: 'Database Systems',
                location: 'Room 203 - IT Lab',
                time: new Date().toLocaleTimeString()
            }
        };
    },

    // Add location (mock)
    addLocation(data) {
        const newLocation = {
            id: MOCK_LOCATIONS.length + 1,
            ...data,
            isActive: true
        };
        MOCK_LOCATIONS.push(newLocation);
        return { success: true, location: newLocation };
    },

    // Add device (mock)
    addDevice(data) {
        const newDevice = {
            id: MOCK_DEVICES.length + 1,
            ...data,
            status: 'offline',
            lastActive: 'Never'
        };
        MOCK_DEVICES.push(newDevice);
        return { success: true, device: newDevice };
    },

    // Update device status
    updateDeviceStatus(deviceId, status) {
        const device = MOCK_DEVICES.find(d => d.id === deviceId);
        if (device) {
            device.status = status;
            return { success: true };
        }
        return { success: false, error: 'Device not found' };
    },

    // Generate QR token
    generateQRToken(deviceCode) {
        const device = MOCK_DEVICES.find(d => d.deviceCode === deviceCode);
        const location = MOCK_LOCATIONS.find(l => l.id === device?.locationId);

        return {
            token: `GQR-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
            deviceId: device?.id,
            locationId: location?.id,
            latitude: location?.latitude || 17.385,
            longitude: location?.longitude || 78.4867,
            radius: location?.radius || 50,
            expiresAt: Date.now() + 15000
        };
    },

    // Mock login
    login(email, password) {
        const student = MOCK_STUDENTS.find(s => s.email === email);
        if (student) {
            return { success: true, requiresOtp: true, tempToken: `temp_${Date.now()}` };
        }

        const faculty = MOCK_FACULTY.find(f => f.email === email);
        if (faculty) {
            return {
                success: true,
                token: `jwt_${Date.now()}`,
                user: { id: faculty.id, name: faculty.name, email: faculty.email, role: faculty.role }
            };
        }

        return { success: false, error: 'Invalid credentials' };
    },

    // Verify OTP (mock - always succeeds)
    verifyOtp(tempToken, otp) {
        return {
            success: true,
            token: `jwt_${Date.now()}`,
            user: {
                id: 1,
                name: 'John Smith',
                email: 'john@college.edu',
                role: 'student',
                studentId: 'STU001'
            }
        };
    }
};

// Expose to global scope
window.MockAPI = MockAPI;
window.MOCK_STUDENTS = MOCK_STUDENTS;
window.MOCK_FACULTY = MOCK_FACULTY;
window.MOCK_DEVICES = MOCK_DEVICES;
window.MOCK_LOCATIONS = MOCK_LOCATIONS;
window.MOCK_SESSIONS = MOCK_SESSIONS;
window.MOCK_ATTENDANCE = MOCK_ATTENDANCE;
