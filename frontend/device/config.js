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

        // Development / Local Network
        if (hostname === 'localhost' || hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
            return `http://${hostname}:3000/api`;
        }

        // Production - Your Render backend URL
        return 'https://smart-qr-lidf.onrender.com/api';
    }
};

// Global shorthand
const API_BASE_URL = window.GeoQR.config.getApiUrl();
