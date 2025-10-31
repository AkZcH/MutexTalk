// Security Configuration and Hardening Module
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

// Enhanced rate limiting configurations
const createRateLimiters = () => {
    // General API rate limiting
    const generalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: {
            success: false,
            error: {
                message: 'Too many requests from this IP, please try again later.',
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: 900 // 15 minutes in seconds
            }
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            console.warn('Rate limit exceeded:', {
                ip: req.ip,
                path: req.path,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            res.status(429).json({
                success: false,
                error: {
                    message: 'Too many requests from this IP, please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: 900
                }
            });
        }
    });

    // Strict authentication rate limiting (brute force protection)
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // limit each IP to 5 auth requests per windowMs
        skipSuccessfulRequests: true, // Don't count successful requests
        message: {
            success: false,
            error: {
                message: 'Too many authentication attempts, please try again later.',
                code: 'AUTH_RATE_LIMIT_EXCEEDED',
                retryAfter: 900
            }
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            console.warn('Auth rate limit exceeded:', {
                ip: req.ip,
                path: req.path,
                username: req.body?.username,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            res.status(429).json({
                success: false,
                error: {
                    message: 'Too many authentication attempts, please try again later.',
                    code: 'AUTH_RATE_LIMIT_EXCEEDED',
                    retryAfter: 900
                }
            });
        }
    });

    // Writer operation rate limiting (more permissive for semaphore operations)
    const writerLimiter = rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 50, // limit each IP to 50 writer requests per minute (increased from 10)
        skipSuccessfulRequests: true, // Don't count successful semaphore operations
        message: {
            success: false,
            error: {
                message: 'Too many writer requests, please try again later.',
                code: 'WRITER_RATE_LIMIT_EXCEEDED',
                retryAfter: 60
            }
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            console.warn('Writer rate limit exceeded:', {
                ip: req.ip,
                path: req.path,
                user: req.user?.username,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            res.status(429).json({
                success: false,
                error: {
                    message: 'Too many writer requests, please try again later.',
                    code: 'WRITER_RATE_LIMIT_EXCEEDED',
                    retryAfter: 60
                }
            });
        }
    });

    // Progressive delay for repeated requests (slow down)
    const speedLimiter = slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 50, // allow 50 requests per windowMs without delay
        delayMs: () => 500, // Fixed for express-slow-down v2 - constant 500ms delay
        maxDelayMs: 20000, // maximum delay of 20 seconds
        skipFailedRequests: false,
        skipSuccessfulRequests: false,
        validate: {
            delayMs: false // Disable the warning message
        }
    });

    return {
        generalLimiter,
        authLimiter,
        writerLimiter,
        speedLimiter
    };
};

// Enhanced Helmet security configuration
const createSecurityHeaders = () => {
    return helmet({
        // Content Security Policy
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for development
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
            },
        },
        // HTTP Strict Transport Security (HSTS)
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        // X-Frame-Options
        frameguard: {
            action: 'deny'
        },
        // X-Content-Type-Options
        noSniff: true,
        // X-XSS-Protection
        xssFilter: true,
        // Referrer Policy
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },
        // Hide X-Powered-By header
        hidePoweredBy: true,
        // DNS Prefetch Control
        dnsPrefetchControl: {
            allow: false
        },
        // Expect-CT
        expectCt: {
            maxAge: 86400, // 24 hours
            enforce: process.env.NODE_ENV === 'production'
        }
    });
};

// HTTPS configuration for production
const getHTTPSOptions = () => {
    if (process.env.NODE_ENV !== 'production') {
        return null;
    }

    const certPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/chat-api.crt';
    const keyPath = process.env.SSL_KEY_PATH || '/etc/ssl/private/chat-api.key';

    try {
        if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            return {
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath)
            };
        }
    } catch (error) {
        console.error('Failed to load SSL certificates:', error.message);
    }

    return null;
};

// JWT token validation enhancement
const enhanceJWTSecurity = () => {
    // JWT secret rotation capability
    const getJWTSecret = () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters long');
        }
        return secret;
    };

    // JWT options with enhanced security
    const getJWTOptions = () => {
        return {
            algorithm: 'HS256',
            expiresIn: process.env.JWT_EXPIRES_IN || '1h',
            issuer: process.env.JWT_ISSUER || 'chat-api',
            audience: process.env.JWT_AUDIENCE || 'chat-users',
            notBefore: '0s' // Token is valid immediately
        };
    };

    return {
        getJWTSecret,
        getJWTOptions
    };
};

