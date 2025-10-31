// Enhanced JWT Authentication Middleware
const { verifyToken, getUserByUsername } = require('../modules/auth');
const { securityLogger } = require('../modules/security');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        securityLogger.logFailedAuth(req, 'NO_TOKEN_PROVIDED');
        return res.status(401).json({ 
            success: false,
            error: {
                message: 'Access token required',
                code: 'NO_TOKEN'
            }
        });
    }

    try {
        // Enhanced token validation
        const decoded = verifyToken(token);
        
        // Validate token structure
        if (!decoded.username || !decoded.role || !decoded.iat || !decoded.exp) {
            securityLogger.logFailedAuth(req, 'INVALID_TOKEN_STRUCTURE');
            return res.status(401).json({ 
                success: false,
                error: {
                    message: 'Invalid token format',
                    code: 'INVALID_TOKEN'
                }
            });
        }

        // Check if token is expired (additional check)
        if (decoded.exp * 1000 < Date.now()) {
            securityLogger.logFailedAuth(req, 'TOKEN_EXPIRED');
            return res.status(401).json({ 
                success: false,
                error: {
                    message: 'Token has expired',
                    code: 'TOKEN_EXPIRED'
                }
            });
        }

        // Validate user exists and is active
        const user = getUserByUsername(decoded.username);
        if (!user) {
            securityLogger.logFailedAuth(req, 'USER_NOT_FOUND');
            return res.status(401).json({ 
                success: false,
                error: {
                    message: 'User not found',
                    code: 'USER_NOT_FOUND'
                }
            });
        }

        // Validate role matches
        if (user.role !== decoded.role) {
            securityLogger.logFailedAuth(req, 'ROLE_MISMATCH');
            return res.status(401).json({ 
                success: false,
                error: {
                    message: 'Token role mismatch',
                    code: 'ROLE_MISMATCH'
                }
            });
        }

        // Add user info and token metadata to request object
        req.user = user;
        req.tokenIssued = new Date(decoded.iat * 1000);
        req.tokenExpires = new Date(decoded.exp * 1000);
        
        next();
    } catch (error) {
        let errorCode = 'INVALID_TOKEN';
        let errorMessage = 'Invalid token';

        if (error.name === 'TokenExpiredError') {
            errorCode = 'TOKEN_EXPIRED';
            errorMessage = 'Token has expired';
        } else if (error.name === 'JsonWebTokenError') {
            errorCode = 'INVALID_TOKEN';
            errorMessage = 'Invalid token';
        } else if (error.name === 'NotBeforeError') {
            errorCode = 'TOKEN_NOT_ACTIVE';
            errorMessage = 'Token not active yet';
        }

        securityLogger.logFailedAuth(req, errorCode);
        return res.status(401).json({ 
            success: false,
            error: {
                message: errorMessage,
                code: errorCode
            }
        });
    }
};

// Enhanced role-based access control middleware
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            securityLogger.logFailedAuth(req, 'NO_USER_CONTEXT');
            return res.status(401).json({ 
                success: false,
                error: {
                    message: 'Authentication required',
                    code: 'AUTHENTICATION_REQUIRED'
                }
            });
        }

        // Convert single role to array for consistency
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        if (!roles.includes(req.user.role)) {
            securityLogger.logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
                ip: req.ip,
                user: req.user.username,
                currentRole: req.user.role,
                requiredRoles: roles,
                path: req.path,
                severity: 'medium'
            });

            return res.status(403).json({ 
                success: false,
                error: {
                    message: 'Insufficient permissions for this operation',
                    code: 'INSUFFICIENT_PERMISSIONS',
                    required: roles,
                    current: req.user.role
                }
            });
        }

        next();
    };
};

// Enhanced optional authentication middleware (doesn't fail if no token)
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = verifyToken(token);
        
        // Basic validation for optional auth
        if (decoded.username && decoded.role) {
            const user = getUserByUsername(decoded.username);
            if (user && user.role === decoded.role) {
                req.user = user;
                req.tokenIssued = new Date(decoded.iat * 1000);
                req.tokenExpires = new Date(decoded.exp * 1000);
            } else {
                req.user = null;
            }
        } else {
            req.user = null;
        }
    } catch (error) {
        // Silently fail for optional auth
        req.user = null;
    }

    next();
};

module.exports = authenticateToken;
module.exports.requireRole = requireRole;
module.exports.optionalAuth = optionalAuth;