// Writer Routes - Task 7.1 & 7.2
const express = require('express');
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

// POST /api/writer/request - Request semaphore acquisition
// Requirements: 6.1, 6.5, 1.2, 1.3
router.post('/request',
    authenticateToken,
    requireRole(['writer', 'admin']),
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) requesting writer semaphore`);

            const bridge = getBridge();
            const response = await bridge.tryAcquireWriter(username);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                // Broadcast writer acquisition to WebSocket clients
                const wsManager = getWebSocketManager();
                wsManager.broadcastWriterChanged('acquired', username);
                
                res.json({
                    success: true,
                    message: 'Writer semaphore acquired successfully',
                    data: {
                        holder: username,
                        semaphore: 0, // 0 indicates locked/acquired
                        timestamp: response.data?.timestamp || new Date().toISOString()
                    }
                });
            } else {
                // Handle specific C daemon errors with enhanced error types
                if (response.error && (response.error.includes('unavailable') || response.error.includes('locked'))) {
                    throw new CDaemonError(
                        'Another writer currently holds the semaphore',
                        'SEMAPHORE_UNAVAILABLE',
                        409,
                        { 
                            operation: 'acquire_semaphore',
                            currentHolder: response.data?.holder || 'unknown',
                            retryable: true
                        }
                    );
                }
                
                if (response.error && response.error.includes('disabled')) {
                    throw new CDaemonError(
                        'Writer access has been disabled by an administrator',
                        'WRITER_ACCESS_DISABLED',
                        403,
                        { operation: 'acquire_semaphore', user: username }
                    );
                }
                
                throw new CDaemonError(
                    response.error || 'Failed to acquire writer semaphore',
                    'SEMAPHORE_ACQUISITION_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'acquire_semaphore' }
                );
            }
        } catch (error) {
            console.error('Error requesting writer semaphore:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

// POST /api/writer/release - Release semaphore
// Requirements: 6.1, 6.5, 1.2, 1.3
router.post('/release',
    authenticateToken,
    requireRole(['writer', 'admin']),
    validateAndSanitizeInput(),
    asyncHandler(async (req, res, next) => {
        try {
            const username = req.user.username;

            console.log(`User ${username} (${req.user.role}) releasing writer semaphore`);

            const bridge = getBridge();
            const response = await bridge.releaseWriter(username);

            // Map C daemon response to HTTP response
            if (response.status === 'OK') {
                // Broadcast writer release to WebSocket clients
                const wsManager = getWebSocketManager();
                wsManager.broadcastWriterChanged('released', username);
                
                res.json({
                    success: true,
                    message: 'Writer semaphore released successfully',
                    data: {
                        semaphore: 1, // 1 indicates available/released
                        timestamp: response.data?.timestamp || new Date().toISOString()
                    }
                });
            } else {
                // Handle specific C daemon errors with enhanced error types
                if (response.error && response.error.includes('not held')) {
                    throw new CDaemonError(
                        'You do not currently hold the writer semaphore',
                        'SEMAPHORE_NOT_HELD',
                        409,
                        { operation: 'release_semaphore', user: username }
                    );
                }
                
                if (response.error && response.error.includes('permission')) {
                    throw new CDaemonError(
                        'You can only release a semaphore that you hold',
                        'INSUFFICIENT_PERMISSIONS',
                        403,
                        { operation: 'release_semaphore', user: username }
                    );
                }
                
                throw new CDaemonError(
                    response.error || 'Failed to release writer semaphore',
                    'SEMAPHORE_RELEASE_FAILED',
                    500,
                    { daemonStatus: response.status, operation: 'release_semaphore' }
                );
            }
        } catch (error) {
            console.error('Error releasing writer semaphore:', error.message);
            throw error; // Let asyncHandler catch and pass to error middleware
        }
    })
);

module.exports = router;