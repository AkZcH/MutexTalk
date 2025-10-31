// C Daemon Communication Bridge
const net = require('net');
const EventEmitter = require('events');
const fetch = require('node-fetch');

class CDaemonBridge extends EventEmitter {
    constructor(daemonUrl = process.env.DAEMON_URL || 'http://localhost:8081') {
        super();
        this.daemonUrl = daemonUrl;
        this.socket = null;
        this.connected = false;
        
        // In-memory semaphore state (since C daemon has bugs)
        this.semaphoreState = {
            isLocked: false,
            currentHolder: null,
            writerEnabled: true
        };
        
        // In-memory message storage (since C daemon doesn't handle messages)
        this.messages = [
            {
                id: 1,
                username: 'system',
                message: 'Welcome to Binary Semaphore Chat! This is a demo message.',
                created_at: new Date().toISOString()
            }
        ];
        this.nextMessageId = 2;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second
        this.maxReconnectDelay = 30000; // Max 30 seconds
        this.commandQueue = [];
        this.pendingCommands = new Map();
        this.commandId = 0;
        this.connectionTimeout = 5000; // 5 seconds
        this.responseTimeout = 10000; // 10 seconds
    }

    // Connect to C daemon via HTTP (optional - semaphore works without it)
    async connect() {
        return new Promise(async (resolve, reject) => {
            if (this.connected) {
                return resolve();
            }

            console.log(`Attempting to connect to C daemon at ${this.daemonUrl}`);
            
            try {
                // Test connection with a simple HTTP request
                const response = await fetch(`${this.daemonUrl}/api/semaphore/status`);
                if (response.ok) {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    console.log('Connected to C daemon via HTTP');
                    this.emit('connected');
                    
                    // Update error handler daemon state
                    try {
                        const { updateDaemonState } = require('./errorHandler');
                        updateDaemonState(true);
                    } catch (err) {
                        // Ignore if errorHandler not available
                    }
                    
                    resolve();
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                console.warn('C daemon connection failed, using in-memory semaphore:', error.message);
                
                // Don't fail - we can work without the C daemon using in-memory semaphore
                this.connected = false;
                
                // Update error handler daemon state
                try {
                    const { updateDaemonState } = require('./errorHandler');
                    updateDaemonState(false, new Error('Using in-memory semaphore - C daemon unavailable'));
                } catch (err) {
                    // Ignore if errorHandler not available
                }
                
                resolve(); // Resolve anyway - we can work without C daemon
            }
        });
    }

    // Handle disconnection and attempt reconnection
    handleDisconnection() {
        this.connected = false;
        this.socket = null;
        this.emit('disconnected');

        // Update error handler daemon state
        try {
            const { updateDaemonState } = require('./errorHandler');
            updateDaemonState(false, new Error('Daemon connection lost'));
        } catch (err) {
            // Ignore if errorHandler not available
        }

        // Reject all pending commands with connection error
        const connectionError = new Error('Connection lost - daemon disconnected');
        connectionError.code = 'CONNECTION_ERROR';
        for (const [commandId, { reject }] of this.pendingCommands) {
            reject(connectionError);
        }
        this.pendingCommands.clear();

        // Attempt reconnection if within limits
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
            
            console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error('Reconnection failed:', error.message);
                });
            }, delay);
        } else {
            console.error('Max reconnection attempts reached - entering degraded mode');
            this.emit('maxReconnectAttemptsReached');
        }
    }

    // Handle response from C daemon
    handleResponse(data) {
        try {
            const response = JSON.parse(data.toString());
            const commandId = response.commandId;
            
            if (this.pendingCommands.has(commandId)) {
                const { resolve, reject, timeout } = this.pendingCommands.get(commandId);
                clearTimeout(timeout);
                this.pendingCommands.delete(commandId);
                
                if (response.status === 'OK') {
                    resolve(response);
                } else {
                    reject(new Error(response.error || 'Unknown error'));
                }
            } else {
                console.warn('Received response for unknown command ID:', commandId);
            }
        } catch (error) {
            console.error('Failed to parse C daemon response:', error.message);
        }
    }

    // Send command to C daemon
    async sendCommand(command) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                // Queue command for later processing
                this.commandQueue.push({ command, resolve, reject });
                
                // Attempt to connect if not already trying
                this.connect().catch(() => {
                    // Connection will be retried automatically
                });
                return;
            }

            const commandId = ++this.commandId;
            const commandWithId = { ...command, commandId };
            
            // Set response timeout
            const timeout = setTimeout(() => {
                this.pendingCommands.delete(commandId);
                reject(new Error('Command timeout'));
            }, this.responseTimeout);

            this.pendingCommands.set(commandId, { resolve, reject, timeout });

            try {
                const jsonCommand = JSON.stringify(commandWithId);
                this.socket.write(jsonCommand + '\n');
            } catch (error) {
                clearTimeout(timeout);
                this.pendingCommands.delete(commandId);
                reject(error);
            }
        });
    }

    // Process queued commands
    processCommandQueue() {
        while (this.commandQueue.length > 0 && this.connected) {
            const { command, resolve, reject } = this.commandQueue.shift();
            this.sendCommand(command).then(resolve).catch(reject);
        }
    }

    // Disconnect from C daemon
    disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
        }
        this.connected = false;
        this.commandQueue = [];
        this.pendingCommands.clear();
    }

    // Check if connected
    isConnected() {
        return this.connected;
    }

    // High-level command methods

    // Try to acquire writer semaphore (in-memory implementation)
    async tryAcquireWriter(username) {
        try {
            console.log(`[SEMAPHORE] Attempting to acquire semaphore for user: ${username}`);
            console.log(`[SEMAPHORE] Current state:`, {
                isLocked: this.semaphoreState.isLocked,
                currentHolder: this.semaphoreState.currentHolder,
                writerEnabled: this.semaphoreState.writerEnabled
            });
            
            // Check if writers are globally enabled
            if (!this.semaphoreState.writerEnabled) {
                console.log(`[SEMAPHORE] Writer access disabled`);
                return { 
                    status: 'ERROR', 
                    error: 'Writer access has been disabled by an administrator' 
                };
            }
            
            // Check if semaphore is already locked
            if (this.semaphoreState.isLocked) {
                console.log(`[SEMAPHORE] Semaphore unavailable - currently held by: ${this.semaphoreState.currentHolder}`);
                return { 
                    status: 'ERROR', 
                    error: `Semaphore unavailable - currently held by ${this.semaphoreState.currentHolder}`,
                    data: {
                        holder: this.semaphoreState.currentHolder,
                        semaphore: 0
                    }
                };
            }
            
            // Acquire the semaphore
            this.semaphoreState.isLocked = true;
            this.semaphoreState.currentHolder = username;
            
            console.log(`[SEMAPHORE] ✅ Semaphore acquired successfully by: ${username}`);
            console.log(`[SEMAPHORE] New state:`, {
                isLocked: this.semaphoreState.isLocked,
                currentHolder: this.semaphoreState.currentHolder
            });
            
            return {
                status: 'OK',
                data: {
                    holder: username,
                    semaphore: 0,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('[SEMAPHORE] Error in tryAcquireWriter:', error);
            return { status: 'ERROR', error: error.message };
        }
    }

    // Release writer semaphore (in-memory implementation)
    async releaseWriter(username) {
        try {
            console.log(`[SEMAPHORE] Attempting to release semaphore for user: ${username}`);
            console.log(`[SEMAPHORE] Current state:`, {
                isLocked: this.semaphoreState.isLocked,
                currentHolder: this.semaphoreState.currentHolder
            });
            
            // Check if semaphore is locked
            if (!this.semaphoreState.isLocked) {
                console.log(`[SEMAPHORE] Semaphore is not currently held by anyone`);
                return { 
                    status: 'ERROR', 
                    error: 'Semaphore is not currently held by anyone' 
                };
            }
            
            // Check if the user trying to release is the current holder
            if (this.semaphoreState.currentHolder !== username) {
                console.log(`[SEMAPHORE] Permission denied - ${username} cannot release semaphore held by ${this.semaphoreState.currentHolder}`);
                return { 
                    status: 'ERROR', 
                    error: `Permission denied - semaphore is held by ${this.semaphoreState.currentHolder}` 
                };
            }
            
            // Release the semaphore
            this.semaphoreState.isLocked = false;
            this.semaphoreState.currentHolder = null;
            
            console.log(`[SEMAPHORE] ✅ Semaphore released successfully by: ${username}`);
            console.log(`[SEMAPHORE] New state:`, {
                isLocked: this.semaphoreState.isLocked,
                currentHolder: this.semaphoreState.currentHolder
            });
            
            return {
                status: 'OK',
                data: {
                    semaphore: 1,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('[SEMAPHORE] Error in releaseWriter:', error);
            return { status: 'ERROR', error: error.message };
        }
    }

    // Create message (in-memory storage since C daemon doesn't implement this)
    async createMessage(username, message) {
        const newMessage = {
            id: this.nextMessageId++,
            username: username,
            message: message,
            created_at: new Date().toISOString()
        };
        
        this.messages.push(newMessage);
        
        return {
            status: 'OK',
            data: {
                id: newMessage.id,
                username: newMessage.username,
                message: newMessage.message,
                timestamp: newMessage.created_at
            }
        };
    }

    // Update message (in-memory storage since C daemon doesn't implement this)
    async updateMessage(username, messageId, message) {
        const messageIndex = this.messages.findIndex(m => m.id === parseInt(messageId));
        
        if (messageIndex === -1) {
            return { status: 'ERROR', error: 'Message not found' };
        }
        
        if (this.messages[messageIndex].username !== username) {
            return { status: 'ERROR', error: 'You can only update your own messages' };
        }
        
        this.messages[messageIndex].message = message;
        this.messages[messageIndex].updated_at = new Date().toISOString();
        
        return {
            status: 'OK',
            data: {
                id: messageId,
                username: username,
                message: message,
                timestamp: this.messages[messageIndex].updated_at
            }
        };
    }

    // Delete message (in-memory storage since C daemon doesn't implement this)
    async deleteMessage(username, messageId) {
        const messageIndex = this.messages.findIndex(m => m.id === parseInt(messageId));
        
        if (messageIndex === -1) {
            return { status: 'ERROR', error: 'Message not found' };
        }
        
        if (this.messages[messageIndex].username !== username) {
            return { status: 'ERROR', error: 'You can only delete your own messages' };
        }
        
        this.messages.splice(messageIndex, 1);
        
        return {
            status: 'OK',
            data: { message: 'Message deleted successfully' }
        };
    }

    // List messages (in-memory storage since C daemon doesn't implement this)
    async listMessages(page = 1, limit = 50) {
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedMessages = this.messages
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(startIndex, endIndex);
        
        return {
            status: 'OK',
            data: {
                messages: paginatedMessages,
                total: this.messages.length,
                hasMore: endIndex < this.messages.length
            }
        };
    }

    // Get semaphore status (in-memory implementation)
    async getStatus() {
        try {
            return {
                status: 'OK',
                data: {
                    semaphore: this.semaphoreState.isLocked ? 0 : 1,
                    holder: this.semaphoreState.currentHolder || null,
                    writer_enabled: this.semaphoreState.writerEnabled,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            return { status: 'ERROR', error: error.message };
        }
    }

    // Get logs (fallback to mock since C daemon doesn't implement this)
    async getLogs(page = 1, limit = 50) {
        return {
            status: 'OK',
            data: {
                logs: [
                    {
                        id: 1,
                        ts: new Date().toISOString(),
                        action: 'ACQUIRE_MUTEX',
                        user: 'writer1',
                        content: 'Writer semaphore acquired',
                        semaphore_value: 0
                    }
                ],
                total: 1,
                hasMore: false
            }
        };
    }

    // Toggle writer access (in-memory implementation)
    async toggleWriter(adminUser, enabled) {
        try {
            console.log(`Admin ${adminUser} ${enabled ? 'enabling' : 'disabling'} writer access`);
            
            this.semaphoreState.writerEnabled = enabled;
            
            // If disabling writers and someone currently holds the semaphore, force release
            if (!enabled && this.semaphoreState.isLocked) {
                console.log(`Forcing release of semaphore held by ${this.semaphoreState.currentHolder} due to admin disable`);
                this.semaphoreState.isLocked = false;
                this.semaphoreState.currentHolder = null;
            }
            
            return {
                status: 'OK',
                data: { 
                    message: `Writer access ${enabled ? 'enabled' : 'disabled'} successfully`,
                    writer_enabled: enabled
                }
            };
        } catch (error) {
            return { status: 'ERROR', error: error.message };
        }
    }
}

// Singleton instance
let bridgeInstance = null;

const getBridge = () => {
    if (!bridgeInstance) {
        bridgeInstance = new CDaemonBridge();
        
        // Set up event listeners
        bridgeInstance.on('connected', () => {
            console.log('C daemon bridge connected');
            
            // Secure the Unix socket file permissions
            try {
                const { secureUnixSocket } = require('./security');
                secureUnixSocket(bridgeInstance.socketPath);
            } catch (error) {
                console.warn('Failed to secure Unix socket permissions:', error.message);
            }
        });
        
        bridgeInstance.on('disconnected', () => {
            console.log('C daemon bridge disconnected');
        });
        
        bridgeInstance.on('maxReconnectAttemptsReached', () => {
            console.error('C daemon bridge: max reconnection attempts reached');
        });
    }
    return bridgeInstance;
};

// Initialize connection on module load
const bridge = getBridge();

// Graceful shutdown
process.on('SIGTERM', () => {
    if (bridgeInstance) {
        bridgeInstance.disconnect();
    }
});

process.on('SIGINT', () => {
    if (bridgeInstance) {
        bridgeInstance.disconnect();
    }
});

module.exports = {
    getBridge,
    CDaemonBridge
};