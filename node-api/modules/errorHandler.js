// Error Handler for C Daemon Communication
class CDaemonError extends Error {
    constructor(message, code = 'UNKNOWN', statusCode = 500, details = null) {
        super(message);
        this.name = 'CDaemonError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

// Enhanced C daemon error code mapping based on design document
const C_DAEMON_ERROR_CODES = {
    0: { status: 200, code: 'SUCCESS', message: 'Operation successful' },
    [-1]: { status: 500, code: 'GENERAL_ERROR', message: 'Internal server error' },
    [-2]: { status: 403, code: 'PERMISSION_DENIED', message: 'Permission denied' },
    [-3]: { status: 409, code: 'RESOURCE_UNAVAILABLE', message: 'Resource unavailable' },
    [-4]: { status: 400, code: 'INVALID_INPUT', message: 'Invalid input' },
    [-5]: { status: 500, code: 'DATABASE_ERROR', message: 'Database error' }
};

// Map C daemon error messages and codes to HTTP status codes
const mapCDaemonError = (error) => {
    const message = error.message || error;
    const daemonCode = error.daemonCode || error.code;
    
    // First try to map by daemon error code if available
    if (daemonCode && C_DAEMON_ERROR_CODES[daemonCode]) {
        const mapping = C_DAEMON_ERROR_CODES[daemonCode];
        return new CDaemonError(
            message || mapping.message,
            mapping.code,
            mapping.status,
            { daemonCode, originalMessage: message }
        );
    }
    
    // Connection and communication errors
    if (message.includes('Connection timeout') || 
        message.includes('Connection lost') || 
        message.includes('ENOENT') ||
        message.includes('ECONNREFUSED') ||
        message.includes('socket') ||
        message.includes('EPIPE')) {
        return new CDaemonError(
            'Service temporarily unavailable - daemon connection failed',
            'CONNECTION_ERROR',
            503,
            { originalError: message, retryable: true }
        );
    }
    
    // Command timeout
    if (message.includes('Command timeout') || message.includes('timeout')) {
        return new CDaemonError(
            'Request timeout - daemon did not respond in time',
            'TIMEOUT',
            408,
            { originalError: message, retryable: true }
        );
    }
    
    // Permission and authorization errors
    if (message.includes('Permission denied') || 
        message.includes('Insufficient permissions') ||
        message.includes('Not authorized') ||
        message.includes('Forbidden') ||
        message.includes('not held') ||
        message.includes('ownership')) {
        return new CDaemonError(
            'Permission denied',
            'PERMISSION_DENIED',
            403,
            { originalError: message }
        );
    }
    
    // Resource unavailable (semaphore locked)
    if (message.includes('Resource unavailable') || 
        message.includes('Semaphore locked') ||
        message.includes('Writer already active') ||
        message.includes('unavailable') ||
        message.includes('locked') ||
        message.includes('busy')) {
        return new CDaemonError(
            'Resource unavailable - semaphore is currently locked',
            'RESOURCE_UNAVAILABLE',
            409,
            { originalError: message, retryable: true }
        );
    }
    
    // Writer access disabled
    if (message.includes('disabled') || message.includes('Writer access')) {
        return new CDaemonError(
            'Writer access has been disabled by administrator',
            'WRITER_DISABLED',
            403,
            { originalError: message }
        );
    }
    
    // Invalid input and validation errors
    if (message.includes('Invalid input') || 
        message.includes('Validation failed') ||
        message.includes('Bad request') ||
        message.includes('invalid') ||
        message.includes('malformed')) {
        return new CDaemonError(
            'Invalid input provided',
            'INVALID_INPUT',
            400,
            { originalError: message }
        );
    }
    
    // Database errors
    if (message.includes('Database error') || 
        message.includes('SQL error') ||
        message.includes('Constraint violation') ||
        message.includes('database') ||
        message.includes('sqlite')) {
        return new CDaemonError(
            'Database operation failed',
            'DATABASE_ERROR',
            500,
            { originalError: message }
        );
    }
    
    // Not found errors
    if (message.includes('Not found') || 
        message.includes('Message not found') ||
        message.includes('User not found') ||
        message.includes('not found') ||
        message.includes('does not exist')) {
        return new CDaemonError(
            'Resource not found',
            'NOT_FOUND',
            404,
            { originalError: message }
        );
    }
    
    // JSON parsing errors
    if (message.includes('JSON') || message.includes('parse')) {
        return new CDaemonError(
            'Invalid JSON format',
            'INVALID_JSON',
            400,
            { originalError: message }
        );
    }
    
    // Default to internal server error
    return new CDaemonError(
        message || 'Internal server error',
        'INTERNAL_ERROR',
        500,
        { originalError: message }
    );
};

// Graceful degradation state management
let daemonConnectionState = {
    isConnected: true,
    lastFailure: null,
    failureCount: 0,
    degradedMode: false
};

// Update daemon connection state
const updateDaemonState = (connected, error = null) => {
    daemonConnectionState.isConnected = connected;
    if (!connected) {
        daemonConnectionState.lastFailure = new Date().toISOString();
        daemonConnectionState.failureCount++;
        daemonConnectionState.degradedMode = daemonConnectionState.failureCount >= 3;
    } else {
        daemonConnectionState.failureCount = 0;
        daemonConnectionState.degradedMode = false;
    }
};

// Get current daemon state
const getDaemonState = () => ({ ...daemonConnectionState });

// Create consistent error response format
const createErrorResponse = (error, req) => {
    const mappedError = mapCDaemonError(error);
    
    const response = {
        success: false,
        error: {
            message: mappedError.message,
            code: mappedError.code,
            timestamp: mappedError.timestamp
        },
        request: {
            method: req.method,
            path: req.path,
            user: req.user?.username || 'anonymous'
        }
    };
    
    // Add details for development environment
    if (process.env.NODE_ENV === 'development' && mappedError.details) {
        response.error.details = mappedError.details;
    }
    
    // Add retry information for retryable errors
    if (mappedError.details?.retryable) {
        response.error.retryable = true;
        response.error.retryAfter = 5; // seconds
    }
    
    // Add degraded mode information
    if (daemonConnectionState.degradedMode) {
        response.system = {
            status: 'degraded',
            message: 'System is operating in degraded mode due to daemon connectivity issues'
        };
    }
    
    return { response, statusCode: mappedError.statusCode };
};

// Enhanced Express error handler middleware for C daemon errors
const handleCDaemonError = (error, req, res, next) => {
    // Update daemon state if this is a connection error
    if (error.code === 'CONNECTION_ERROR' || error.message?.includes('connection')) {
        updateDaemonState(false, error);
    }
    
    const { response, statusCode } = createErrorResponse(error, req);
    
    // Enhanced logging with structured format
    console.error('API Error:', {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        type: 'C_DAEMON_ERROR',
        error: {
            message: error.message,
            code: error.code,
            statusCode: statusCode,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        },
        request: {
            method: req.method,
            path: req.path,
            query: req.query,
            user: req.user?.username,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        },
        daemon: {
            connected: daemonConnectionState.isConnected,
            degradedMode: daemonConnectionState.degradedMode,
            failureCount: daemonConnectionState.failureCount
        }
    });
    
    res.status(statusCode).json(response);
};

// Input validation and sanitization utilities
const sanitizeInput = {
    // Sanitize string input
    string: (input, maxLength = 2000) => {
        if (typeof input !== 'string') return '';
        return input.trim().slice(0, maxLength);
    },
    
    // Sanitize integer input
    integer: (input, min = 1, max = Number.MAX_SAFE_INTEGER) => {
        const num = parseInt(input);
        if (isNaN(num)) return min;
        return Math.max(min, Math.min(max, num));
    },
    
    // Sanitize boolean input
    boolean: (input) => {
        if (typeof input === 'boolean') return input;
        if (typeof input === 'string') {
            return input.toLowerCase() === 'true';
        }
        return Boolean(input);
    },
    
    // Sanitize username (alphanumeric, underscore, hyphen only)
    username: (input) => {
        if (typeof input !== 'string') return '';
        return input.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
    }
};

// Enhanced input validation middleware
const validateAndSanitizeInput = (validationRules = []) => {
    return (req, res, next) => {
        const { validationResult } = require('express-validator');
        
        // Run express-validator validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const validationError = new CDaemonError(
                'Input validation failed',
                'VALIDATION_ERROR',
                400,
                { validationErrors: errors.array() }
            );
            return handleCDaemonError(validationError, req, res, next);
        }
        
        // Additional sanitization
        if (req.body) {
            if (req.body.message) {
                req.body.message = sanitizeInput.string(req.body.message, 2000);
            }
            if (req.body.username) {
                req.body.username = sanitizeInput.username(req.body.username);
            }
        }
        
        if (req.query) {
            if (req.query.page) {
                req.query.page = sanitizeInput.integer(req.query.page, 1, 1000);
            }
            if (req.query.limit) {
                req.query.limit = sanitizeInput.integer(req.query.limit, 1, 100);
            }
        }
        
        if (req.params) {
            if (req.params.id) {
                req.params.id = sanitizeInput.integer(req.params.id, 1);
            }
        }
        
        next();
    };
};

