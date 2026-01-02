/**
 * GeoQR Device App - Authentication Module
 * Connects to real backend API for device authentication
 * 
 * @author GeoQR Team
 * @version 3.0.0
 */

// ========================================
// Configuration
// ========================================
const CONFIG = {
    API_BASE_URL: 'http://localhost:3000/api',
    TOKEN_KEY: 'geoqr_device_token',
    DATA_KEY: 'geoqr_device_data',
    DEVICE_KEY: 'geoqr_device_code'
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

        const headers = {
            'Content-Type': 'application/json',
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

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }
};

// ========================================
// Session Manager
// ========================================
const Session = {
    saveDevice(deviceCode, deviceData, password) {
        localStorage.setItem(CONFIG.DEVICE_KEY, deviceCode);
        localStorage.setItem(CONFIG.DATA_KEY, JSON.stringify({
            ...deviceData,
            password: password,
            savedAt: Date.now()
        }));
    },

    getDeviceCode() {
        return localStorage.getItem(CONFIG.DEVICE_KEY);
    },

    getPassword() {
        const data = this.getData();
        return data?.password || '';
    },

    getData() {
        try {
            const data = localStorage.getItem(CONFIG.DATA_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },

    isValid() {
        const deviceCode = this.getDeviceCode();
        const data = this.getData();
        return !!(deviceCode && data && data.password);
    },

    clear() {
        localStorage.removeItem(CONFIG.DEVICE_KEY);
        localStorage.removeItem(CONFIG.DATA_KEY);
        localStorage.removeItem(CONFIG.TOKEN_KEY);
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
    }
};

// ========================================
// Page Controllers
// ========================================
const LoginPage = {
    init() {
        if (Session.isValid()) {
            window.location.href = 'dashboard.html';
            return;
        }

        this.setupForm();
    },

    setupForm() {
        const form = document.getElementById('loginForm');
        const loginBtn = document.getElementById('loginBtn');

        if (!form) return;

        // Toggle password visibility
        const togglePassword = document.getElementById('togglePassword');
        const passwordInput = document.getElementById('password');

        if (togglePassword && passwordInput) {
            togglePassword.addEventListener('click', () => {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);

                const eyeOpen = togglePassword.querySelector('.eye-open');
                const eyeClosed = togglePassword.querySelector('.eye-closed');
                eyeOpen?.classList.toggle('hidden');
                eyeClosed?.classList.toggle('hidden');
            });
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const deviceId = document.getElementById('deviceId').value.trim();
            const password = document.getElementById('password')?.value || '';

            if (!deviceId) {
                Toast.warning('Please enter Device ID');
                return;
            }

            if (!password) {
                Toast.warning('Please enter password');
                return;
            }

            UI.setButtonLoading(loginBtn, true);

            try {
                // Authenticate device with password
                const response = await API.post('/devices/login', {
                    device_code: deviceId,
                    password: password
                });

                if (response.success) {
                    // Save device data and password for token generation
                    Session.saveDevice(deviceId, response.device, password);
                    Toast.success('Device verified! Redirecting...');

                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1000);
                }

            } catch (error) {
                Toast.error(error.message || 'Device authentication failed');
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

        this.displayDeviceInfo();
        this.setupLogout();
    },

    displayDeviceInfo() {
        const data = Session.getData();
        const deviceCode = Session.getDeviceCode();

        if (!data) return;

        const codeEl = document.getElementById('deviceCode');
        if (codeEl) codeEl.textContent = deviceCode || 'Unknown';

        const nameEl = document.getElementById('deviceName');
        if (nameEl) nameEl.textContent = data.name || deviceCode;

        const locationEl = document.getElementById('deviceLocation');
        if (locationEl) locationEl.textContent = data.location || 'Not assigned';
    },

    setupLogout() {
        const logoutBtn = document.getElementById('logoutBtn');

        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                Session.clear();
                Toast.success('Logged out successfully');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 800);
            });
        }
    }
};

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();

    const path = window.location.pathname;

    if (path.includes('dashboard.html')) {
        DashboardPage.init();
    } else {
        LoginPage.init();
    }
});

// Export
window.Session = Session;
window.Toast = Toast;
window.API = API;
window.CONFIG = CONFIG;
