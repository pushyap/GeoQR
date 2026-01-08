/**
 * GeoQR Student App - QR Scanner Module
 * Scans QR codes and submits attendance using mock data for demo
 */

let currentLocation = null;
let scannedData = null;

// ========================================
// Location Service
// ========================================
const LocationService = {
    async getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                // Return mock location
                resolve({ latitude: 17.385, longitude: 78.4867, accuracy: 10 });
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
                    // Return mock location on error
                    console.warn('Using mock location');
                    resolve({ latitude: 17.385, longitude: 78.4867, accuracy: 10 });
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        });
    },

    async init() {
        const statusEl = document.getElementById('locationStatus');
        const indicatorEl = document.getElementById('locationIndicator');
        const coordsEl = document.getElementById('locationCoords');
        const latEl = document.getElementById('latitude');
        const longEl = document.getElementById('longitude');

        try {
            statusEl.textContent = 'Getting location...';
            currentLocation = await this.getCurrentPosition();

            statusEl.textContent = `Location acquired (±${Math.round(currentLocation.accuracy)}m)`;
            indicatorEl.innerHTML = '<span class="indicator-dot success"></span>';

            if (coordsEl) {
                coordsEl.classList.remove('hidden');
                latEl.textContent = currentLocation.latitude.toFixed(6);
                longEl.textContent = currentLocation.longitude.toFixed(6);
            }

            return currentLocation;
        } catch (error) {
            statusEl.textContent = 'Using default location';
            indicatorEl.innerHTML = '<span class="indicator-dot warning"></span>';
            currentLocation = { latitude: 17.385, longitude: 78.4867, accuracy: 10 };
            return currentLocation;
        }
    }
};

// ========================================
// Initialize Page
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    Toast?.init();

    // Check authentication
    const user = Session?.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Initialize location
    await LocationService.init();

    // Hide scanner init, show mock scanner UI
    const scannerInit = document.getElementById('scannerInit');
    const scannerContainer = document.getElementById('scannerContainer');
    const scannerControls = document.getElementById('scannerControls');

    // Show a "Demo Mode" scanner
    setTimeout(() => {
        scannerInit.innerHTML = `
            <div class="demo-scanner">
                <div class="demo-icon">
                    <svg viewBox="0 0 100 100" fill="none">
                        <rect x="10" y="10" width="30" height="30" rx="4" stroke="#6366f1" stroke-width="3"/>
                        <rect x="60" y="10" width="30" height="30" rx="4" stroke="#6366f1" stroke-width="3"/>
                        <rect x="10" y="60" width="30" height="30" rx="4" stroke="#6366f1" stroke-width="3"/>
                        <rect x="65" y="65" width="20" height="20" rx="3" fill="#a855f7"/>
                    </svg>
                </div>
                <h3 style="margin-bottom: 8px;">Demo Mode</h3>
                <p style="color: var(--text-muted); margin-bottom: 20px;">Camera scanning is simulated</p>
                <button class="btn btn-primary" id="mockScanBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;margin-right:8px;">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7z"/>
                    </svg>
                    Simulate QR Scan
                </button>
            </div>
        `;

        document.getElementById('mockScanBtn').addEventListener('click', simulateScan);
    }, 1500);

    // Back to dashboard button
    document.getElementById('backToDashboardBtn')?.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    // Try again button
    document.getElementById('tryAgainBtn')?.addEventListener('click', () => {
        document.getElementById('errorModal').classList.add('hidden');
        document.getElementById('resultSection').classList.add('hidden');
    });

    // Go back button
    document.getElementById('goBackBtn')?.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });

    // Rescan button
    document.getElementById('rescanBtn')?.addEventListener('click', () => {
        document.getElementById('resultSection').classList.add('hidden');
        scannedData = null;
    });

    // Submit button
    document.getElementById('submitBtn')?.addEventListener('click', submitAttendance);
});

// ========================================
// Simulate QR Scan
// ========================================
function simulateScan() {
    // Generate mock QR data
    const mockToken = `GQR-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

    scannedData = {
        token: mockToken,
        deviceId: 'DEV-001',
        locationId: 1,
        latitude: 17.385,
        longitude: 78.4867,
        radius: 50,
        expiresAt: Date.now() + 15000
    };

    // Show result section
    document.getElementById('scannedToken').textContent = mockToken.substring(0, 20) + '...';
    document.getElementById('resultSection').classList.remove('hidden');

    Toast?.success('QR Code scanned successfully!');
}

// ========================================
// Submit Attendance
// ========================================
async function submitAttendance() {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock success response
        const result = MockAPI?.scanAttendance(scannedData, currentLocation) || {
            success: true,
            message: 'Attendance marked successfully!',
            session: {
                subject: 'Database Systems',
                location: 'Room 203 - IT Lab',
                time: new Date().toLocaleTimeString()
            }
        };

        if (result.success) {
            // Show success modal
            document.getElementById('successTimestamp').textContent = new Date().toLocaleString();
            document.getElementById('successLocation').textContent = result.session?.location || 'Room 203 - IT Lab';
            document.getElementById('successModal').classList.remove('hidden');
        } else {
            throw new Error(result.message || 'Failed to mark attendance');
        }

    } catch (error) {
        document.getElementById('errorMessage').textContent = error.message;
        document.getElementById('errorModal').classList.remove('hidden');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

// Export
window.LocationService = LocationService;
