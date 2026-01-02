/**
 * GeoQR Device App - QR Code Generator Module
 * Generates QR codes from backend tokens
 * 
 * @author GeoQR Team
 * @version 3.0.0
 */

// ========================================
// QR Generator State
// ========================================
let currentToken = null;
let countdownInterval = null;
let refreshInterval = null;
let isRunning = false;

const QR_REFRESH_INTERVAL = 18; // seconds (slightly less than 20s expiry)

// ========================================
// QR Code Generator
// ========================================
const QRGenerator = {
    qrContainer: null,
    timerElement: null,
    timerCircle: null,
    timerText: null,
    tokenDisplay: null,

    init() {
        this.qrContainer = document.getElementById('qrCode');
        this.timerElement = document.getElementById('timerValue');
        this.timerCircle = document.getElementById('timerCircle');
        this.timerText = document.getElementById('timerText');
        this.tokenDisplay = document.getElementById('currentToken');

        // Setup start button
        const startBtn = document.getElementById('startQrBtn');
        if (startBtn) {
            startBtn.addEventListener('click', () => this.start());
        }

        // Setup stop button
        const stopBtn = document.getElementById('stopQrBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }

        // Display device info
        this.displayDeviceInfo();
    },

    displayDeviceInfo() {
        const data = window.Session?.getData();
        const deviceCode = window.Session?.getDeviceCode();

        if (data) {
            const deviceDisplay = document.getElementById('deviceIdDisplay');
            if (deviceDisplay) deviceDisplay.textContent = deviceCode || 'Unknown';

            const locationDisplay = document.getElementById('locationDisplay');
            if (locationDisplay) locationDisplay.textContent = data.location || 'Not assigned';
        }
    },

    start() {
        if (isRunning) return;
        isRunning = true;

        // Show QR container, hide controls and idle state
        const controls = document.getElementById('qrControls');
        const activeContainer = document.getElementById('qrActiveContainer');
        const idleState = document.getElementById('qrIdleState');

        if (controls) controls.classList.add('hidden');
        if (activeContainer) activeContainer.classList.remove('hidden');
        if (idleState) idleState.classList.add('hidden');

        // Start generating tokens
        this.generateNewToken();

        Toast?.success('QR Generation Started!');
    },

    stop() {
        isRunning = false;

        // Clear intervals
        if (countdownInterval) clearInterval(countdownInterval);
        if (refreshInterval) clearInterval(refreshInterval);
        countdownInterval = null;
        refreshInterval = null;

        // Show controls, hide QR container
        const controls = document.getElementById('qrControls');
        const activeContainer = document.getElementById('qrActiveContainer');
        const idleState = document.getElementById('qrIdleState');

        if (controls) controls.classList.remove('hidden');
        if (activeContainer) activeContainer.classList.add('hidden');
        if (idleState) idleState.classList.remove('hidden');

        // Clear QR
        if (this.qrContainer) this.qrContainer.innerHTML = '';
        if (this.tokenDisplay) this.tokenDisplay.textContent = '---';

        Toast?.info('QR Generation Stopped');
    },

    async generateNewToken() {
        const deviceCode = window.Session?.getDeviceCode();
        const password = window.Session?.getPassword();

        if (!deviceCode || !password) {
            this.showError('Device not configured');
            Toast?.error('Please login again');
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }

        try {
            // Show loading state
            this.showLoading();

            // Get token from backend with password
            const response = await API.post('/devices/token', {
                device_code: deviceCode,
                password: password
            });

            if (response.success) {
                currentToken = response.token;

                // Generate QR code
                this.renderQRCode(response.token);

                // Update token display
                if (this.tokenDisplay) {
                    this.tokenDisplay.textContent = response.token.substring(0, 8) + '...';
                }

                // Start countdown
                this.startCountdown(response.expirySeconds || QR_REFRESH_INTERVAL);

                // Update session status
                this.updateSessionStatus(response.hasActiveSession);
            }

        } catch (error) {
            console.error('Token generation error:', error);
            this.showError(error.message || 'Failed to generate QR');
            Toast?.error(error.message);
        }
    },

    renderQRCode(token) {
        if (!this.qrContainer) return;

        // Clear container
        this.qrContainer.innerHTML = '';

        // Use QRCode library
        if (typeof QRCode !== 'undefined') {
            new QRCode(this.qrContainer, {
                text: token,
                width: 200,
                height: 200,
                colorDark: '#1e293b',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            // Fallback: display token as text
            this.qrContainer.innerHTML = `
                <div style="padding: 20px; background: white; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 14px; color: #1e293b;">
                    ${token}
                </div>
            `;
        }
    },

    showLoading() {
        if (this.qrContainer) {
            this.qrContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 200px; height: 200px; background: white; border-radius: 8px;">
                    <div class="spinner" style="width: 40px; height: 40px; border: 3px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <p style="margin-top: 10px; color: #64748b; font-size: 14px;">Generating...</p>
                </div>
                <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
            `;
        }
    },

    showError(message) {
        if (this.qrContainer) {
            this.qrContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 200px; height: 200px; background: #fee2e2; border-radius: 8px; color: #dc2626;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <p style="margin-top: 10px; font-size: 12px; text-align: center; padding: 0 10px;">${message}</p>
                </div>
            `;
        }
    },

    startCountdown(seconds) {
        // Clear existing countdown
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        let remaining = seconds;
        const circumference = 2 * Math.PI * 54; // radius = 54

        // Set initial stroke dasharray
        if (this.timerCircle) {
            this.timerCircle.style.strokeDasharray = circumference;
        }

        // Update display
        const updateDisplay = () => {
            if (this.timerElement) {
                this.timerElement.textContent = remaining;
            }
            if (this.timerText) {
                this.timerText.textContent = remaining;
            }

            if (this.timerCircle) {
                const percent = (remaining / seconds) * 100;
                const offset = circumference - (percent / 100) * circumference;
                this.timerCircle.style.strokeDashoffset = offset;
            }
        };

        updateDisplay();

        countdownInterval = setInterval(() => {
            remaining--;
            updateDisplay();

            if (remaining <= 0) {
                clearInterval(countdownInterval);
                // Generate new token when countdown reaches 0
                if (isRunning) {
                    this.generateNewToken();
                }
            }
        }, 1000);
    },

    updateSessionStatus(hasSession) {
        const statusDot = document.getElementById('qrStatusDot');
        const statusText = document.getElementById('qrStatusText');

        if (statusDot && statusText) {
            if (hasSession) {
                statusDot.classList.add('active');
                statusDot.classList.remove('inactive');
                statusText.textContent = 'Session Active - Ready for Attendance';
            } else {
                statusDot.classList.add('inactive');
                statusDot.classList.remove('active');
                statusText.textContent = 'No Active Session';
            }
        }
    }
};

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if on dashboard page
    if (!window.location.pathname.includes('dashboard.html')) return;

    // Check session
    if (!window.Session?.isValid()) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize QR generator
    QRGenerator.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    QRGenerator.stop();
});

// Export
window.QRGenerator = QRGenerator;
