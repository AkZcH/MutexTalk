// Binary Semaphore Chat API Server
const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');
const { getWebSocketManager } = require('./modules/websocket');
const {
    createRateLimiters,
    createSecurityHeaders,
    getHTTPSOptions,
    secureUnixSocket,
    createSecurityMiddleware
} = require('./modules/security');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTPS server if certificates are available, otherwise HTTP
const httpsOptions = getHTTPSOptions();
const server = httpsOptions ? https.createServer(httpsOptions, app) : http.createServer(app);

// Enhanced security headers
app.use(createSecurityHeaders());

// Security middleware
const securityMiddleware = createSecurityMiddleware();
app.use(securityMiddleware.requestLogger);
app.use(securityMiddleware.suspiciousActivityDetector);

// Enhanced CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'https://localhost:5173', 'http://localhost:5174', 'https://localhost:5174'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        } else {
            console.warn('CORS blocked origin:', origin);
            return callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-System-Status', 'X-Daemon-Connected'],
    maxAge: 86400 // 24 hours
}));

// Body parsing middleware with security limits
app.use(express.json({ 
    limit: '1mb', // Reduced from 10mb for security
    strict: true,
    type: 'application/json'
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '1mb',
    parameterLimit: 100 // Limit number of parameters
}));

// Enhanced error handling middleware
const { 
    handleCDaemonError, 
    gracefulDegradation,
    createErrorResponse,
    CDaemonError,
    asyncHandler
} = require('./modules/errorHandler');

// Enhanced rate limiting
const rateLimiters = createRateLimiters();
app.use(rateLimiters.speedLimiter); // Progressive delay
app.use(rateLimiters.generalLimiter); // General rate limiting

// Apply graceful degradation middleware
app.use(gracefulDegradation);

// JWT Authentication middleware (will be implemented in task 5.2)
// const authenticateToken = require('./middleware/auth');

const errorHandler = (err, req, res, next) => {
    // Enhanced structured logging
    console.error('API Error Handler:', {
        timestamp: new Date().toISOString(),
        error: {
            name: err.name,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        },
        request: {
            method: req.method,
            path: req.path,
            user: req.user?.username,
            ip: req.ip
        }
    });
    
    // C Daemon errors
    if (err.name === 'CDaemonError' || err.message?.includes('daemon')) {
        return handleCDaemonError(err, req, res, next);
    }
    
    // JWT and authentication errors
    if (err.name === 'JsonWebTokenError') {
        const jwtError = new CDaemonError('Invalid authentication token', 'INVALID_TOKEN', 401);
        return handleCDaemonError(jwtError, req, res, next);
    }
    if (err.name === 'TokenExpiredError') {
        const expiredError = new CDaemonError('Authentication token has expired', 'TOKEN_EXPIRED', 401);
        return handleCDaemonError(expiredError, req, res, next);
    }
    
    // JSON parsing errors
    if (err.type === 'entity.parse.failed') {
        const parseError = new CDaemonError('Invalid JSON format in request body', 'INVALID_JSON', 400);
        return handleCDaemonError(parseError, req, res, next);
    }
    
    // Request size errors
    if (err.type === 'entity.too.large') {
        const sizeError = new CDaemonError('Request payload too large', 'PAYLOAD_TOO_LARGE', 413);
        return handleCDaemonError(sizeError, req, res, next);
    }
    
    // Rate limiting errors
    if (err.status === 429) {
        const rateLimitError = new CDaemonError('Too many requests', 'RATE_LIMIT_EXCEEDED', 429, {
            retryable: true,
            retryAfter: err.retryAfter || 60
        });
        return handleCDaemonError(rateLimitError, req, res, next);
    }
    
    // Default error handling with consistent format
    const defaultError = new CDaemonError(
        err.message || 'Internal server error',
        'INTERNAL_ERROR',
        err.status || 500,
        process.env.NODE_ENV === 'development' ? { stack: err.stack } : null
    );
    
    handleCDaemonError(defaultError, req, res, next);
};

