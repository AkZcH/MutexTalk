// Admin Routes - Task 8.1
const express = require('express');
const { body, query } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { getBridge } = require('../modules/cbridge');
const { 
    asyncHandler, 
    validateAndSanitizeInput,
    CDaemonError
} = require('../modules/errorHandler');

const router = express.Router();

// GET /api/admin/logs - View transaction logs with pagination
// Requirements: 7.1, 7.4, 5.4
router.get('/logs',
    authenticateToken,
    requireRole(['admin']),
    [
        query('page')
            .optional()
            .isInt({ min: 1, max: 1000 })
            .withMessage('Page must be between 1 and 1000'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const username = req.user.username;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;

            console.log(`Admin ${username} requesting logs (page: ${page}, limit: ${limit})`);

            const bridge = getBridge();
            const response = await bridge.getLogs(page, limit);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    data: {
                        logs: response.data.logs || [],
                        pagination: {
                            page: page,
                            limit: limit,
                            total: response.data.total || 0,
                            hasMore: response.data.hasMore || false
                        },
                        timestamp: response.data.timestamp || new Date().toISOString()
                    }
                });
            } else {
                throw new CDaemonError(
                    response.error || 'Failed to retrieve logs',
                    'LOG_RETRIEVAL_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'get_logs', admin: username }
                );
            }
        } catch (error) {
            console.error('Error retrieving logs:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// POST /api/admin/toggle-writer - Enable/disable global writer access
// Requirements: 7.2, 7.5, 9.2
router.post('/toggle-writer',
    authenticateToken,
    requireRole(['admin']),
    [
        body('enabled')
            .isBoolean()
            .withMessage('enabled must be a boolean value')
    ],
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const username = req.user.username;
            const { enabled } = req.body;

            console.log(`Admin ${username} ${enabled ? 'enabling' : 'disabling'} writer access`);

            const bridge = getBridge();
            const response = await bridge.toggleWriter(username, enabled);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    message: `Writer access ${enabled ? 'enabled' : 'disabled'} successfully`,
                    data: {
                        writer_enabled: enabled,
                        admin_user: username,
                        timestamp: response.data?.timestamp || new Date().toISOString()
                    }
                });
            } else {
                throw new CDaemonError(
                    response.error || 'Failed to toggle writer access',
                    'WRITER_TOGGLE_FAILED',
                    500,
                    { 
                        daemonStatus: response.status, 
                        operation: 'toggle_writer', 
                        admin: username,
                        enabled: enabled
                    }
                );
            }
        } catch (error) {
            console.error('Error toggling writer access:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

module.exports = router;