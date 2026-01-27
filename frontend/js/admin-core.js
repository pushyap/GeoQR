/**
 * GeoQR Admin Panel - Core JavaScript
 * Modal system, utilities, and shared functionality
 */

// ========================================
// Admin Core Module
// ========================================
const AdminCore = {
    // Current state
    state: {
        currentModal: null,
        activityInterval: null,
        statsInterval: null,
        currentPage: {
            attendance: 1,
            students: 1
        },
        itemsPerPage: 10,
        filters: {
            attendance: { date: '', location: '', student: '' },
            activity: 'all'
        }
    },

    // ========================================
    // Modal System
    // ========================================
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            this.state.currentModal = modalId;
            document.body.style.overflow = 'hidden';
        }
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId || this.state.currentModal);
        if (modal) {
            modal.classList.remove('active');
            this.state.currentModal = null;
            document.body.style.overflow = '';
            // Reset form if exists
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    },

    closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
        this.state.currentModal = null;
        document.body.style.overflow = '';
    },

    // ========================================
    // Toast Notifications
    // ========================================
    toast(message, type = 'info', duration = 4000) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `<span style="margin-right: 8px;">${icons[type] || ''}</span>${message}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    // ========================================
    // Confirmation Dialog
    // ========================================
    confirm(options) {
        return new Promise((resolve) => {
            const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'warning' } = options;

            const modal = document.getElementById('confirmModal');
            if (!modal) {
                resolve(false);
                return;
            }

            modal.querySelector('.confirm-icon').className = `confirm-icon ${type}`;
            modal.querySelector('.confirm-icon').textContent = type === 'danger' ? '🗑️' : '⚠️';
            modal.querySelector('.confirm-title').textContent = title;
            modal.querySelector('.confirm-message').textContent = message;
            modal.querySelector('.btn-confirm').textContent = confirmText;
            modal.querySelector('.btn-cancel').textContent = cancelText;

            const confirmBtn = modal.querySelector('.btn-confirm');
            const cancelBtn = modal.querySelector('.btn-cancel');

            const cleanup = () => {
                this.closeModal('confirmModal');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);

            this.openModal('confirmModal');
        });
    },

    // ========================================
    // Animated Counter
    // ========================================
    animateCounter(element, targetValue, duration = 1000) {
        const startValue = parseInt(element.textContent) || 0;
        const startTime = performance.now();

        const updateCounter = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out quad
            const easeProgress = 1 - (1 - progress) * (1 - progress);
            const currentValue = Math.round(startValue + (targetValue - startValue) * easeProgress);

            element.textContent = currentValue;

            if (progress < 1) {
                requestAnimationFrame(updateCounter);
            }
        };

        requestAnimationFrame(updateCounter);
    },

    // ========================================
    // Pagination
    // ========================================
    paginate(items, page, perPage = 10) {
        const start = (page - 1) * perPage;
        const end = start + perPage;
        return {
            items: items.slice(start, end),
            total: items.length,
            totalPages: Math.ceil(items.length / perPage),
            currentPage: page,
            hasNext: end < items.length,
            hasPrev: page > 1
        };
    },

    renderPagination(container, currentPage, totalPages, onChange) {
        if (!container) return;

        let html = `<span class="pagination-info">Page ${currentPage} of ${totalPages}</span>`;
        html += '<div class="pagination-buttons">';

        html += `<button class="pagination-btn" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

        // Show max 5 page buttons
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        html += `<button class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;
        html += '</div>';

        container.innerHTML = html;

        container.querySelectorAll('.pagination-btn:not(:disabled)').forEach(btn => {
            btn.addEventListener('click', () => onChange(parseInt(btn.dataset.page)));
        });
    },

    // ========================================
    // Form Utilities
    // ========================================
    getFormData(formId) {
        const form = document.getElementById(formId);
        if (!form) return {};

        const formData = new FormData(form);
        const data = {};

        formData.forEach((value, key) => {
            // Handle checkboxes
            const input = form.querySelector(`[name="${key}"]`);
            if (input?.type === 'checkbox') {
                data[key] = input.checked;
            } else if (input?.type === 'number') {
                data[key] = parseFloat(value) || 0;
            } else {
                data[key] = value;
            }
        });

        return data;
    },

    validateForm(formId, rules) {
        const form = document.getElementById(formId);
        if (!form) return { valid: false, errors: ['Form not found'] };

        const errors = [];

        Object.entries(rules).forEach(([field, rule]) => {
            const input = form.querySelector(`[name="${field}"]`);
            const value = input?.value?.trim();

            if (rule.required && !value) {
                errors.push(`${rule.label || field} is required`);
                input?.classList.add('error');
            } else if (rule.min && parseFloat(value) < rule.min) {
                errors.push(`${rule.label || field} must be at least ${rule.min}`);
                input?.classList.add('error');
            } else if (rule.max && parseFloat(value) > rule.max) {
                errors.push(`${rule.label || field} must be at most ${rule.max}`);
                input?.classList.add('error');
            } else {
                input?.classList.remove('error');
            }
        });

        return { valid: errors.length === 0, errors };
    },

    // ========================================
    // Time Utilities
    // ========================================
    timeAgo(timestamp) {
        const now = Date.now();
        const diff = now - new Date(timestamp).getTime();

        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    },

    formatDateTime(date) {
        return new Date(date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    // ========================================
    // Live Updates
    // ========================================
    startLiveUpdates(callbacks) {
        // Update stats every 10 seconds
        if (callbacks.updateStats) {
            this.state.statsInterval = setInterval(() => {
                callbacks.updateStats();
            }, 10000);
        }

        // Add activity every 5 seconds
        if (callbacks.addActivity) {
            this.state.activityInterval = setInterval(() => {
                callbacks.addActivity();
            }, 5000);
        }
    },

    stopLiveUpdates() {
        if (this.state.statsInterval) {
            clearInterval(this.state.statsInterval);
            this.state.statsInterval = null;
        }
        if (this.state.activityInterval) {
            clearInterval(this.state.activityInterval);
            this.state.activityInterval = null;
        }
    },

    // ========================================
    // Event Delegation Helper
    // ========================================
    delegate(parent, selector, event, handler) {
        parent.addEventListener(event, (e) => {
            const target = e.target.closest(selector);
            if (target && parent.contains(target)) {
                handler.call(target, e, target);
            }
        });
    },

    // ========================================
    // Initialize Modal Listeners
    // ========================================
    initModalListeners() {
        // Close on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => this.closeAllModals());
        });

        // Close buttons
        document.querySelectorAll('.modal-close, [data-dismiss="modal"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeAllModals());
        });

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.state.currentModal) {
                this.closeAllModals();
            }
        });
    },

    // ========================================
    // PDF Report Generator
    // ========================================
    generatePDF(config) {
        // config: { title, subtitle, filename, headers: [], data: [], orientation: 'portrait' }
        if (!window.jspdf) {
            this.toast('PDF library not loaded', 'error');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF(config.orientation || 'portrait');

        // Header Bar
        doc.setFillColor(79, 70, 229); // Primary Indigo
        doc.rect(0, 0, doc.internal.pageSize.width, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text('GeoQR Attendance System', 14, 14);

        // Report Title
        doc.setTextColor(33, 33, 33);
        doc.setFontSize(14);
        doc.text(config.title || 'System Report', 14, 35);

        // Metadata
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        const startY = config.subtitle ? 48 : 42;

        if (config.subtitle) {
            doc.text(config.subtitle, 14, 41);
        }
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, startY);

        // Table
        if (config.headers && config.data) {
            doc.autoTable({
                head: [config.headers],
                body: config.data,
                startY: startY + 5,
                theme: 'grid',
                headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
                alternateRowStyles: { fillColor: [249, 250, 251] }
            });
        }

        doc.save(config.filename || `report_${Date.now()}.pdf`);
    }
};

// ========================================
// Settings Manager
// ========================================
const SettingsManager = {
    defaults: {
        gpsRadius: 50,
        qrExpiry: 15,
        sessionTimeout: 30,
        enableOtp: true,
        enableGpsValidation: true
    },

    load() {
        const saved = localStorage.getItem('geoqr_admin_settings');
        return saved ? { ...this.defaults, ...JSON.parse(saved) } : { ...this.defaults };
    },

    save(settings) {
        localStorage.setItem('geoqr_admin_settings', JSON.stringify(settings));
        return true;
    },

    get(key) {
        const settings = this.load();
        return settings[key];
    },

    set(key, value) {
        const settings = this.load();
        settings[key] = value;
        this.save(settings);
    }
};

// Expose to global scope
window.AdminCore = AdminCore;
window.SettingsManager = SettingsManager;
