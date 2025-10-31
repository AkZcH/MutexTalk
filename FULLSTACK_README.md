# Binary Semaphore Chat System - Full Stack

A complete chat application demonstrating binary semaphore synchronization with a C daemon backend, Node.js API, and React frontend.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Frontend│    │   Node.js API   │    │   C Daemon      │
│   (Port 5173)   │◄──►│   (Port 3000)   │◄──►│   (Unix Socket) │
│                 │    │                 │    │                 │
│ - Authentication│    │ - JWT Auth      │    │ - Semaphore Mgmt│
│ - Real-time UI  │    │ - Rate Limiting │    │ - SQLite DB     │
│ - Role-based    │    │ - WebSocket     │    │ - Transaction   │
│   Access        │    │ - CORS          │    │   Logging       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Features

### 🔐 **Authentication & Authorization**
- JWT-based authentication
- Role-based access control (Reader, Writer, Admin)
- Secure password validation
- Session management

### 🔒 **Binary Semaphore System**
- Only one writer can access the system at a time
- Real-time semaphore status updates
- Admin controls for enabling/disabling writer access
- Automatic cleanup on disconnection

### 💬 **Chat Functionality**
- **Readers**: View messages in real-time
- **Writers**: Create, update, and delete messages (when holding semaphore)
- **Admins**: Full system control and transaction log access
- Real-time updates via WebSocket

### 📊 **Admin Dashboard**
- System status monitoring
- Transaction log viewing
- Writer access toggle
- Real-time system metrics

### 🛡️ **Security Features**
- Rate limiting and brute force protection
- Input validation and sanitization
- CORS configuration
- Secure headers
- SQL injection prevention

## Quick Start

### Prerequisites
- **Node.js** 16+ and npm
- **C Compiler** (GCC/MinGW)
- **SQLite3** development libraries
- **cJSON** library

### 1. Backend Setup

```bash
# Install and start the backend
./setup-dev.sh  # Linux/Mac
# OR
setup-dev.bat   # Windows

# Start C daemon (Terminal 1)
cd c-daemon
make && ./bin/chat_daemon

# Start Node.js API (Terminal 2)
cd node-api
npm start
```

### 2. Frontend Setup

```bash
# Install and start frontend (Terminal 3)
cd frontend
npm install
npm run dev
```

### 3. Access the Application

Open your browser to: **http://localhost:5173**

## User Guide

### Getting Started

1. **Sign Up**: Create an account with username, password, and role
2. **Login**: Authenticate with your credentials
3. **Select Mode**: Choose your interaction mode based on your role

### Roles & Permissions

#### 👁️ **Reader**
- View all chat messages
- Real-time message updates
- No editing capabilities

#### ✏️ **Writer**
- All reader permissions
- Request writer semaphore
- Create, edit, and delete messages (when holding semaphore)
- Release semaphore when done

#### 🛡️ **Admin**
- All writer permissions
- View transaction logs
- Toggle writer access globally
- System status monitoring

### Using the System

#### As a Reader:
1. Login and select "Reader" mode
2. View messages in real-time
3. Use refresh button to manually update

#### As a Writer:
1. Login and select "Writer" mode
2. System automatically requests semaphore
3. If successful, create/edit messages
4. Click "Release & Back" when finished

#### As an Admin:
1. Login and select "Admin" mode
2. Monitor system status in real-time
3. View transaction logs
4. Toggle writer access as needed

## API Documentation

### Authentication Endpoints

```bash
# Sign up
POST /api/auth/signup
{
  "username": "string",
  "password": "string", 
  "role": "reader|writer|admin"
}

# Login
POST /api/auth/login
{
  "username": "string",
  "password": "string"
}

# Logout
POST /api/auth/logout
```

### Message Endpoints

```bash
# Get messages (all roles)
GET /api/messages?page=1&limit=50

# Create message (writer/admin only)
POST /api/messages
{
  "message": "string"
}

# Update message (writer/admin only)
PUT /api/messages/:id
{
  "message": "string"
}

# Delete message (writer/admin only)
DELETE /api/messages/:id
```

### Writer Semaphore Endpoints

```bash
# Request semaphore (writer/admin only)
POST /api/writer/request

# Release semaphore (writer/admin only)
POST /api/writer/release
```

### System Status

```bash
# Get system status (all authenticated users)
GET /api/status
```

### Admin Endpoints

```bash
# Get transaction logs (admin only)
GET /api/admin/logs?page=1&limit=50

# Toggle writer access (admin only)
POST /api/admin/toggle-writer
```

### WebSocket

```bash
# Real-time updates
WS /ws/status
```

## Development

### Project Structure

```
├── c-daemon/           # C daemon source code
│   ├── src/           # Source files
│   ├── include/       # Header files
│   └── Makefile       # Build configuration
├── node-api/          # Node.js API server
│   ├── routes/        # API route handlers
│   ├── modules/       # Core modules
│   ├── middleware/    # Authentication middleware
│   └── tests/         # Test files
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/     # Page components
│   │   ├── lib/       # API client
│   │   └── hooks/     # Custom hooks
│   └── public/        # Static assets
├── config/            # Configuration files
├── scripts/           # Installation scripts
└── systemd/           # Service configurations
```

### Building from Source

```bash
# Build C daemon
cd c-daemon
make clean && make

# Install Node.js dependencies
cd node-api
npm install

# Build frontend
cd frontend
npm install && npm run build
```

### Running Tests

```bash
# Backend tests
cd node-api
npm test

# Frontend tests (if available)
cd frontend
npm test
```

## Production Deployment

### Linux Production Setup

```bash
# Complete installation
sudo ./scripts/install.sh
sudo ./scripts/init-db.sh
sudo ./scripts/create-config.sh

# Start services
sudo systemctl start chat-system.target
sudo systemctl enable chat-system.target
```

### Configuration

Edit `/opt/chat-system/config/.env`:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secure-secret-here
CORS_ORIGIN=https://your-domain.com
```

### Monitoring

```bash
# Check service status
sudo systemctl status chat-system.target

# View logs
sudo journalctl -u chat-daemon -u chat-api -f

# Health check
curl http://localhost:3000/health
```

## Troubleshooting

### Common Issues

#### Frontend can't connect to backend
- Ensure backend is running on port 3000
- Check CORS configuration
- Verify proxy settings in vite.config.ts

#### Writer semaphore issues
- Check if another writer is active
- Verify user has writer role
- Check if admin has disabled writer access

#### Database errors
- Ensure SQLite files have correct permissions
- Check disk space
- Verify database integrity

#### Authentication failures
- Check JWT secret configuration
- Verify user credentials
- Check token expiration

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
export NODE_ENV=development

# Start with verbose output
cd node-api && npm run dev
cd c-daemon && ./bin/chat_daemon --verbose
```

### Performance Monitoring

```bash
# Monitor system resources
htop
iotop

# Check database performance
sqlite3 data/chat.db ".stats"

# Monitor API performance
curl -w "@curl-format.txt" http://localhost:3000/api/status
```

## Security Considerations

- Change default JWT secrets before production
- Use HTTPS in production environments
- Regularly update dependencies
- Monitor for suspicious activity
- Implement proper backup procedures
- Review and audit user permissions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
1. Check this README and DEPLOYMENT.md
2. Review the troubleshooting section
3. Check logs for error messages
4. Create an issue with detailed information

---

**Binary Semaphore Chat System** - Demonstrating synchronization concepts with modern web technologies.