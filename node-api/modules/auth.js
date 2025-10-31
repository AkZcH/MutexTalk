// Enhanced Authentication Module
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { enhanceJWTSecurity, sanitizeAndValidate, securityLogger } = require('./security');

// In-memory user store for MVP (as specified in requirements)
// In production, this would be replaced with a proper database
const users = new Map();

// Default admin user for testing
const initializeDefaultUsers = () => {
    if (users.size === 0) {
        // Create default admin user
        const adminPassword = bcrypt.hashSync('admin123', 10);
        users.set('admin', {
            username: 'admin',
            password: adminPassword,
            role: 'admin'
        });

        // Create default writer user
        const writerPassword = bcrypt.hashSync('writer123', 10);
        users.set('writer1', {
            username: 'writer1',
            password: writerPassword,
            role: 'writer'
        });

        // Create second writer user
        const writer2Password = bcrypt.hashSync('writer456', 10);
        users.set('writer2', {
            username: 'writer2',
            password: writer2Password,
            role: 'writer'
        });

        // Create default reader user
        const readerPassword = bcrypt.hashSync('reader123', 10);
        users.set('reader1', {
            username: 'reader1',
            password: readerPassword,
            role: 'reader'
        });

        console.log('Default users initialized: admin, writer1, writer2, reader1');
    }
};

// Initialize default users on module load
initializeDefaultUsers();

// Enhanced user registration with security validation
const registerUser = async (username, password, role = 'reader') => {
    if (!username || !password) {
        throw new Error('Username and password are required');
    }

    // Enhanced username validation
    if (!sanitizeAndValidate.isValidUsername(username)) {
        throw new Error('Username must be 3-50 characters and contain only letters, numbers, underscores, and hyphens');
    }

    // Enhanced password validation
    if (password.length < 6 || password.length > 128) {
        throw new Error('Password must be between 6 and 128 characters');
    }

    // Check password strength
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(password)) {
        throw new Error('Password must contain at least one letter and one number');
    }

    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'qwerty', 'admin', username];
    if (weakPasswords.some(weak => password.toLowerCase().includes(weak.toLowerCase()))) {
        throw new Error('Password is too weak. Please choose a stronger password');
    }

    if (!['reader', 'writer', 'admin'].includes(role)) {
        throw new Error('Invalid role. Must be reader, writer, or admin');
    }

    if (users.has(username)) {
        throw new Error('Username already exists');
    }

    // Use higher bcrypt rounds for better security
    const saltRounds = process.env.NODE_ENV === 'production' ? 12 : 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    const user = {
        username,
        password: hashedPassword,
        role,
        createdAt: new Date().toISOString(),
        lastLogin: null,
        loginAttempts: 0,
        lockedUntil: null
    };

    users.set(username, user);
    
    // Log user registration
    securityLogger.logSecurityEvent('USER_REGISTERED', {
        username: username,
        role: role,
        severity: 'low'
    });

    return { username, role };
};

// Enhanced user authentication with brute force protection
const authenticateUser = async (username, password) => {
    if (!username || !password) {
        throw new Error('Username and password are required');
    }

    const user = users.get(username);
    if (!user) {
        // Use consistent timing to prevent username enumeration
        await bcrypt.compare(password, '$2b$10$dummy.hash.to.prevent.timing.attacks');
        throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
        const lockTimeRemaining = Math.ceil((new Date(user.lockedUntil) - new Date()) / 1000 / 60);
        throw new Error(`Account locked. Try again in ${lockTimeRemaining} minutes`);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
        // Increment failed login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;
        
        // Lock account after 5 failed attempts
        if (user.loginAttempts >= 5) {
            user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
            securityLogger.logSecurityEvent('ACCOUNT_LOCKED', {
                username: username,
                attempts: user.loginAttempts,
                severity: 'high'
            });
        }
        
        users.set(username, user);
        throw new Error('Invalid credentials');
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date().toISOString();
    users.set(username, user);

    // Log successful login
    securityLogger.logSecurityEvent('USER_LOGIN', {
        username: username,
        role: user.role,
        severity: 'low'
    });

    return { username: user.username, role: user.role };
};

// Enhanced JWT token generation with security options
const generateToken = (user) => {
    const jwtSecurity = enhanceJWTSecurity();
    
    const payload = {
        username: user.username,
        role: user.role,
        iat: Math.floor(Date.now() / 1000), // Issued at
        jti: require('crypto').randomBytes(16).toString('hex') // JWT ID for tracking
    };

    const options = jwtSecurity.getJWTOptions();
    const secret = jwtSecurity.getJWTSecret();

    return jwt.sign(payload, secret, options);
};

// Enhanced JWT token verification with security checks
const verifyToken = (token) => {
    try {
        const jwtSecurity = enhanceJWTSecurity();
        const secret = jwtSecurity.getJWTSecret();
        const options = jwtSecurity.getJWTOptions();
        
        const decoded = jwt.verify(token, secret, {
            issuer: options.issuer,
            audience: options.audience,
            algorithms: [options.algorithm]
        });

        // Additional security validations
        if (!decoded.username || !decoded.role || !decoded.iat || !decoded.jti) {
            throw new jwt.JsonWebTokenError('Invalid token structure');
        }

        return decoded;
    } catch (error) {
        // Re-throw with original error types for proper handling
        throw error;
    }
};

// Get user by username
const getUserByUsername = (username) => {
    const user = users.get(username);
    if (!user) {
        return null;
    }
    // Return user without password
    return {
        username: user.username,
        role: user.role
    };
};

// Get all users (admin only)
const getAllUsers = () => {
    return Array.from(users.values()).map(user => ({
        username: user.username,
        role: user.role
    }));
};

module.exports = {
    registerUser,
    authenticateUser,
    generateToken,
    verifyToken,
    getUserByUsername,
    getAllUsers
};