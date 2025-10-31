// Authentication Routes
const express = require('express');
const { body } = require('express-validator');
const { 
    registerUser, 
    authenticateUser, 
    generateToken, 
    getAllUsers 
} = require('../modules/auth');
const authenticateToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const { validateAndSanitizeInput, asyncHandler, CDaemonError } = require('../modules/errorHandler');

// Enhanced input validation rules
const loginValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Username must be between 3 and 50 characters')
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Username can only contain letters, numbers, underscores, and hyphens')
        .escape(), // Prevent XSS
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters')
        .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one letter and one number')
];

const signupValidation = [
    ...loginValidation,
    body('role')
        .optional()
        .isIn(['reader', 'writer', 'admin'])
        .withMessage('Role must be reader, writer, or admin')
        .escape()
];

// POST /api/login - User authentication
router.post('/login', loginValidation, validateAndSanitizeInput(), asyncHandler(async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Authenticate user
        const user = await authenticateUser(username, password);
        
        // Generate JWT token
        const token = generateToken(user);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                username: user.username,
                role: user.role
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        throw new CDaemonError(
            error.message || 'Authentication failed',
            'AUTHENTICATION_FAILED',
            401,
            { operation: 'login', username: req.body.username }
        );
    }
}));

// POST /api/signup - User registration
router.post('/signup', signupValidation, validateAndSanitizeInput(), asyncHandler(async (req, res) => {
    try {
        const { username, password, role = 'reader' } = req.body;
        
        // Register new user
        const user = await registerUser(username, password, role);
        
        // Generate JWT token for immediate login
        const token = generateToken(user);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                username: user.username,
                role: user.role
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        throw new CDaemonError(
            error.message || 'User registration failed',
            'REGISTRATION_FAILED',
            400,
            { operation: 'signup', username: req.body.username, role: req.body.role }
        );
    }
}));

// GET /api/me - Get current user info
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        success: true,
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

// GET /api/users - Get all users (admin only)
router.get('/users', authenticateToken, requireRole('admin'), asyncHandler(async (req, res) => {
    try {
        const users = getAllUsers();
        res.json({ 
            success: true,
            users,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        throw new CDaemonError(
            error.message || 'Failed to retrieve users',
            'USER_RETRIEVAL_FAILED',
            500,
            { operation: 'get_users', admin: req.user.username }
        );
    }
}));

// POST /api/logout - Logout (client-side token removal)
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
    try {
        const username = req.user.username;
        
        // If user is a writer, try to release any held semaphore
        if (req.user.role === 'writer' || req.user.role === 'admin') {
            try {
                const { getBridge } = require('../modules/cbridge');
                const bridge = getBridge();
                await bridge.releaseWriter(username);
                console.log(`Released semaphore for logging out user: ${username}`);
            } catch (error) {
                // Don't fail logout if semaphore release fails
                console.warn(`Failed to release semaphore for ${username} during logout:`, error.message);
            }
        }
        
        // Since we're using stateless JWT tokens, logout is handled client-side
        // by removing the token from storage
        res.json({ 
            success: true,
            message: 'Logout successful',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        throw new CDaemonError(
            error.message || 'Logout failed',
            'LOGOUT_FAILED',
            500,
            { operation: 'logout', username: req.user.username }
        );
    }
}));

module.exports = router;