/**
 * GeoQR Web Portal - Authentication Module
 * Connects to real backend API for authentication
 * 
 * @author GeoQR Team
 * @version 3.0.0
 */

// ========================================
// Configuration
// ========================================
const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    TOKEN_KEY: 'geoqr_token',
    DATA_KEY: 'geoqr_user_data',
};

// Role-based dashboard mapping
const DASHBOARD_MAP = {
    'student': 'dashboard.html',
    'faculty': 'faculty-dashboard.html',
    'admin': 'admin-dashboard.html'
};

// ========================================
// Toast Notification System
// ========================================
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toastContainer');
    },

    show(message, type = 'info', duration = 4000) {
        if (!this.container) this.init();
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toast-in 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);

        return toast;
    },

    success(message, duration) { return this.show(message, 'success', duration); },
    error(message, duration) { return this.show(message, 'error', duration); },
    warning(message, duration) { return this.show(message, 'warning', duration); },
    info(message, duration) { return this.show(message, 'info', duration); }
};

// ========================================
// API Client
// ========================================
const API = {
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        const token = Session.getToken();

        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                throw new Error('Cannot connect to server. Make sure backend is running.');
            }
            throw error;
        }
    },

    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// ========================================
// Session Manager
// ========================================
const Session = {
    save(token, userData) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
        localStorage.setItem(CONFIG.DATA_KEY, JSON.stringify({
            ...userData,
            savedAt: Date.now()
        }));
    },

    getData() {
        try {
            const data = localStorage.getItem(CONFIG.DATA_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    getToken() {
        return localStorage.getItem(CONFIG.TOKEN_KEY);
    },

    isValid() {
        const token = this.getToken();
        const data = this.getData();
        return !!(token && data);
    },

    getRole() {
        const data = this.getData();
        return data ? data.role : null;
    },

    clear() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.DATA_KEY);
    }
};

// ========================================
// UI Helpers
// ========================================
const UI = {
    setButtonLoading(button, loading) {
        if (loading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    },

    setupPasswordToggle() {
        const toggle = document.getElementById('togglePassword');
        const password = document.getElementById('password');

        if (toggle && password) {
            toggle.addEventListener('click', () => {
                const isPassword = password.type === 'password';
                password.type = isPassword ? 'text' : 'password';
                toggle.querySelector('.eye-open').classList.toggle('hidden', !isPassword);
                toggle.querySelector('.eye-closed').classList.toggle('hidden', isPassword);
            });
        }
    },

    setupRoleSelector() {
        const roleInputs = document.querySelectorAll('input[name="role"]');
        const userIdLabel = document.getElementById('userIdLabel');
        const userIdInput = document.getElementById('userId');

        const labels = {
            'student': 'Email',
            'faculty': 'Email',
            'admin': 'Email'
        };

        const placeholders = {
            'student': 'e.g., john@geoqr.local',
            'faculty': 'e.g., sarah@geoqr.local',
            'admin': 'e.g., admin@geoqr.local'
        };

        roleInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const role = e.target.value;
                if (userIdLabel) userIdLabel.textContent = labels[role] || 'Email';
                if (userIdInput) userIdInput.placeholder = placeholders[role] || 'Enter your email';
            });
        });
    }
};

// ========================================
// Role-based Access Control
// ========================================
const RoleGuard = {
    redirectToDashboard() {
        const role = Session.getRole();
        const dashboard = DASHBOARD_MAP[role] || 'dashboard.html';
        window.location.href = dashboard;
    }
};

// ========================================
// Page Controllers
// ========================================
const LoginPage = {
    init() {
        if (Session.isValid()) {
            RoleGuard.redirectToDashboard();
            return;
        }

        UI.setupPasswordToggle();
        UI.setupRoleSelector();
        this.setupForm();
    },

    setupForm() {
        const form = document.getElementById('loginForm');
        const loginBtn = document.getElementById('loginBtn');

        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('userId').value.trim();
            const password = document.getElementById('password').value;

            if (!email) {
                Toast.warning('Please enter your email');
                return;
            }

            if (password.length < 4) {
                Toast.warning('Password must be at least 4 characters');
                return;
            }

            UI.setButtonLoading(loginBtn, true);

            try {
                const response = await API.post('/auth/login', { email, password });

                if (response.success) {
                    Session.save(response.token, response.user);
                    Toast.success('Login successful! Redirecting...');

                    setTimeout(() => {
                        RoleGuard.redirectToDashboard();
                    }, 1000);
                }

            } catch (error) {
                Toast.error(error.message || 'Login failed');
                UI.setButtonLoading(loginBtn, false);
            }
        });
    }
};