// Unix socket security configuration
const secureUnixSocket = (socketPath) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Ensure socket directory exists with proper permissions
        const socketDir = path.dirname(socketPath);
        if (!fs.existsSync(socketDir)) {
            fs.mkdirSync(socketDir, { recursive: true, mode: 0o750 });
        }

        // Set socket file permissions after creation
        if (fs.existsSync(socketPath)) {
            fs.chmodSync(socketPath, 0o660); // rw-rw----
            console.log(`Secured Unix socket permissions: ${socketPath}`);
        }

        return true;
    } catch (error) {
        console.error('Failed to secure Unix socket:', error.message);
        return false;
    }
};

// Input sanitization and validation utilities
const sanitizeAndValidate = {
    // Sanitize HTML to prevent XSS
    sanitizeHTML: (input) => {
        if (typeof input !== 'string') return '';
        return input
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
    },

    // Validate and sanitize file paths
    sanitizePath: (input) => {
        if (typeof input !== 'string') return '';
        return path.normalize(input)
            .replace(/\.\./g, '') // Remove directory traversal
            .replace(/[<>:"|?*]/g, '') // Remove invalid filename characters
            .trim();
    },

    // Validate IP address
    isValidIP: (ip) => {
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip);
    },

    // Validate username format
    isValidUsername: (username) => {
        if (typeof username !== 'string') return false;
        return /^[a-zA-Z0-9_-]{3,50}$/.test(username);
    },

    // Check for common SQL injection patterns
    containsSQLInjection: (input) => {
        if (typeof input !== 'string') return false;
        const sqlPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
            /(--|\/\*|\*\/|;|'|")/,
            /(\bOR\b|\bAND\b).*?[=<>]/i
        ];
        return sqlPatterns.some(pattern => pattern.test(input));
    }
};

// Security monitoring and logging
const securityLogger = {
    logSecurityEvent: (event, details) => {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'SECURITY',
            event: event,
            details: details,
            severity: details.severity || 'medium'
        };

        console.warn('Security Event:', JSON.stringify(logEntry));

        // In production, this could be sent to a security monitoring system
        if (process.env.NODE_ENV === 'production') {
            // TODO: Send to security monitoring service
        }
    },

    logFailedAuth: (req, reason) => {
        securityLogger.logSecurityEvent('FAILED_AUTHENTICATION', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            reason: reason,
            username: req.body?.username,
            severity: 'high'
        });
    },

    logSuspiciousActivity: (req, activity) => {
        securityLogger.logSecurityEvent('SUSPICIOUS_ACTIVITY', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            activity: activity,
            severity: 'high'
        });
    },

    logRateLimitExceeded: (req) => {
        securityLogger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            path: req.path,
            severity: 'medium'
        });
    }
};

// Security middleware factory
const createSecurityMiddleware = () => {
    return {
        // Check for suspicious patterns in requests
        suspiciousActivityDetector: (req, res, next) => {
            const userAgent = req.get('User-Agent') || '';
            const path = req.path;
            const body = JSON.stringify(req.body || {});

            // Check for common attack patterns
            if (sanitizeAndValidate.containsSQLInjection(body) ||
                sanitizeAndValidate.containsSQLInjection(path)) {
                securityLogger.logSuspiciousActivity(req, 'SQL_INJECTION_ATTEMPT');
                return res.status(400).json({
                    success: false,
                    error: {
                        message: 'Invalid request format',
                        code: 'INVALID_REQUEST'
                    }
                });
            }

            // Check for bot/scanner user agents
            const suspiciousAgents = ['sqlmap', 'nikto', 'nmap', 'masscan', 'zap'];
            if (suspiciousAgents.some(agent => userAgent.toLowerCase().includes(agent))) {
                securityLogger.logSuspiciousActivity(req, 'SUSPICIOUS_USER_AGENT');
                return res.status(403).json({
                    success: false,
                    error: {
                        message: 'Access denied',
                        code: 'ACCESS_DENIED'
                    }
                });
            }

            next();
        },

        // Enhanced request logging
        requestLogger: (req, res, next) => {
            const start = Date.now();
            
            res.on('finish', () => {
                const duration = Date.now() - start;
                const logData = {
                    timestamp: new Date().toISOString(),
                    method: req.method,
                    path: req.path,
                    statusCode: res.statusCode,
                    duration: duration,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    user: req.user?.username || 'anonymous'
                };

                // Log security-relevant requests
                if (res.statusCode >= 400 || req.path.includes('auth') || req.path.includes('admin')) {
                    console.log('Security Request:', JSON.stringify(logData));
                }
            });

            next();
        }
    };
};

module.exports = {
    createRateLimiters,
    createSecurityHeaders,
    getHTTPSOptions,
    enhanceJWTSecurity,
    secureUnixSocket,
    sanitizeAndValidate,
    securityLogger,
    createSecurityMiddleware
};