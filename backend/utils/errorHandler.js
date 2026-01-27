/**
 * Error Handler Utilities
 * Standardized error response format for production-grade API
 */

// Error code definitions
const ErrorCodes = {
    // Authentication Errors (400-499)
    INVALID_CREDENTIALS: { code: 'INVALID_CREDENTIALS', status: 401 },
    TOKEN_EXPIRED: { code: 'TOKEN_EXPIRED', status: 401 },
    TOKEN_INVALID: { code: 'TOKEN_INVALID', status: 401 },
    ACCESS_DENIED: { code: 'ACCESS_DENIED', status: 403 },
    ACCOUNT_DISABLED: { code: 'ACCOUNT_DISABLED', status: 403 },

    // Device Errors
    DEVICE_NOT_FOUND: { code: 'DEVICE_NOT_FOUND', status: 404 },
    DEVICE_DISABLED: { code: 'DEVICE_DISABLED', status: 403 },
    DEVICE_OFFLINE: { code: 'DEVICE_OFFLINE', status: 503 },

    // Session Errors
    SESSION_NOT_FOUND: { code: 'SESSION_NOT_FOUND', status: 404 },
    SESSION_EXPIRED: { code: 'SESSION_EXPIRED', status: 410 },
    SESSION_INACTIVE: { code: 'SESSION_INACTIVE', status: 400 },
    SESSION_ALREADY_EXISTS: { code: 'SESSION_ALREADY_EXISTS', status: 409 },

    // QR/Attendance Errors
    QR_EXPIRED: { code: 'QR_EXPIRED', status: 410 },
    QR_INVALID: { code: 'QR_INVALID', status: 400 },
    QR_ALREADY_USED: { code: 'QR_ALREADY_USED', status: 409 },
    LOCATION_MISMATCH: { code: 'LOCATION_MISMATCH', status: 403 },
    DUPLICATE_ATTENDANCE: { code: 'DUPLICATE_ATTENDANCE', status: 409 },

    // Validation Errors
    VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400 },
    MISSING_REQUIRED_FIELD: { code: 'MISSING_REQUIRED_FIELD', status: 400 },

    // Resource Errors
    NOT_FOUND: { code: 'NOT_FOUND', status: 404 },
    RESOURCE_CONFLICT: { code: 'RESOURCE_CONFLICT', status: 409 },

    // Rate Limiting
    RATE_LIMIT_EXCEEDED: { code: 'RATE_LIMIT_EXCEEDED', status: 429 },

    // Server Errors
    INTERNAL_ERROR: { code: 'INTERNAL_ERROR', status: 500 },
    DATABASE_ERROR: { code: 'DATABASE_ERROR', status: 500 },
    SERVICE_UNAVAILABLE: { code: 'SERVICE_UNAVAILABLE', status: 503 }
};

// Fallback suggestions for each error type
const FallbackSuggestions = {
    DEVICE_OFFLINE: 'Switch to backup device or try again in a moment',
    QR_EXPIRED: 'Request a new QR code from the device',
    QR_ALREADY_USED: 'Wait for next QR code rotation',
    LOCATION_MISMATCH: 'Move closer to the designated location and try again',
    DUPLICATE_ATTENDANCE: 'Your attendance has already been recorded',
    SESSION_EXPIRED: 'Contact faculty to start a new session',
    RATE_LIMIT_EXCEEDED: 'Please wait a moment before trying again',
    SERVICE_UNAVAILABLE: 'System is temporarily unavailable, please retry shortly',
    TOKEN_EXPIRED: 'Please log in again',
    DEVICE_DISABLED: 'Contact administrator to re-enable device'
};

/**
 * Create standardized error response
 * @param {string} errorCode - Error code from ErrorCodes
 * @param {string} message - Human-readable error message
 * @param {Object} options - Additional options
 * @returns {Object} Standardized error response
 */
function createError(errorCode, message, options = {}) {
    const errorDef = ErrorCodes[errorCode] || ErrorCodes.INTERNAL_ERROR;
    const fallback = options.fallback || FallbackSuggestions[errorCode] || null;

    return {
        success: false,
        error_code: errorDef.code,
        message: message,
        ...(fallback && { fallback }),
        ...(options.details && { details: options.details }),
        ...(options.retryAfter && { retryAfter: options.retryAfter })
    };
}

/**
 * Send standardized error response
 * @param {Object} res - Express response object
 * @param {string} errorCode - Error code from ErrorCodes
 * @param {string} message - Human-readable error message
 * @param {Object} options - Additional options
 */
function sendError(res, errorCode, message, options = {}) {
    const errorDef = ErrorCodes[errorCode] || ErrorCodes.INTERNAL_ERROR;
    const status = options.status || errorDef.status;

    res.status(status).json(createError(errorCode, message, options));
}

/**
 * Express error handling middleware
 */
function errorMiddleware(err, req, res, next) {
    console.error('Unhandled error:', err);

    // Handle known error types
    if (err.name === 'ValidationError') {
        return sendError(res, 'VALIDATION_ERROR', err.message);
    }

    if (err.name === 'JsonWebTokenError') {
        return sendError(res, 'TOKEN_INVALID', 'Invalid authentication token');
    }

    if (err.name === 'TokenExpiredError') {
        return sendError(res, 'TOKEN_EXPIRED', 'Authentication token has expired');
    }

    // Database errors
    if (err.code === '23505') { // Unique violation
        return sendError(res, 'RESOURCE_CONFLICT', 'Resource already exists');
    }

    if (err.code === '23503') { // Foreign key violation
        return sendError(res, 'VALIDATION_ERROR', 'Invalid reference');
    }

    // Default to internal error
    sendError(res, 'INTERNAL_ERROR',
        process.env.NODE_ENV === 'development'
            ? err.message
            : 'An unexpected error occurred'
    );
}

/**
 * Async route handler wrapper to catch errors
 * @param {Function} fn - Async route handler
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

module.exports = {
    ErrorCodes,
    FallbackSuggestions,
    createError,
    sendError,
    errorMiddleware,
    asyncHandler
};
