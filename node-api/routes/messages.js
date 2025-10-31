// Message Routes - Task 6.1 & 6.2
const express = require('express');
const { body, query, param } = require('express-validator');
const authenticateToken = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { getBridge } = require('../modules/cbridge');
const { 
    asyncHandler, 
    validateAndSanitizeInput,
    CDaemonError
} = require('../modules/errorHandler');
const { getWebSocketManager } = require('../modules/websocket');

const router = express.Router();

// GET /api/messages - List messages with pagination (accessible to readers and writers)
// Requirements: 5.3, 5.5, 4.1, 4.3
router.get('/', 
    authenticateToken,
    requireRole(['reader', 'writer', 'admin']),
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
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;

            console.log(`User ${req.user.username} (${req.user.role}) requesting messages - page: ${page}, limit: ${limit}`);

            const bridge = getBridge();
            const response = await bridge.listMessages(page, limit);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    data: {
                        messages: response.data.messages || [],
                        pagination: {
                            page: page,
                            limit: limit,
                            total: response.data.total || 0,
                            hasMore: response.data.hasMore || false
                        }
                    }
                });
            } else {
                // Handle C daemon error with enhanced context
                throw new CDaemonError(
                    response.error || 'Failed to retrieve messages',
                    'MESSAGE_RETRIEVAL_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'list_messages' }
                );
            }
        } catch (error) {
            console.error('Error retrieving messages:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// POST /api/messages - Create new message (writer only)
// Requirements: 6.3, 6.4, 6.2
router.post('/',
    authenticateToken,
    requireRole(['writer', 'admin']),
    [
        body('message')
            .notEmpty()
            .withMessage('Message content is required')
            .isLength({ min: 1, max: 2000 })
            .withMessage('Message must be between 1 and 2000 characters')
            .trim()
            .escape() // Prevent XSS
    ],
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const { message } = req.body;
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) creating message`);

            const bridge = getBridge();
            const response = await bridge.createMessage(username, message);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                const messageData = {
                    id: response.data.id,
                    message: message,
                    username: username,
                    timestamp: response.data.timestamp
                };
                
                // Broadcast message creation to WebSocket clients
                const wsManager = getWebSocketManager();
                wsManager.broadcastMessageCreated(messageData);
                
                res.status(201).json({
                    success: true,
                    data: messageData
                });
            } else {
                // Handle specific C daemon errors with enhanced error types
                if (response.error && response.error.includes('semaphore')) {
                    throw new CDaemonError(
                        'You must acquire the writer semaphore before creating messages',
                        'SEMAPHORE_NOT_HELD',
                        409,
                        { operation: 'create_message', user: username }
                    );
                }
                
                throw new CDaemonError(
                    response.error || 'Failed to create message',
                    'MESSAGE_CREATION_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'create_message' }
                );
            }
        } catch (error) {
            console.error('Error creating message:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// PUT /api/messages/:id - Update message (writer only)
// Requirements: 6.3, 6.4, 6.2
router.put('/:id',
    authenticateToken,
    requireRole(['writer', 'admin']),
    [
        param('id')
            .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
            .withMessage('Message ID must be a positive integer'),
        body('message')
            .notEmpty()
            .withMessage('Message content is required')
            .isLength({ min: 1, max: 2000 })
            .withMessage('Message must be between 1 and 2000 characters')
            .trim()
            .escape() // Prevent XSS
    ],
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const messageId = parseInt(req.params.id);
            const { message } = req.body;
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) updating message ${messageId}`);

            const bridge = getBridge();
            const response = await bridge.updateMessage(username, messageId, message);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    data: {
                        id: messageId,
                        message: message,
                        username: username,
                        timestamp: response.data.timestamp
                    }
                });
            } else {
                // Handle specific C daemon errors with enhanced error types
                if (response.error && response.error.includes('semaphore')) {
                    throw new CDaemonError(
                        'You must acquire the writer semaphore before updating messages',
                        'SEMAPHORE_NOT_HELD',
                        409,
                        { operation: 'update_message', messageId, user: username }
                    );
                }
                
                if (response.error && response.error.includes('not found')) {
                    throw new CDaemonError(
                        `Message with ID ${messageId} does not exist`,
                        'MESSAGE_NOT_FOUND',
                        404,
                        { messageId, operation: 'update_message' }
                    );
                }
                
                if (response.error && response.error.includes('permission')) {
                    throw new CDaemonError(
                        'You can only update your own messages',
                        'INSUFFICIENT_PERMISSIONS',
                        403,
                        { messageId, user: username, operation: 'update_message' }
                    );
                }
                
                throw new CDaemonError(
                    response.error || 'Failed to update message',
                    'MESSAGE_UPDATE_FAILED',
                    500,
                    { daemonStatus: response.status, messageId, operation: 'update_message' }
                );
            }
        } catch (error) {
            console.error('Error updating message:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// DELETE /api/messages/:id - Delete message (writer only)
// Requirements: 6.3, 6.4, 6.2
router.delete('/:id',
    authenticateToken,
    requireRole(['writer', 'admin']),
    [
        param('id')
            .isInt({ min: 1, max: Number.MAX_SAFE_INTEGER })
            .withMessage('Message ID must be a positive integer')
    ],
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const messageId = parseInt(req.params.id);
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) deleting message ${messageId}`);

            const bridge = getBridge();
            const response = await bridge.deleteMessage(username, messageId);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                res.json({
                    success: true,
                    message: `Message ${messageId} deleted successfully`
                });
            } else {
                // Handle specific C daemon errors with enhanced error types
                if (response.error && response.error.includes('semaphore')) {
                    throw new CDaemonError(
                        'You must acquire the writer semaphore before deleting messages',
                        'SEMAPHORE_NOT_HELD',
                        409,
                        { operation: 'delete_message', messageId, user: username }
                    );
                }
                
                if (response.error && response.error.includes('not found')) {
                    throw new CDaemonError(
                        `Message with ID ${messageId} does not exist`,
                        'MESSAGE_NOT_FOUND',
                        404,
                        { messageId, operation: 'delete_message' }
                    );
                }
                
                if (response.error && response.error.includes('permission')) {
                    throw new CDaemonError(
                        'You can only delete your own messages',
                        'INSUFFICIENT_PERMISSIONS',
                        403,
                        { messageId, user: username, operation: 'delete_message' }
                    );
                }
                
                throw new CDaemonError(
                    response.error || 'Failed to delete message',
                    'MESSAGE_DELETE_FAILED',
                    500,
                    { daemonStatus: response.status, messageId, operation: 'delete_message' }
                );
            }
        } catch (error) {
            console.error('Error deleting message:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

module.exports = router;