#!/bin/bash
# Complete installation script for Binary Semaphore Chat System

set -e

# Configuration
INSTALL_DIR="/opt/chat-system"
DATA_DIR="/var/lib/chat-system"
LOG_DIR="/var/log/chat-system"
RUN_DIR="/run/chat-system"
CONFIG_DIR="$INSTALL_DIR/config"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (use sudo)"
fi

log "Starting Binary Semaphore Chat System installation..."

# Check system requirements
log "Checking system requirements..."

# Check for required commands
for cmd in gcc make sqlite3 node npm; do
    if ! command -v $cmd &> /dev/null; then
        error "Required command '$cmd' not found. Please install it first."
    fi
done

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    error "Node.js version 16 or higher required. Current version: $(node --version)"
fi

log "System requirements satisfied"

# Install system dependencies
log "Installing system dependencies..."
if command -v apt-get &> /dev/null; then
    apt-get update
    apt-get install -y build-essential libsqlite3-dev libcjson-dev pkg-config
elif command -v yum &> /dev/null; then
    yum groupinstall -y "Development Tools"
    yum install -y sqlite-devel libcjson-devel pkgconfig
elif command -v dnf &> /dev/null; then
    dnf groupinstall -y "Development Tools"
    dnf install -y sqlite-devel libcjson-devel pkgconfig
else
    warn "Unknown package manager. Please install: build-essential, sqlite3-dev, cjson-dev manually"
fi

# Create system users
log "Creating system users..."
if ! id "chatsvc" &>/dev/null; then
    useradd -r -s /bin/false -d /var/lib/chat-system chatsvc
    log "Created user: chatsvc"
else
    log "User chatsvc already exists"
fi

if ! id "chatapi" &>/dev/null; then
    useradd -r -s /bin/false -d /opt/chat-system/api chatapi
    usermod -a -G chatsvc chatapi
    log "Created user: chatapi"
else
    log "User chatapi already exists"
    usermod -a -G chatsvc chatapi
fi

# Create directory structure
log "Creating directory structure..."
mkdir -p "$INSTALL_DIR"/{bin,api,config}
mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"
mkdir -p "$RUN_DIR"

# Set directory permissions
log "Setting directory permissions..."
chown root:root "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"

chown chatsvc:chatsvc "$DATA_DIR"
chmod 750 "$DATA_DIR"

chown chatsvc:chatsvc "$LOG_DIR"
chmod 750 "$LOG_DIR"

chown chatsvc:chatapi "$RUN_DIR"
chmod 770 "$RUN_DIR"

chown root:chatsvc "$CONFIG_DIR"
chmod 750 "$CONFIG_DIR"

# Build and install C daemon
log "Building C daemon..."
cd c-daemon

# Check dependencies
log "Checking C daemon dependencies..."
make check-deps || error "C daemon dependencies check failed"

# Clean and build
make clean
make || error "C daemon compilation failed"

# Install binary
log "Installing C daemon binary..."
make install || error "C daemon installation failed"

cd ..

# Install Node.js API
log "Installing Node.js API..."
cp -r node-api/* "$INSTALL_DIR/api/"
chown -R chatapi:chatapi "$INSTALL_DIR/api"
chmod -R 755 "$INSTALL_DIR/api"

# Install Node.js dependencies
log "Installing Node.js dependencies..."
cd "$INSTALL_DIR/api"
sudo -u chatapi npm install --production
cd -

# Copy configuration files
log "Installing configuration files..."
cp config/config.json "$CONFIG_DIR/"
if [ -f config/config.production.json ]; then
    cp config/config.production.json "$CONFIG_DIR/"
fi

# Create environment file template
cat > "$CONFIG_DIR/.env.template" << 'EOF'
# Production environment configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=your-secret-key-here
DAEMON_SOCKET_PATH=/run/chat-system/daemon.sock
LOG_LEVEL=info
EOF

chown root:chatapi "$CONFIG_DIR"/.env.template
chmod 640 "$CONFIG_DIR"/.env.template

# Install systemd services
log "Installing systemd services..."
cp systemd/*.service /etc/systemd/system/
cp systemd/*.target /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable services
systemctl enable chat-daemon.service
systemctl enable chat-api.service
systemctl enable chat-system.target

log "Installation completed successfully!"
echo ""
echo "Next steps:"
echo "1. Initialize databases: sudo ./scripts/init-db.sh"
echo "2. Configure environment: sudo cp $CONFIG_DIR/.env.template $CONFIG_DIR/.env"
echo "3. Edit configuration: sudo nano $CONFIG_DIR/.env"
echo "4. Start services: sudo systemctl start chat-system.target"
echo "5. Check status: sudo systemctl status chat-system.target"
echo ""
echo "Service management:"
echo "- Start: sudo systemctl start chat-system.target"
echo "- Stop: sudo systemctl stop chat-system.target"
echo "- Restart: sudo systemctl restart chat-system.target"
echo "- Logs: sudo journalctl -u chat-daemon -u chat-api -f"