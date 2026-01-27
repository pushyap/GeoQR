/**
 * GeoQR Device Configuration
 * Standalone config for device deployment
 * 
 * DEPLOYMENT NOTE: Update the production URL below to your backend on Render
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

        // Production - Your Render backend URL
        // Update this to your actual backend URL if different
        return 'https://smart-qr-lidf.onrender.com/api';
    }
};

// Global shorthand
const API_BASE_URL = window.GeoQR.config.getApiUrl();
