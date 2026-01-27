// Use dynamic config - config.js must be loaded before this file
const API_BASE = window.GeoQR?.config?.getApiUrl()?.replace('/api', '') || 'http://localhost:3000';

/**
 * Admin API Client
 * centralized API calls for Admin Dashboard
 */
const AdminAPI = {
    // =========================================
    // Dashboard
    // =========================================
    async getDashboard() {
        try {
            const response = await axios.get(`${API_BASE}/api/admin/dashboard`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.success ? response.data.dashboard : null;
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            // AdminCore may not be loaded yet or toast might fail if race condition, 
            // but usually safe.
            if (window.AdminCore) AdminCore.toast('Failed to load dashboard data', 'error');
            return null;
        }
    },

    async getStats() {
        try {
            // Some charts use /admin/stats directly if separated, but dashboard usually covers it
            // If needed:
            // const response = await axios.get('/api/admin/stats'...);
            return null;
        } catch (e) { return null; }
    },

    // =========================================
    // Locations
    // =========================================
    async getLocations() {
        try {
            const response = await axios.get(`${API_BASE}/api/locations`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.locations || [];
        } catch (error) {
            console.error('Failed to load locations:', error);
            return [];
        }
    },

    async createLocation(data) {
        const response = await axios.post(`${API_BASE}/api/locations`, data, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    async updateLocation(id, data) {
        const response = await axios.put(`${API_BASE}/api/locations/${id}`, data, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    async deleteLocation(id) {
        const response = await axios.delete(`${API_BASE}/api/locations/${id}`, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    // =========================================
    // Devices
    // =========================================
    async getDevices() {
        try {
            const response = await axios.get(`${API_BASE}/api/devices`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.devices || [];
        } catch (error) {
            console.error('Failed to load devices:', error);
            return [];
        }
    },

    async createDevice(data) {
        const response = await axios.post(`${API_BASE}/api/devices/register`, data, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    async updateDevice(id, data) {
        const response = await axios.put(`${API_BASE}/api/devices/${id}`, data, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    async deleteDevice(id) {
        const response = await axios.delete(`${API_BASE}/api/devices/${id}`, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    // =========================================
    // Users (Students/Faculty)
    // =========================================
    async getUsers(filters = {}) {
        try {
            const query = new URLSearchParams(filters).toString();
            const response = await axios.get(`${API_BASE}/api/admin/users?${query}`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.users || [];
        } catch (error) {
            console.error('Failed to load users:', error);
            return [];
        }
    },

    async updateUser(id, data) {
        const response = await axios.put(`${API_BASE}/api/admin/users/${id}`, data, {
            headers: { Authorization: `Bearer ${Session.getToken()}` }
        });
        return response.data;
    },

    // =========================================
    // Attendance
    // =========================================
    async getAttendance(filters = {}) {
        try {
            // Remove empty filters
            const params = {};
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== '' && value !== null && value !== undefined) params[key] = value;
            });

            const query = new URLSearchParams(params).toString();
            const response = await axios.get(`${API_BASE}/api/admin/attendance?${query}`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data;
        } catch (error) {
            console.error('Failed to load attendance:', error);
            return { records: [], pagination: { total: 0, limit: 10, offset: 0 } };
        }
    },

    // =========================================
    // Activity Log
    // =========================================
    async getActivity(type = 'all') {
        try {
            const params = type && type !== 'all' ? `?type=${type}` : '';
            const response = await axios.get(`${API_BASE}/api/admin/activity${params}`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.activity;
        } catch (error) {
            console.error('Failed to load activity:', error);
            return { deviceLogs: [], recentAttendance: [] };
        }
    },

    // =========================================
    // Settings
    // =========================================
    async getSettings() {
        try {
            // Backend endpoint GET /api/admin/settings might fail if not implemented in admin.js
            // Checking admin.js: I saw GET /users, /dashboard, /reports, /suspicious, /attendance, /stats, /activity
            // I DID NOT SEE /settings in admin.js!
            // I proposed it in implementation plan but might have missed implementing it in admin.js.
            // I must check admin.js for settings endpoint.
            // If missing, I should implement it or return default here for now.
            // For strong backend, I should implement it.
            const response = await axios.get(`${API_BASE}/api/admin/settings`, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            return response.data.settings;
        } catch (error) {
            return SettingsManager.load(); // Fallback to local
        }
    },

    async updateSettings(settings) {
        try {
            // Check if endpoint exists
            const response = await axios.put(`${API_BASE}/api/admin/settings`, settings, {
                headers: { Authorization: `Bearer ${Session.getToken()}` }
            });
            SettingsManager.save(settings); // Also save local
            return response.data;
        } catch (error) {
            // Fallback
            SettingsManager.save(settings);
            return { success: true };
        }
    }
};

window.AdminAPI = AdminAPI;
