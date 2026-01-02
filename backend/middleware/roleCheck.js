/**
 * Role-based Access Control Middleware
 * Restricts access to routes based on user role
 */

/**
 * Check if user has required role(s)
 * @param  {...string} roles - Allowed roles
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required role: ${roles.join(' or ')}`
            });
        }

        next();
    };
}

/**
 * Role constants for cleaner code
 */
const ROLES = {
    STUDENT: 'student',
    FACULTY: 'faculty',
    ADMIN: 'admin',
    DEVICE: 'device'
};

/**
 * Shorthand role checks
 */
const isStudent = requireRole(ROLES.STUDENT);
const isFaculty = requireRole(ROLES.FACULTY);
const isAdmin = requireRole(ROLES.ADMIN);
const isDevice = requireRole(ROLES.DEVICE);
const isFacultyOrAdmin = requireRole(ROLES.FACULTY, ROLES.ADMIN);
const isAnyRole = requireRole(ROLES.STUDENT, ROLES.FACULTY, ROLES.ADMIN, ROLES.DEVICE);

module.exports = {
    requireRole,
    ROLES,
    isStudent,
    isFaculty,
    isAdmin,
    isDevice,
    isFacultyOrAdmin,
    isAnyRole
};
