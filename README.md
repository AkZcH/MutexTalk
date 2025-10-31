# Binary Semaphore Chat Backend

A full-stack chat application backend demonstrating Operating System synchronization techniques using a binary semaphore (mutex) for controlling concurrent write access to a shared chat database.

## Architecture

The system consists of two main components:

1. **C Core Daemon** - Low-level backend service managing concurrency, database operations, and transaction logging
2. **Node.js API Layer** - HTTP/WebSocket service providing web endpoints and bridging frontend requests

## Project Structure

```
binary-semaphore-chat-backend/
├── c-daemon/                 # C daemon implementation
│   ├── src/                  # Source files
│   │   └── main.c           # Main entry point
│   ├── include/             # Header files
│   │   ├── semaphore.h      # Binary semaphore manager
│   │   ├── db.h             # Database operations
│   │   ├── logger.h         # Transaction logging
│   │   └── handlers.h       # JSON command handling
│   └── Makefile             # Build configuration
├── node-api/                # Node.js API layer
│   ├── server.js            # Express server entry point
│   ├── routes/              # API route handlers
│   │   └── auth.js          # Authentication routes
│   ├── modules/             # Utility modules
│   │   ├── auth.js          # JWT authentication
│   │   └── cbridge.js       # C daemon communication
│   ├── package.json         # Node.js dependencies
│   ├── .env                 # Environment configuration
│   └── .env.example         # Environment template
├── config/                  # System configuration
│   └── config.json          # Main configuration file
├── scripts/                 # Setup and deployment scripts
│   ├── setup.sh             # Initial system setup
│   ├── install-services.sh  # Systemd service installation
│   └── init-db.sh           # Database initialization
└── README.md                # This file
```

## Quick Start

### Prerequisites

- Linux system with systemd
- GCC compiler
- SQLite3 development libraries
- cJSON library
- Node.js (v16+)
- npm

### Installation

1. **Install dependencies:**
   ```bash
   sudo apt-get update
   sudo apt-get install build-essential libsqlite3-dev libcjson-dev pkg-config nodejs npm
   ```

2. **Run setup script:**
   ```bash
   chmod +x scripts/setup.sh
   sudo ./scripts/setup.sh
   ```

3. **Install systemd services:**
   ```bash
   chmod +x scripts/install-services.sh
   sudo ./scripts/install-services.sh
   ```

4. **Initialize databases:**
   ```bash
   chmod +x scripts/init-db.sh
   sudo ./scripts/init-db.sh
   ```

5. **Start services:**
   ```bash
   sudo systemctl start chat-daemon
   sudo systemctl start chat-api
   ```

### Development

#### Building C Daemon

```bash
cd c-daemon
make clean
make debug  # Build with debug symbols
```

#### Running Node.js API in Development

```bash
cd node-api
npm install
npm run dev  # Uses nodemon for auto-restart
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - API server port (default: 3000)
- `JWT_SECRET` - JWT signing secret
- `DAEMON_SOCKET_PATH` - Unix socket path for C daemon communication

### System Configuration

Edit `config/config.json` for system-wide settings:

- Database paths
- Socket permissions
- Security settings
- Rate limiting

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration

### Messages
- `GET /api/messages` - List messages (all users)
- `POST /api/messages` - Create message (writers only)
- `PUT /api/messages/:id` - Update message (writers only)
- `DELETE /api/messages/:id` - Delete message (writers only)

### Writer Operations
- `POST /api/writer/request` - Request semaphore
- `POST /api/writer/release` - Release semaphore
- `GET /api/status` - Get semaphore status

### Admin Operations
- `GET /api/logs` - View transaction logs
- `POST /api/admin/toggle-writer` - Enable/disable writers

### WebSocket
- `ws://localhost:3000/ws/status` - Real-time status updates

## User Roles

- **Reader** - Can view messages only
- **Writer** - Can acquire semaphore and perform CRUD operations
- **Admin** - Can view logs and control system settings

## Binary Semaphore Logic

The system implements a binary semaphore using `pthread_mutex_t`:

1. Only one writer can hold the semaphore at a time
2. Writers must acquire the semaphore before any CRUD operations
3. Readers can access messages without the semaphore
4. All operations are logged for audit purposes
5. Admins can globally enable/disable writer access

## Logging

All operations are logged to:
- SQLite logs database (`/var/lib/chat-system/logs.db`)
- Plaintext transaction log (`/var/log/chat-system/transactions.log`)

Log entries include timestamp, action, user, content, and semaphore state.

## Security Features

- JWT-based authentication
- Role-based access control
- Rate limiting
- Input validation
- Prepared SQL statements
- Secure file permissions
- HTTPS support (production)

## Monitoring

Check service status:
```bash
sudo systemctl status chat-daemon chat-api
```

View logs:
```bash
sudo journalctl -u chat-daemon -f
sudo journalctl -u chat-api -f
```

## Development Status

This project is implemented incrementally following the task list in `.kiro/specs/binary-semaphore-chat-backend/tasks.md`. Current implementation includes basic project structure and build system setup.

## License

MIT License