/**
 * GeoQR Web Portal - Authentication Module (Frontend)
 * Email + Password + Email OTP
 *
 * IMPORTANT:
 * - OTP is generated & emailed by BACKEND
 * - Frontend only redirects & verifies OTP
 */

// ========================================
// Configuration
// ========================================
const CONFIG = {
    API_BASE_URL: window.GeoQR?.config?.getApiUrl() || 'http://localhost:3000/api',
    TOKEN_KEY: 'geoqr_token',
    DATA_KEY: 'geoqr_user_data'
};

// Role-based dashboards
// Role-based dashboards
const DASHBOARD_MAP = {
    student: 'student-dashboard.html',
    faculty: 'faculty-dashboard.html',
    admin: 'admin-dashboard.html',
    device: 'device/'
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
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        this.container.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// ========================================
// API Client
// ========================================
const API = {
    getHeaders() {
        const token = Session.getToken();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    },

    async request(method, endpoint, body = null) {
        const headers = this.getHeaders();
        const config = {
            method,
            headers,
        };

        if (body) config.body = JSON.stringify(body);

        try {
            const res = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, config);

            if (res.status === 401) {
                console.warn('⚠️ 401 Unauthorized - Redirecting to login');
                Session.clear();
                window.location.href = 'index.html';
                return;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
            return data;
        } catch (error) {
            console.error(`API ${method} ${endpoint} error:`, error);
            throw error;
        }
    },

    async get(endpoint) {
        return this.request('GET', endpoint);
    },

    async post(endpoint, body) {
        return this.request('POST', endpoint, body);
    },

    async put(endpoint, body) {
        return this.request('PUT', endpoint, body);
    },

    async delete(endpoint) {
        return this.request('DELETE', endpoint);
    }
};

// ========================================
// Session Manager (uses sessionStorage - clears on browser close)
// ========================================
// ========================================
// Session Manager (uses localStorage - persistent)
// ========================================
const Session = {
    save(token, user) {
        localStorage.setItem(CONFIG.TOKEN_KEY, token);
        localStorage.setItem(CONFIG.DATA_KEY, JSON.stringify(user));
    },

    getToken() {
        return localStorage.getItem(CONFIG.TOKEN_KEY);
    },

    getUser() {
        const d = localStorage.getItem(CONFIG.DATA_KEY);
        try {
            return d ? JSON.parse(d) : null;
        } catch (e) { return null; }
    },

    getRole() {
        return this.getUser()?.role || null;
    },

    isValid() {
        return !!this.getToken();
    },

    clear() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.DATA_KEY);
        sessionStorage.clear(); // Clear legacy session storage just in case
    }
};

// ========================================
// Axios Configuration (Global Interceptors)
// ========================================
if (window.axios) {
    // Add Token to every request
    axios.interceptors.request.use(config => {
        const token = Session.getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    }, error => Promise.reject(error));

    // Handle 401 Unauthorized globally
    axios.interceptors.response.use(response => response, error => {
        if (error.response && error.response.status === 401) {
            console.warn('⚠️ Axios 401 Unauthorized - Redirecting to login');
            Session.clear();
            // Avoid redirection loop if already on login page
            if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
                window.location.href = 'index.html';
            }
        }
        return Promise.reject(error);
    });
}

// ========================================
// Role Guard
// ========================================
const RoleGuard = {
    redirect() {
        const role = Session.getRole();
        const target = DASHBOARD_MAP[role] || 'index.html';
        console.log(`🔄 RoleGuard Redirect: Role=${role}, Target=${target}`);
        window.location.href = target;
    }
};

// ========================================
// LOGIN PAGE LOGIC (index.html)
// ========================================
const LoginPage = {
    init() {
        // Skip if page has its own handler (login.html)
        if (window.SKIP_LOGIN_INIT) return;

        if (Session.isValid()) {
            RoleGuard.redirect();
            return;
        }

        const form = document.getElementById('loginForm');
        const btn = document.getElementById('loginBtn');

        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('userId').value.trim();
            const password = document.getElementById('password').value;

            if (!email || password.length < 4) {
                Toast.warning('Enter valid email and password');
                return;
            }

            btn.disabled = true;

            try {
                const res = await API.post('/auth/login', { email, password });

                // 🔐 ALL ROLES → OTP REQUIRED
                if (res.requiresOtp) {
                    sessionStorage.setItem('login_temp_token', res.tempToken);
                    sessionStorage.setItem('login_email', email);

                    Toast.success('OTP sent to your email');
                    window.location.href = 'otp.html';
                    return;
                }

                // ✅ DIRECT LOGIN (Faculty/Admin)
                if (res.success) {
                    Session.save(res.token, res.user);
                    Toast.success('Login successful');

                    setTimeout(() => RoleGuard.redirect(), 800);
                }

            } catch (err) {
                Toast.error(err.message || 'Login failed');
                btn.disabled = false;
            }
        });
    }
};


// ========================================
// DASHBOARD GUARD
// ========================================
const DashboardGuard = {
    init() {
        if (!Session.isValid()) {
            window.location.href = 'index.html';
        }
    }
};

// ========================================
// INIT
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();

    const path = window.location.pathname;

    if (
        path.includes('dashboard') ||
        path.includes('faculty-dashboard') ||
        path.includes('admin-dashboard') ||
        path.includes('scan')
    ) {
        DashboardGuard.init();
        Logout.init();   // ✅ ADD TO DASHBOARDS
    } else {
        LoginPage.init();
    }
});

// ========================================
// LOGOUT HANDLER
// ========================================
const Logout = {
    init() {
        const btn = document.getElementById('logoutBtn');
        if (!btn) return;

        btn.addEventListener('click', () => {
            // Clear all session data
            Session.clear();

            Toast.success('Logged out successfully');

            // Redirect to login
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 300);
        });
    }
};


// Expose for debugging
window.API = API;
window.Session = Session;
window.Toast = Toast;