// Enhanced health check endpoint with daemon status
app.get('/health', async (req, res) => {
    try {
        const { performHealthCheck, getDaemonState } = require('./modules/errorHandler');
        const healthStatus = await performHealthCheck();
        const daemonState = getDaemonState();
        
        const response = {
            status: healthStatus.status,
            message: 'Chat API Server is running',
            timestamp: new Date().toISOString(),
            daemon: {
                connected: healthStatus.daemon === 'connected',
                degradedMode: daemonState.degradedMode,
                failureCount: daemonState.failureCount,
                lastFailure: daemonState.lastFailure
            },
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
        
        // Return 503 if daemon is in degraded mode
        const statusCode = daemonState.degradedMode ? 503 : 200;
        res.status(statusCode).json(response);
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: 'Health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API routes with specific rate limiting
app.use('/api/auth', rateLimiters.authLimiter); // Apply auth rate limiting to auth routes
app.use('/api/writer', rateLimiters.writerLimiter); // Apply writer rate limiting to writer routes

// Routes
app.use('/api/auth', require('./routes/auth')); // Task 5.2 - Implemented
app.use('/api/messages', require('./routes/messages')); // Task 6.1 & 6.2 - Implemented
app.use('/api/writer', require('./routes/writer')); // Task 7.1 - Implemented
app.use('/api/admin', require('./routes/admin')); // Task 8.1 - Implemented

// GET /api/status - Get current semaphore state (Task 7.2)
// Requirements: 4.1, 1.4
const authenticateToken = require('./middleware/auth');
const { requireRole } = require('./middleware/auth');

app.get('/api/status',
    authenticateToken,
    requireRole(['reader', 'writer', 'admin']),
    asyncHandler(async (req, res, next) => {
        try {
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) requesting semaphore status`);

            const { getBridge } = require('./modules/cbridge');
            const bridge = getBridge();
            const response = await bridge.getStatus();

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    data: {
                        semaphore: response.data.semaphore || 1, // 1 = available, 0 = locked
                        holder: response.data.holder || null,
                        writer_enabled: response.data.writer_enabled !== false, // Default to true if not specified
                        timestamp: response.data.timestamp || new Date().toISOString()
                    }
                });
            } else {
                throw new CDaemonError(
                    response.error || 'Failed to get semaphore status',
                    'STATUS_RETRIEVAL_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'get_status', user: username }
                );
            }
        } catch (error) {
            console.error('Error getting semaphore status:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize WebSocket server
const wsManager = getWebSocketManager();
wsManager.initialize(server);

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    wsManager.shutdown();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    wsManager.shutdown();
    process.exit(0);
});

// Security startup checks
const performSecurityChecks = () => {
    const checks = [];
    
    // Check JWT secret
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        checks.push('JWT_SECRET must be at least 32 characters long');
    }
    
    // Check if running in production with HTTPS
    if (process.env.NODE_ENV === 'production' && !httpsOptions) {
        checks.push('HTTPS certificates not found for production environment');
    }
    
    // Check daemon socket path security
    const socketPath = process.env.DAEMON_SOCKET_PATH || './data/daemon.sock';
    if (socketPath.includes('..') || socketPath.startsWith('/tmp/')) {
        checks.push('Daemon socket path may be insecure');
    }
    
    if (checks.length > 0) {
        console.warn('Security warnings:');
        checks.forEach(check => console.warn(`  - ${check}`));
    } else {
        console.log('Security checks passed');
    }
    
    return checks.length === 0;
};

server.listen(PORT, () => {
    const protocol = httpsOptions ? 'https' : 'http';
    const wsProtocol = httpsOptions ? 'wss' : 'ws';
    
    console.log(`Chat API Server running on ${protocol}://localhost:${PORT}`);
    console.log(`WebSocket server available at ${wsProtocol}://localhost:${PORT}/ws/status`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Perform security checks
    performSecurityChecks();
    
    // Log security configuration
    console.log('Security configuration:');
    console.log(`  - HTTPS: ${httpsOptions ? 'enabled' : 'disabled'}`);
    console.log(`  - Rate limiting: enabled`);
    console.log(`  - Security headers: enabled`);
    console.log(`  - CORS: configured`);
    console.log(`  - JWT validation: enhanced`);
});

module.exports = app;