/**
 * GPS Utility Functions
 * Calculates distance between two GPS coordinates using Haversine formula
 */

/**
 * Calculate distance between two GPS coordinates in meters
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c); // Distance in meters, rounded
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

/**
 * Check if a point is within radius of another point
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @param {number} radius - Allowed radius in meters
 * @returns {Object} { isWithin: boolean, distance: number }
 */
function isWithinRadius(lat1, lon1, lat2, lon2, radius) {
    const distance = calculateDistance(lat1, lon1, lat2, lon2);
    return {
        isWithin: distance <= radius,
        distance
    };
}

module.exports = {
    calculateDistance,
    isWithinRadius
};
