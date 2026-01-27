/**
 * GeoQR Device Auth Utilities
 * Standalone utilities for device deployment
 * Contains Toast notifications
 */

// ========================================
// Toast Notification System
// ========================================
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toastContainer';
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
        `;

        this.container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto-remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error', 5000); },
    warning(message) { this.show(message, 'warning'); },
    info(message) { this.show(message, 'info'); }
};

// Theme toggle function
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'dark-pro';

    // Toggle between themes
    const newTheme = currentTheme === 'dark-pro' ? 'soft-light-pro' : 'dark-pro';

    // Add transition class
    html.classList.add('theme-transitioning');

    // Apply theme
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('geoqr-theme', newTheme);

    // Remove transition class
    setTimeout(() => html.classList.remove('theme-transitioning'), 300);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
});
