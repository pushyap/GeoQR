// Use dynamic config - config.js must be loaded before this file
// API_BASE_URL is defined globally in config.js
// const API_BASE_URL = window.GeoQR?.config?.getApiUrl() || 'http://localhost:3000/api';

const StudentAPI = {
    async getDashboard() {
        try {
            const response = await axios.get(`${API_BASE_URL}/student/dashboard`, {
                headers: { 'Authorization': `Bearer ${Session.getToken()}` }
            });
            return response.data.success ? response.data.dashboard : null;
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            return null;
        }
    },

    async getStatistics() {
        try {
            const response = await axios.get(`${API_BASE_URL}/student/statistics`, {
                headers: { 'Authorization': `Bearer ${Session.getToken()}` }
            });
            return response.data.success ? response.data.statistics : null;
        } catch (error) {
            console.error('Failed to load statistics:', error);
            return null;
        }
    },

    async getAttendance(limit = 50, offset = 0) {
        try {
            const response = await axios.get(`${API_BASE_URL}/student/attendance?limit=${limit}&offset=${offset}`, {
                headers: { 'Authorization': `Bearer ${Session.getToken()}` }
            });
            return response.data.success ? response.data : null;
        } catch (error) {
            console.error('Failed to load attendance:', error);
            return null;
        }
    },

    async getProfile() {
        try {
            const response = await axios.get(`${API_BASE_URL}/student/profile`, {
                headers: { 'Authorization': `Bearer ${Session.getToken()}` }
            });
            return response.data.success ? response.data.profile : null;
        } catch (error) {
            console.error('Failed to load profile:', error);
            return null;
        }
    },

    async updateProfile(name) {
        try {
            const response = await axios.put(`${API_BASE_URL}/student/profile`,
                { name },
                { headers: { 'Authorization': `Bearer ${Session.getToken()}` } }
            );
            return response.data;
        } catch (error) {
            console.error('Failed to update profile:', error);
            return { success: false, error: 'Update failed' };
        }
    },

    async changePassword(currentPassword, newPassword) {
        try {
            const response = await axios.put(`${API_BASE_URL}/auth/change-password`,
                { currentPassword, newPassword },
                { headers: { 'Authorization': `Bearer ${Session.getToken()}` } }
            );
            return response.data;
        } catch (error) {
            console.error('Failed to update password:', error);
            return { success: false, error: error.response?.data?.error || 'Update failed' };
        }
    },

    /**
     * Scan QR Code for Attendance
     * @param {string} token - The QR token string
     * @param {Object} location - { latitude, longitude, accuracy }
     */
    async scanAttendance(token, location) {
        try {
            const response = await axios.post(`${API_BASE_URL}/attendance/scan`, {
                qr: token,
                lat: location.latitude,
                lng: location.longitude,
                accuracy: location.accuracy,
                device_id: localStorage.getItem('device_id') || 'unknown-web-client'
            }, {
                headers: { 'Authorization': `Bearer ${Session.getToken()}` }
            });
            return response.data;
        } catch (error) {
            console.error('Scan failed:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || 'Scan failed';
            return { success: false, message: msg };
        }
    }
};

window.StudentAPI = StudentAPI;