const DashboardPage = {
    init() {
        if (!Session.isValid()) {
            window.location.href = 'index.html';
            return;
        }

        this.displayUserInfo();
        this.setupLogout();
        this.loadData();
    },

    displayUserInfo() {
        const data = Session.getData();
        if (!data) return;

        const nameEl = document.getElementById('userName');
        if (nameEl) nameEl.textContent = data.name || 'User';

        const idBadge = document.getElementById('userIdBadge');
        if (idBadge) idBadge.textContent = data.studentId || data.email;

        const avatarInitial = document.getElementById('avatarInitial');
        if (avatarInitial) {
            avatarInitial.textContent = (data.name || 'U').charAt(0).toUpperCase();
        }
    },

    setupLogout() {
        const logoutBtn = document.getElementById('logoutBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                try {
                    await API.post('/auth/logout', {});
                } catch (e) {
                    // Ignore logout API errors
                }
                Session.clear();
                Toast.success('Logged out successfully');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            });
        }
    },

    async loadData() {
        const role = Session.getRole();

        if (role === 'student') {
            await this.loadStudentData();
        } else if (role === 'faculty') {
            await this.loadFacultyData();
        } else if (role === 'admin') {
            await this.loadAdminData();
        }
    },

    async loadStudentData() {
        try {
            const response = await API.get('/attendance/my');
            if (response.success && response.records) {
                this.renderAttendanceHistory(response.records);
            }
        } catch (error) {
            console.error('Failed to load attendance:', error);
        }
    },

    async loadFacultyData() {
        try {
            const response = await API.get('/sessions/active');
            if (response.success) {
                // Update UI with active sessions
                console.log('Active sessions:', response.sessions);
            }
        } catch (error) {
            console.error('Failed to load sessions:', error);
        }
    },

    async loadAdminData() {
        try {
            const response = await API.get('/admin/stats');
            if (response.success) {
                this.renderAdminStats(response.stats);
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    },

    renderAttendanceHistory(records) {
        const list = document.getElementById('activityList');
        if (!list || !records.length) return;

        list.innerHTML = records.slice(0, 5).map(r => `
            <div class="activity-item">
                <div class="activity-icon success">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                </div>
                <div class="activity-content">
                    <span class="activity-title">${r.subject || 'Attendance Marked'}</span>
                    <span class="activity-location">${r.location_name}</span>
                </div>
                <span class="activity-time">${new Date(r.marked_at).toLocaleDateString()}</span>
            </div>
        `).join('');
    },

    renderAdminStats(stats) {
        // Update stat cards if they exist
        const elements = {
            totalStudents: document.querySelector('[data-stat="students"]'),
            totalDevices: document.querySelector('[data-stat="devices"]'),
            activeSessions: document.querySelector('[data-stat="sessions"]'),
            todayAttendance: document.querySelector('[data-stat="attendance"]')
        };

        Object.entries(elements).forEach(([key, el]) => {
            if (el && stats[key] !== undefined) {
                el.textContent = stats[key];
            }
        });
    }
};

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();

    const path = window.location.pathname;

    if (path.includes('admin-dashboard.html') ||
        path.includes('faculty-dashboard.html') ||
        path.includes('dashboard.html')) {
        DashboardPage.init();
    } else if (path.includes('scan.html')) {
        if (!Session.isValid()) {
            window.location.href = 'index.html';
            return;
        }
    } else {
        LoginPage.init();
    }
});

// Export for other modules
window.Session = Session;
window.Toast = Toast;
window.API = API;
window.CONFIG = CONFIG;
