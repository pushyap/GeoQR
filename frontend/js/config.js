/**
 * GeoQR Global Configuration
 * Centralized API URL configuration
 */
window.GeoQR = window.GeoQR || {};

window.GeoQR.config = {
    // Auto-detect environment
    getApiUrl: function () {
        const hostname = window.location.hostname;
        const port = window.location.port;

        // Development / Local Network
        if (hostname === 'localhost' || hostname === '127.0.0.1' ||
            hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
            // If on a local network, assume backend is on port 3000
            return `http://${hostname}:3000/api`;
        }

        // Production - Default to current origin or Render
        if (hostname.includes('onrender.com')) {
            return `https://${hostname.split('.')[0]}.onrender.com/api`;
        }

        return 'https://smart-qr-lidf.onrender.com/api';
    }
};

// Global shorthand
const API_BASE_URL = window.GeoQR.config.getApiUrl();
