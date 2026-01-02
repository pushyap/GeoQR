/**
 * GeoQR Student App - QR Scanner Module
 * Scans QR codes and submits attendance to backend API
 * 
 * @author GeoQR Team
 * @version 3.0.0
 */

// ========================================
// Scanner State
// ========================================
let scanner = null;
let isScanning = false;
let currentLocation = null;

// ========================================
// Location Handler
// ========================================
const LocationService = {
    async getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    });
                },
                (error) => {
                    let message = 'Location access denied';
                    if (error.code === 2) message = 'Location unavailable';
                    if (error.code === 3) message = 'Location request timed out';
                    reject(new Error(message));
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    },

    async init() {
        const statusEl = document.getElementById('locationStatus');
        const statusText = document.getElementById('locationText');

        try {
            statusEl?.classList.add('loading');
            if (statusText) statusText.textContent = 'Getting location...';

            currentLocation = await this.getCurrentPosition();

            statusEl?.classList.remove('loading');
            statusEl?.classList.add('success');
            if (statusText) statusText.textContent = `Location acquired (±${Math.round(currentLocation.accuracy)}m)`;

            return currentLocation;
        } catch (error) {
            statusEl?.classList.remove('loading');
            statusEl?.classList.add('error');
            if (statusText) statusText.textContent = error.message;
            throw error;
        }
    }
};

// ========================================
// Scanner Module
// ========================================
const Scanner = {
    videoElement: null,
    canvasElement: null,
    canvasContext: null,
    animationFrame: null,

    async init() {
        this.videoElement = document.getElementById('scanner-video');
        this.canvasElement = document.getElementById('scanner-canvas');

        if (!this.canvasElement) {
            // Create canvas for QR scanning
            this.canvasElement = document.createElement('canvas');
            this.canvasElement.id = 'scanner-canvas';
            this.canvasElement.style.display = 'none';
            document.body.appendChild(this.canvasElement);
        }

        this.canvasContext = this.canvasElement.getContext('2d');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            if (this.videoElement) {
                this.videoElement.srcObject = stream;
                this.videoElement.play();

                // Wait for video to be ready
                await new Promise((resolve) => {
                    this.videoElement.onloadedmetadata = resolve;
                });

                this.startScanning();
            }

            return true;
        } catch (error) {
            console.error('Camera access error:', error);
            Toast?.error('Camera access denied. Please allow camera permissions.');
            return false;
        }
    },

    startScanning() {
        isScanning = true;
        this.scanFrame();
    },

    stopScanning() {
        isScanning = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }

        if (this.videoElement?.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
        }
    },

    scanFrame() {
        if (!isScanning) return;

        if (this.videoElement?.readyState === this.videoElement?.HAVE_ENOUGH_DATA) {
            this.canvasElement.width = this.videoElement.videoWidth;
            this.canvasElement.height = this.videoElement.videoHeight;
            this.canvasContext.drawImage(this.videoElement, 0, 0);

            const imageData = this.canvasContext.getImageData(
                0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );

            // Use jsQR library if available
            if (typeof jsQR !== 'undefined') {
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code) {
                    this.handleQRCode(code.data);
                    return;
                }
            }
        }

        this.animationFrame = requestAnimationFrame(() => this.scanFrame());
    },

    async handleQRCode(data) {
        isScanning = false;

        try {
            // Show loading state
            const scannerBox = document.querySelector('.scanner-box');
            scannerBox?.classList.add('scanned');

            Toast?.info('QR Code detected! Marking attendance...');

            // Get current location
            if (!currentLocation) {
                try {
                    currentLocation = await LocationService.getCurrentPosition();
                } catch (error) {
                    this.showResult(false, 'Location is required to mark attendance');
                    return;
                }
            }

            // Submit to backend
            const response = await API.post('/attendance/mark', {
                token: data,
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude
            });

            if (response.success) {
                this.showResult(true, response.message, response.attendance);
            } else {
                this.showResult(false, response.error || 'Failed to mark attendance');
            }

        } catch (error) {
            this.showResult(false, error.message || 'Failed to mark attendance');
        }
    },

    showResult(success, message, details = null) {
        const modal = document.getElementById('resultModal');
        const modalIcon = document.getElementById('modalIcon');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        const modalDetails = document.getElementById('modalDetails');

        if (!modal) return;

        modal.classList.remove('hidden');
        modal.classList.add('show');

        if (success) {
            modal.classList.add('success');
            modal.classList.remove('error');
            modalIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
            modalTitle.textContent = 'Success!';
        } else {
            modal.classList.add('error');
            modal.classList.remove('success');
            modalIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
            modalTitle.textContent = 'Error';
        }

        modalMessage.textContent = message;

        if (details && modalDetails) {
            modalDetails.innerHTML = `
                <p><strong>Location:</strong> ${details.location}</p>
                <p><strong>Subject:</strong> ${details.subject || 'N/A'}</p>
                <p><strong>Time:</strong> ${new Date(details.markedAt).toLocaleTimeString()}</p>
            `;
            modalDetails.classList.remove('hidden');
        } else if (modalDetails) {
            modalDetails.classList.add('hidden');
        }
    },

    closeModal() {
        const modal = document.getElementById('resultModal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.classList.add('hidden');
                window.location.href = 'dashboard.html';
            }, 300);
        }
    }
};

// ========================================
// Manual Token Entry (for testing)
// ========================================
const ManualEntry = {
    init() {
        const btn = document.getElementById('manualEntryBtn');
        const form = document.getElementById('manualEntryForm');
        const submitBtn = document.getElementById('submitTokenBtn');

        if (btn && form) {
            btn.addEventListener('click', () => {
                form.classList.toggle('hidden');
            });
        }

        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                const input = document.getElementById('manualTokenInput');
                if (input && input.value.trim()) {
                    Scanner.handleQRCode(input.value.trim());
                }
            });
        }
    }
};

// ========================================
// Initialize
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!window.Session?.isValid()) {
        window.location.href = 'index.html';
        return;
    }

    // Initialize location first
    try {
        await LocationService.init();
    } catch (error) {
        console.warn('Location init failed:', error);
    }

    // Initialize scanner
    await Scanner.init();

    // Initialize manual entry
    ManualEntry.init();

    // Close modal button
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => Scanner.closeModal());
    }
});

// Export
window.Scanner = Scanner;
window.LocationService = LocationService;