// Graceful degradation middleware
const gracefulDegradation = (req, res, next) => {
    // Add degraded mode headers
    if (daemonConnectionState.degradedMode) {
        res.set('X-System-Status', 'degraded');
        res.set('X-Daemon-Connected', 'false');
    } else {
        res.set('X-System-Status', 'normal');
        res.set('X-Daemon-Connected', daemonConnectionState.isConnected.toString());
    }
    
    // For read-only operations, provide cached/fallback responses if daemon is down
    if (!daemonConnectionState.isConnected && req.method === 'GET') {
        // This could be enhanced to serve cached data
        console.warn('Daemon disconnected - serving degraded response for GET request');
    }
    
    next();
};

// Async wrapper for route handlers with enhanced error handling
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next))
            .catch(error => {
                // Enhance error with request context
                if (!error.requestContext) {
                    error.requestContext = {
                        method: req.method,
                        path: req.path,
                        user: req.user?.username
                    };
                }
                next(error);
            });
    };
};

// Health check utility
const performHealthCheck = async () => {
    try {
        const { getBridge } = require('./cbridge');
        const bridge = getBridge();
        
        if (!bridge.isConnected()) {
            throw new Error('Daemon not connected');
        }
        
        // Try a simple status check
        await bridge.getStatus();
        updateDaemonState(true);
        
        return {
            status: 'healthy',
            daemon: 'connected',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        updateDaemonState(false, error);
        return {
            status: 'unhealthy',
            daemon: 'disconnected',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
};

module.exports = {
    CDaemonError,
    mapCDaemonError,
    handleCDaemonError,
    asyncHandler,
    validateAndSanitizeInput,
    gracefulDegradation,
    sanitizeInput,
    updateDaemonState,
    getDaemonState,
    performHealthCheck,
    createErrorResponse
};