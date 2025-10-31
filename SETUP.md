# Binary Semaphore Chat System - Development Setup

This document provides instructions for setting up the Binary Semaphore Chat System for development.

## Project Structure

```
chat-system/
├── c-daemon/           # C core daemon
│   ├── src/           # C source files
│   ├── include/       # C header files
│   ├── obj/           # Compiled object files
│   ├── bin/           # Compiled binaries
│   ├── Makefile       # Build configuration
│   └── build.bat      # Windows build script
├── node-api/          # Node.js API layer
│   ├── routes/        # Express route handlers
│   ├── modules/       # Core modules (auth, cbridge)
│   ├── middleware/    # Express middleware
│   ├── package.json   # Node.js dependencies
│   └── server.js      # Main server file
├── config/            # Configuration files
│   ├── config.json    # Production configuration
│   └── config.dev.json # Development configuration
├── data/              # Development databases
├── logs/              # Development log files
└── scripts/           # Setup and deployment scripts
```

## Prerequisites

### For C Daemon Development

#### Linux/macOS
```bash
# Install build tools
sudo apt-get install build-essential  # Ubuntu/Debian
# or
brew install gcc                       # macOS

# Install required libraries
sudo apt-get install libsqlite3-dev libcjson-dev  # Ubuntu/Debian
# or
brew install sqlite3 cjson                         # macOS
```

#### Windows
1. Install MinGW-w64 or Visual Studio with C++ support
2. Install vcpkg package manager (recommended)
3. Install required libraries:
   ```cmd
   vcpkg install sqlite3 cjson
   ```

### For Node.js API Development
- Node.js 16.0.0 or higher
- npm (comes with Node.js)

## Quick Setup

### Automated Setup

#### Linux/macOS
```bash
chmod +x setup-dev.sh
./setup-dev.sh
```

#### Windows
```cmd
setup-dev.bat
```

### Manual Setup

1. **Create directories:**
   ```bash
   mkdir -p data logs c-daemon/obj c-daemon/bin node-api/middleware
   ```

2. **Install Node.js dependencies:**
   ```bash
   cd node-api
   npm install
   cd ..
   ```

3. **Build C daemon:**
   ```bash
   # Linux/macOS
   cd c-daemon
   make setup-dev  # Creates data/logs directories
   make            # Builds the daemon
   
   # Windows
   cd c-daemon
   build.bat
   ```

## Configuration

### Development Configuration
- C daemon uses local paths: `./data/` and `./logs/`
- Node.js API configured in `node-api/.env`
- Development config: `config/config.dev.json`

### Production Configuration
- System paths: `/var/lib/chat-system/`, `/var/log/chat-system/`
- Production config: `config/config.json`

## Running the System

### Development Mode

1. **Start C daemon:**
   ```bash
   cd c-daemon
   ./bin/chat_daemon    # Linux/macOS
   # or
   bin\chat_daemon.exe  # Windows
   ```

2. **Start Node.js API (in another terminal):**
   ```bash
   cd node-api
   npm run dev
   ```

### Testing the Setup

1. **Check C daemon compilation:**
   ```bash
   cd c-daemon
   make check-deps  # Linux/macOS only
   make debug       # Build with debug symbols
   ```

2. **Check Node.js API:**
   ```bash
   cd node-api
   npm test         # Run tests
   npm run lint     # Check code style
   ```

## Environment Variables

Copy `node-api/.env.example` to `node-api/.env` and adjust as needed:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-production
DAEMON_SOCKET_PATH=./data/daemon.sock
```

## Troubleshooting

### C Compilation Issues
- **Linux:** Install `build-essential` and library dev packages
- **macOS:** Install Xcode command line tools: `xcode-select --install`
- **Windows:** Ensure MinGW-w64 is in PATH, install libraries via vcpkg

### Node.js Issues
- Ensure Node.js version is 16.0.0 or higher: `node --version`
- Clear npm cache: `npm cache clean --force`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

### Socket Communication Issues
- Ensure `data/` directory exists and is writable
- Check socket path in configuration matches between C daemon and Node.js API
- On Windows, socket paths should use forward slashes or double backslashes

## Next Steps

After setup is complete:
1. Implement C daemon core functionality (Task 2)
2. Implement database operations (Task 3)
3. Add JSON command processing (Task 4)
4. Complete Node.js API endpoints (Tasks 5-8)

See `tasks.md` for detailed implementation plan.