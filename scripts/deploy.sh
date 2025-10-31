#!/bin/bash
# Deployment script for Binary Semaphore Chat System

set -e

# Configuration
INSTALL_DIR="/opt/chat-system"
BACKUP_DIR="/opt/chat-system-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

info() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (use sudo)"
fi

info "Starting deployment of Binary Semaphore Chat System..."

# Create backup directory
log "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

# Stop services if running
log "Stopping services..."
if systemctl is-active --quiet chat-system.target; then
    systemctl stop chat-system.target
    log "Services stopped"
else
    log "Services were not running"
fi

# Backup current installation
if [ -d "$INSTALL_DIR" ]; then
    log "Creating backup of current installation..."
    tar -czf "$BACKUP_DIR/chat-system-backup-$TIMESTAMP.tar.gz" -C "$(dirname "$INSTALL_DIR")" "$(basename "$INSTALL_DIR")"
    log "Backup created: $BACKUP_DIR/chat-system-backup-$TIMESTAMP.tar.gz"
fi

# Backup databases
log "Backing up databases..."
if [ -f "/var/lib/chat-system/chat.db" ]; then
    cp "/var/lib/chat-system/chat.db" "$BACKUP_DIR/chat-db-backup-$TIMESTAMP.db"
fi
if [ -f "/var/lib/chat-system/logs.db" ]; then
    cp "/var/lib/chat-system/logs.db" "$BACKUP_DIR/logs-db-backup-$TIMESTAMP.db"
fi

# Build new version
log "Building new version..."
cd c-daemon
make clean
make || error "C daemon compilation failed"
cd ..

# Install new C daemon
log "Installing new C daemon..."
cd c-daemon
make install || error "C daemon installation failed"
cd ..

# Update Node.js API
log "Updating Node.js API..."
cp -r node-api/* "$INSTALL_DIR/api/"
chown -R chatapi:chatapi "$INSTALL_DIR/api"

# Update Node.js dependencies
log "Updating Node.js dependencies..."
cd "$INSTALL_DIR/api"
sudo -u chatapi npm install --production
cd -

# Update systemd services
log "Updating systemd services..."
cp systemd/*.service /etc/systemd/system/
cp systemd/*.target /etc/systemd/system/
systemctl daemon-reload

# Verify database integrity
log "Verifying database integrity..."
if [ -f "/var/lib/chat-system/chat.db" ]; then
    sudo -u chatsvc sqlite3 "/var/lib/chat-system/chat.db" "PRAGMA integrity_check;" || error "Chat database integrity check failed"
fi
if [ -f "/var/lib/chat-system/logs.db" ]; then
    sudo -u chatsvc sqlite3 "/var/lib/chat-system/logs.db" "PRAGMA integrity_check;" || error "Logs database integrity check failed"
fi

# Start services
log "Starting services..."
systemctl start chat-system.target

# Wait for services to start
sleep 5

# Verify services are running
log "Verifying services..."
if systemctl is-active --quiet chat-daemon.service; then
    log "✓ Chat daemon is running"
else
    error "✗ Chat daemon failed to start"
fi

if systemctl is-active --quiet chat-api.service; then
    log "✓ Chat API is running"
else
    error "✗ Chat API failed to start"
fi

# Test basic functionality
log "Testing basic functionality..."
if [ -S "/run/chat-system/daemon.sock" ]; then
    log "✓ Daemon socket is available"
else
    warn "✗ Daemon socket not found"
fi

# Check API health (if curl is available)
if command -v curl &> /dev/null; then
    if curl -s -f http://localhost:3000/api/status > /dev/null; then
        log "✓ API health check passed"
    else
        warn "✗ API health check failed"
    fi
fi

info "Deployment completed successfully!"
echo ""
echo "Deployment Summary:"
echo "- Timestamp: $TIMESTAMP"
echo "- Backup location: $BACKUP_DIR/"
echo "- Services status: $(systemctl is-active chat-system.target)"
echo ""
echo "Post-deployment checks:"
echo "- View logs: sudo journalctl -u chat-daemon -u chat-api -f"
echo "- Check status: sudo systemctl status chat-system.target"
echo "- Test API: curl http://localhost:3000/api/status"
echo ""
echo "Rollback (if needed):"
echo "- Stop services: sudo systemctl stop chat-system.target"
echo "- Restore backup: sudo tar -xzf $BACKUP_DIR/chat-system-backup-$TIMESTAMP.tar.gz -C /"
echo "- Restore databases: sudo cp $BACKUP_DIR/*-backup-$TIMESTAMP.db /var/lib/chat-system/"
echo "- Start services: sudo systemctl start chat-system.target"