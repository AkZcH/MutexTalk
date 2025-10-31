// WebSocket Server for Real-time Updates - Task 8.2
const WebSocket = require('ws');
const { verifyToken, getUserByUsername } = require('./auth');
const { getBridge } = require('./cbridge');

class WebSocketManager {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // Map of client ID to client info
        this.statusPollingInterval = null;
        this.pollingIntervalMs = 2000; // Poll every 2 seconds
        this.lastKnownStatus = null;
    }

    // Initialize WebSocket server
    initialize(server) {
        this.wss = new WebSocket.Server({ 
            server,
            path: '/ws/status',
            verifyClient: this.verifyClient.bind(this)
        });

        this.wss.on('connection', this.handleConnection.bind(this));
        this.startStatusPolling();

        console.log('WebSocket server initialized at /ws/status');
    }

    // Verify client authentication
    verifyClient(info) {
        try {
            const url = new URL(info.req.url, 'http://localhost');
            const token = url.searchParams.get('token');
            
            if (!token) {
                console.log('WebSocket connection rejected: No token provided');
                return false;
            }

            const decoded = verifyToken(token);
            const user = getUserByUsername(decoded.username);
            
            if (!user) {
                console.log('WebSocket connection rejected: User not found');
                return false;
            }

            // Store user info for later use
            info.req.user = user;
            return true;
        } catch (error) {
            console.log('WebSocket connection rejected:', error.message);
            return false;
        }
    }

    // Handle new WebSocket connection
    handleConnection(ws, req) {
        const user = req.user;
        const clientId = this.generateClientId();
        
        console.log(`WebSocket client connected: ${user.username} (${user.role}) - ID: ${clientId}`);

        // Store client info
        this.clients.set(clientId, {
            ws,
            user,
            connectedAt: new Date(),
            lastPing: new Date()
        });

        // Send current status immediately
        this.sendStatusToClient(clientId);

        // Handle client messages
        ws.on('message', (message) => {
            this.handleClientMessage(clientId, message);
        });

        // Handle client disconnect
        ws.on('close', () => {
            console.log(`WebSocket client disconnected: ${user.username} - ID: ${clientId}`);
            this.clients.delete(clientId);
        });

        // Handle client errors
        ws.on('error', (error) => {
            console.error(`WebSocket client error (${clientId}):`, error.message);
            this.clients.delete(clientId);
        });

        // Set up ping/pong for connection health
        ws.on('pong', () => {
            const client = this.clients.get(clientId);
            if (client) {
                client.lastPing = new Date();
            }
        });

        // Send initial ping
        ws.ping();
    }

    // Handle messages from clients
    handleClientMessage(clientId, message) {
        try {
            const client = this.clients.get(clientId);
            if (!client) return;

            const data = JSON.parse(message.toString());
            
            switch (data.type) {
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                    
                case 'request_status':
                    this.sendStatusToClient(clientId);
                    break;
                    
                default:
                    console.log(`Unknown message type from client ${clientId}:`, data.type);
            }
        } catch (error) {
            console.error(`Error handling client message (${clientId}):`, error.message);
        }
    }

    // Send message to specific client
    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(data));
            } catch (error) {
                console.error(`Error sending to client ${clientId}:`, error.message);
                this.clients.delete(clientId);
            }
        }
    }

    // Send current semaphore status to specific client
    async sendStatusToClient(clientId) {
        try {
            const bridge = getBridge();
            const response = await bridge.getStatus();
            
            if (response.status === 'OK') {
                const statusData = {
                    type: 'semaphore_status',
                    data: {
                        semaphore: response.data.semaphore || 1,
                        holder: response.data.holder || null,
                        writer_enabled: response.data.writer_enabled !== false,
                        timestamp: response.data.timestamp || new Date().toISOString()
                    }
                };
                
                this.sendToClient(clientId, statusData);
            }
        } catch (error) {
            console.error(`Error getting status for client ${clientId}:`, error.message);
            this.sendToClient(clientId, {
                type: 'error',
                message: 'Failed to get semaphore status'
            });
        }
    }

    // Broadcast message to all connected clients
    broadcast(data) {
        const message = JSON.stringify(data);
        let sentCount = 0;
        
        for (const [clientId, client] of this.clients) {
            if (client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(message);
                    sentCount++;
                } catch (error) {
                    console.error(`Error broadcasting to client ${clientId}:`, error.message);
                    this.clients.delete(clientId);
                }
            } else {
                // Clean up closed connections
                this.clients.delete(clientId);
            }
        }
        
        return sentCount;
    }

    // Start periodic status polling
    startStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
        }

        this.statusPollingInterval = setInterval(async () => {
            try {
                // Only poll if we have connected clients
                if (this.clients.size === 0) return;

                const bridge = getBridge();
                if (!bridge.isConnected()) return;

                const response = await bridge.getStatus();
                
                if (response.status === 'OK') {
                    const currentStatus = {
                        semaphore: response.data.semaphore || 1,
                        holder: response.data.holder || null,
                        writer_enabled: response.data.writer_enabled !== false,
                        timestamp: response.data.timestamp || new Date().toISOString()
                    };

                    // Check if status has changed
                    if (this.hasStatusChanged(currentStatus)) {
                        console.log('Semaphore status changed, broadcasting to clients');
                        
                        const broadcastData = {
                            type: 'semaphore_status',
                            data: currentStatus
                        };
                        
                        const sentCount = this.broadcast(broadcastData);
                        console.log(`Status broadcast sent to ${sentCount} clients`);
                        
                        this.lastKnownStatus = currentStatus;
                    }
                }
            } catch (error) {
                console.error('Error during status polling:', error.message);
            }
        }, this.pollingIntervalMs);

        console.log(`Status polling started (interval: ${this.pollingIntervalMs}ms)`);
    }

    // Check if status has changed since last broadcast
    hasStatusChanged(currentStatus) {
        if (!this.lastKnownStatus) {
            return true;
        }

        return (
            this.lastKnownStatus.semaphore !== currentStatus.semaphore ||
            this.lastKnownStatus.holder !== currentStatus.holder ||
            this.lastKnownStatus.writer_enabled !== currentStatus.writer_enabled
        );
    }

    // Stop status polling
    stopStatusPolling() {
        if (this.statusPollingInterval) {
            clearInterval(this.statusPollingInterval);
            this.statusPollingInterval = null;
            console.log('Status polling stopped');
        }
    }

    // Generate unique client ID
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Get connected clients info
    getClientsInfo() {
        const clients = [];
        for (const [clientId, client] of this.clients) {
            clients.push({
                id: clientId,
                username: client.user.username,
                role: client.user.role,
                connectedAt: client.connectedAt,
                lastPing: client.lastPing
            });
        }
        return clients;
    }

    // Broadcast message creation event
    broadcastMessageCreated(messageData) {
        const broadcastData = {
            type: 'message_created',
            data: messageData
        };
        
        const sentCount = this.broadcast(broadcastData);
        console.log(`Message creation broadcast sent to ${sentCount} clients`);
    }

    // Broadcast writer change event
    broadcastWriterChanged(eventType, username) {
        const broadcastData = {
            type: 'writer_changed',
            data: {
                event: eventType, // 'acquired' or 'released'
                username: username,
                timestamp: new Date().toISOString()
            }
        };
        
        const sentCount = this.broadcast(broadcastData);
        console.log(`Writer change broadcast (${eventType}) sent to ${sentCount} clients`);
    }

    // Graceful shutdown
    shutdown() {
        console.log('Shutting down WebSocket server...');
        
        this.stopStatusPolling();
        
        // Close all client connections
        for (const [clientId, client] of this.clients) {
            try {
                client.ws.close(1001, 'Server shutting down');
            } catch (error) {
                console.error(`Error closing client ${clientId}:`, error.message);
            }
        }
        
        this.clients.clear();
        
        if (this.wss) {
            this.wss.close(() => {
                console.log('WebSocket server closed');
            });
        }
    }
}

// Singleton instance
let wsManager = null;

const getWebSocketManager = () => {
    if (!wsManager) {
        wsManager = new WebSocketManager();
    }
    return wsManager;
};

module.exports = {
    getWebSocketManager,
    WebSocketManager
};