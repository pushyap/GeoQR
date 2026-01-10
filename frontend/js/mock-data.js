/**
 * GeoQR Attendance System - Enhanced Mock Data
 * Complete mock data with CRUD operations for frontend demonstrations
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
    { id: 9, name: 'Chris Anderson', email: 'chris@college.edu', studentId: 'STU009', role: 'student', isActive: true, attendanceRate: 78 },
    { id: 10, name: 'Lisa Thompson', email: 'lisa@college.edu', studentId: 'STU010', role: 'student', isActive: true, attendanceRate: 82 },
    { id: 11, name: 'Kevin White', email: 'kevin@college.edu', studentId: 'STU011', role: 'student', isActive: true, attendanceRate: 89 },
    { id: 12, name: 'Rachel Green', email: 'rachel@college.edu', studentId: 'STU012', role: 'student', isActive: false, attendanceRate: 55 },
];

// Mock Faculty
const MOCK_FACULTY = [
    { id: 101, name: 'Dr. James Anderson', email: 'j.anderson@college.edu', role: 'faculty', department: 'Computer Science' },
    { id: 102, name: 'Prof. Lisa Chen', email: 'l.chen@college.edu', role: 'faculty', department: 'Information Technology' },
    { id: 103, name: 'Dr. Mark Thompson', email: 'm.thompson@college.edu', role: 'admin', department: 'Administration' },
];

// Mock Devices
const MOCK_DEVICES = [
    { id: 1, deviceCode: 'DEV-001', deviceName: 'CS Lab Display', locationId: 1, locationName: 'Room 101 - CS Lab', status: 'online', lastActive: '2 min ago', isActive: true },
    { id: 2, deviceCode: 'DEV-002', deviceName: 'IT Lab Display', locationId: 2, locationName: 'Room 203 - IT Lab', status: 'online', lastActive: '5 min ago', isActive: true },
    { id: 3, deviceCode: 'DEV-003', deviceName: 'Main Gate Scanner', locationId: 3, locationName: 'Main Gate', status: 'offline', lastActive: 'Yesterday', isActive: true },
    { id: 4, deviceCode: 'DEV-004', deviceName: 'Library Display', locationId: 4, locationName: 'Central Library', status: 'online', lastActive: '1 hour ago', isActive: true },
    { id: 5, deviceCode: 'DEV-005', deviceName: 'Seminar Hall Device', locationId: 5, locationName: 'Room 301 - Seminar Hall', status: 'online', lastActive: '30 min ago', isActive: true },
    { id: 6, deviceCode: 'DEV-006', deviceName: 'Network Lab Display', locationId: 6, locationName: 'Network Lab', status: 'offline', lastActive: '3 days ago', isActive: false },
];

// Mock Locations
const MOCK_LOCATIONS = [
    { id: 1, name: 'Room 101 - CS Lab', latitude: 17.3850, longitude: 78.4867, radius: 50, isActive: true, deviceCount: 1 },
    { id: 2, name: 'Room 203 - IT Lab', latitude: 17.3852, longitude: 78.4869, radius: 50, isActive: true, deviceCount: 1 },
    { id: 3, name: 'Main Gate', latitude: 17.3840, longitude: 78.4860, radius: 100, isActive: true, deviceCount: 1 },
    { id: 4, name: 'Central Library', latitude: 17.3855, longitude: 78.4872, radius: 75, isActive: true, deviceCount: 1 },
    { id: 5, name: 'Room 301 - Seminar Hall', latitude: 17.3858, longitude: 78.4875, radius: 60, isActive: true, deviceCount: 1 },
    { id: 6, name: 'Network Lab', latitude: 17.3848, longitude: 78.4865, radius: 50, isActive: false, deviceCount: 1 },
];

// Mock Sessions
const MOCK_SESSIONS = [
    { id: 1, subject: 'Data Structures', facultyId: 101, locationId: 1, date: '2026-01-10', startTime: '09:00', endTime: '10:30' },
    { id: 2, subject: 'Database Systems', facultyId: 102, locationId: 2, date: '2026-01-10', startTime: '11:00', endTime: '12:30' },
    { id: 3, subject: 'Computer Networks', facultyId: 101, locationId: 1, date: '2026-01-09', startTime: '14:00', endTime: '15:30' },
    { id: 4, subject: 'Web Development', facultyId: 102, locationId: 2, date: '2026-01-09', startTime: '10:00', endTime: '11:30' },
    { id: 5, subject: 'Operating Systems', facultyId: 101, locationId: 1, date: '2026-01-08', startTime: '09:00', endTime: '10:30' },
    { id: 6, subject: 'Software Engineering', facultyId: 102, locationId: 5, date: '2026-01-08', startTime: '14:00', endTime: '16:00' },
];

// Activity Log Types
const ACTIVITY_TYPES = {
    DEVICE_ONLINE: { type: 'device', icon: '📱', label: 'Device Online' },
    DEVICE_OFFLINE: { type: 'device', icon: '📴', label: 'Device Offline' },
    SESSION_STARTED: { type: 'session', icon: '🎓', label: 'Session Started' },
    SESSION_ENDED: { type: 'session', icon: '✅', label: 'Session Ended' },
    ATTENDANCE_MARKED: { type: 'attendance', icon: '✓', label: 'Attendance Marked' },
    STUDENT_REGISTERED: { type: 'attendance', icon: '👤', label: 'Student Registered' },
    LOCATION_ADDED: { type: 'session', icon: '📍', label: 'Location Added' },
    SYSTEM_ERROR: { type: 'error', icon: '⚠️', label: 'System Error' }
};

// Mock Activity Log (will grow dynamically)
let MOCK_ACTIVITY_LOG = [
    { id: 1, type: 'DEVICE_ONLINE', details: 'DEV-001 started QR generation', timestamp: Date.now() - 120000 },
    { id: 2, type: 'ATTENDANCE_MARKED', details: '23 students marked present in CS Lab', timestamp: Date.now() - 900000 },
    { id: 3, type: 'SESSION_STARTED', details: 'Database Systems - Room 203', timestamp: Date.now() - 3600000 },
    { id: 4, type: 'STUDENT_REGISTERED', details: 'New student John Smith registered', timestamp: Date.now() - 7200000 },
    { id: 5, type: 'DEVICE_OFFLINE', details: 'DEV-003 went offline', timestamp: Date.now() - 86400000 },
];

// Generate attendance records for students
function generateAttendanceRecords() {
    const records = [];
    const statuses = ['present', 'present', 'present', 'present', 'absent'];

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

// ========================================
// Enhanced Mock API
// ========================================
const MockAPI = {
    // Admin stats
    getAdminStats() {
        const presentToday = MOCK_ATTENDANCE.filter(a =>
            a.date === '2026-01-10' && a.status === 'present'
        ).length;
        const totalToday = MOCK_ATTENDANCE.filter(a => a.date === '2026-01-10').length;

        return {
            totalStudents: MOCK_STUDENTS.length,
            activeDevices: MOCK_DEVICES.filter(d => d.status === 'online').length,
            todayAttendance: totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 78,
            activeLocations: MOCK_LOCATIONS.filter(l => l.isActive).length,
            totalDevices: MOCK_DEVICES.length,
            totalLocations: MOCK_LOCATIONS.length
        };
    },

    // ========== STUDENTS ==========
    getStudents(filters = {}) {
        let students = [...MOCK_STUDENTS];

        if (filters.search) {
            const query = filters.search.toLowerCase();
            students = students.filter(s =>
                s.name.toLowerCase().includes(query) ||
                s.email.toLowerCase().includes(query) ||
                s.studentId.toLowerCase().includes(query)
            );
        }

        if (filters.status === 'active') {
            students = students.filter(s => s.isActive);
        } else if (filters.status === 'inactive') {
            students = students.filter(s => !s.isActive);
        }

        return students;
    },

    getStudentById(id) {
        return MOCK_STUDENTS.find(s => s.id === id);
    },

    toggleStudentStatus(id) {
        const student = MOCK_STUDENTS.find(s => s.id === id);
        if (student) {
            student.isActive = !student.isActive;
            this.addActivityLog(
                student.isActive ? 'STUDENT_REGISTERED' : 'SYSTEM_ERROR',
                `Student ${student.name} ${student.isActive ? 'activated' : 'deactivated'}`
            );
            return { success: true, student };
        }
        return { success: false, error: 'Student not found' };
    },

    getStudentAttendance(studentId) {
        return MOCK_ATTENDANCE.filter(a => a.studentId === studentId);
    },

    // ========== DEVICES ==========
    getDevices(filters = {}) {
        let devices = [...MOCK_DEVICES];

        if (filters.status === 'online') {
            devices = devices.filter(d => d.status === 'online');
        } else if (filters.status === 'offline') {
            devices = devices.filter(d => d.status === 'offline');
        }

        if (filters.locationId) {
            devices = devices.filter(d => d.locationId === parseInt(filters.locationId));
        }

        return devices;
    },

    getDeviceById(id) {
        return MOCK_DEVICES.find(d => d.id === id);
    },

    addDevice(data) {
        const location = MOCK_LOCATIONS.find(l => l.id === parseInt(data.locationId));
        const newDevice = {
            id: Math.max(...MOCK_DEVICES.map(d => d.id)) + 1,
            deviceCode: `DEV-${String(MOCK_DEVICES.length + 1).padStart(3, '0')}`,
            deviceName: data.deviceName,
            locationId: parseInt(data.locationId),
            locationName: location?.name || 'Unassigned',
            status: 'offline',
            lastActive: 'Never',
            isActive: true
        };
        MOCK_DEVICES.push(newDevice);
        this.addActivityLog('DEVICE_ONLINE', `New device ${newDevice.deviceCode} added`);
        return { success: true, device: newDevice };
    },

    updateDevice(id, data) {
        const device = MOCK_DEVICES.find(d => d.id === id);
        if (device) {
            const location = MOCK_LOCATIONS.find(l => l.id === parseInt(data.locationId));
            Object.assign(device, {
                deviceName: data.deviceName || device.deviceName,
                locationId: parseInt(data.locationId) || device.locationId,
                locationName: location?.name || device.locationName
            });
            return { success: true, device };
        }
        return { success: false, error: 'Device not found' };
    },

    toggleDeviceStatus(id) {
        const device = MOCK_DEVICES.find(d => d.id === id);
        if (device) {
            device.status = device.status === 'online' ? 'offline' : 'online';
            device.lastActive = device.status === 'online' ? 'Just now' : device.lastActive;
            this.addActivityLog(
                device.status === 'online' ? 'DEVICE_ONLINE' : 'DEVICE_OFFLINE',
                `${device.deviceCode} is now ${device.status}`
            );
            return { success: true, device };
        }
        return { success: false, error: 'Device not found' };
    },

    deleteDevice(id) {
        const index = MOCK_DEVICES.findIndex(d => d.id === id);
        if (index > -1) {
            const device = MOCK_DEVICES[index];
            MOCK_DEVICES.splice(index, 1);
            this.addActivityLog('SYSTEM_ERROR', `Device ${device.deviceCode} removed`);
            return { success: true };
        }
        return { success: false, error: 'Device not found' };
    },

    // ========== LOCATIONS ==========
    getLocations(filters = {}) {
        let locations = [...MOCK_LOCATIONS];

        if (filters.status === 'active') {
            locations = locations.filter(l => l.isActive);
        } else if (filters.status === 'inactive') {
            locations = locations.filter(l => !l.isActive);
        }

        // Add device count
        locations = locations.map(l => ({
            ...l,
            deviceCount: MOCK_DEVICES.filter(d => d.locationId === l.id).length
        }));

        return locations;
    },

    getLocationById(id) {
        return MOCK_LOCATIONS.find(l => l.id === id);
    },

    addLocation(data) {
        const newLocation = {
            id: Math.max(...MOCK_LOCATIONS.map(l => l.id)) + 1,
            name: data.name,
            latitude: parseFloat(data.latitude) || 17.385,
            longitude: parseFloat(data.longitude) || 78.4867,
            radius: parseInt(data.radius) || 50,
            isActive: true,
            deviceCount: 0
        };
        MOCK_LOCATIONS.push(newLocation);
        this.addActivityLog('LOCATION_ADDED', `New location "${newLocation.name}" added`);
        return { success: true, location: newLocation };
    },

    updateLocation(id, data) {
        const location = MOCK_LOCATIONS.find(l => l.id === id);
        if (location) {
            Object.assign(location, {
                name: data.name || location.name,
                latitude: parseFloat(data.latitude) || location.latitude,
                longitude: parseFloat(data.longitude) || location.longitude,
                radius: parseInt(data.radius) || location.radius
            });
            return { success: true, location };
        }
        return { success: false, error: 'Location not found' };
    },

    toggleLocationStatus(id) {
        const location = MOCK_LOCATIONS.find(l => l.id === id);
        if (location) {
            location.isActive = !location.isActive;
            this.addActivityLog('LOCATION_ADDED', `Location "${location.name}" ${location.isActive ? 'enabled' : 'disabled'}`);
            return { success: true, location };
        }
        return { success: false, error: 'Location not found' };
    },

    deleteLocation(id) {
        const index = MOCK_LOCATIONS.findIndex(l => l.id === id);
        if (index > -1) {
            const location = MOCK_LOCATIONS[index];
            MOCK_LOCATIONS.splice(index, 1);
            // Unassign devices from this location
            MOCK_DEVICES.filter(d => d.locationId === id).forEach(d => {
                d.locationId = null;
                d.locationName = 'Unassigned';
            });
            this.addActivityLog('SYSTEM_ERROR', `Location "${location.name}" deleted`);
            return { success: true };
        }
        return { success: false, error: 'Location not found' };
    },

    // ========== ATTENDANCE ==========
    getAttendance(filters = {}) {
        let records = [...MOCK_ATTENDANCE];

        if (filters.date) {
            records = records.filter(a => a.date === filters.date);
        }

        if (filters.location) {
            records = records.filter(a => a.locationName === filters.location || a.locationId === parseInt(filters.location));
        }

        if (filters.studentId) {
            records = records.filter(a => a.studentId === parseInt(filters.studentId));
        }

        if (filters.status) {
            records = records.filter(a => a.status === filters.status);
        }

        // Sort by date and time descending
        records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return records;
    },

    // ========== SESSIONS ==========
    getSessions() {
        return MOCK_SESSIONS.map(s => ({
            ...s,
            facultyName: MOCK_FACULTY.find(f => f.id === s.facultyId)?.name || 'Unknown',
            locationName: MOCK_LOCATIONS.find(l => l.id === s.locationId)?.name || 'Unknown'
        }));
    },

    // ========== ACTIVITY LOG ==========
    getActivityLog(filter = 'all') {
        let logs = [...MOCK_ACTIVITY_LOG];

        if (filter !== 'all') {
            logs = logs.filter(log => ACTIVITY_TYPES[log.type]?.type === filter);
        }

        return logs.sort((a, b) => b.timestamp - a.timestamp).map(log => ({
            ...log,
            ...ACTIVITY_TYPES[log.type],
            timeAgo: this.getTimeAgo(log.timestamp)
        }));
    },

    addActivityLog(type, details) {
        const newLog = {
            id: MOCK_ACTIVITY_LOG.length + 1,
            type,
            details,
            timestamp: Date.now()
        };
        MOCK_ACTIVITY_LOG.unshift(newLog);
        return newLog;
    },

    // Generate random activity for live updates
    generateRandomActivity() {
        const activities = [
            { type: 'DEVICE_ONLINE', details: () => `${MOCK_DEVICES[Math.floor(Math.random() * MOCK_DEVICES.length)]?.deviceCode} reconnected` },
            { type: 'ATTENDANCE_MARKED', details: () => `${MOCK_STUDENTS[Math.floor(Math.random() * MOCK_STUDENTS.length)]?.name} marked present` },
            { type: 'SESSION_STARTED', details: () => `${MOCK_SESSIONS[Math.floor(Math.random() * MOCK_SESSIONS.length)]?.subject} class started` },
        ];

        const activity = activities[Math.floor(Math.random() * activities.length)];
        return this.addActivityLog(activity.type, activity.details());
    },

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} min ago`;
        return 'Just now';
    },

    // ========== QR & AUTH (unchanged) ==========
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
window.MOCK_ACTIVITY_LOG = MOCK_ACTIVITY_LOG;
window.ACTIVITY_TYPES = ACTIVITY_TYPES;

