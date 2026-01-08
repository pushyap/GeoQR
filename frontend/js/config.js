/**
 * GeoQR Global Configuration
 * Centralized API URL configuration
 */
window.GeoQR = window.GeoQR || {};

window.GeoQR.config = {
    // Auto-detect environment
    getApiUrl: function () {
        const hostname = window.location.hostname;

        // Development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3000/api';
        }

        // Production - REPLACE THIS with your actual backend URL if different
        // Example: 'https://my-geoqr-backend.onrender.com/api'
        // If frontend and backend are on same domain, leave as '/api'
        return 'https://smart-qr-lidf.onrender.com/api';
    }
};

// Global shorthand
const API_BASE_URL = window.GeoQR.config.getApiUrl();
