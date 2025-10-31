#!/bin/bash
# Uninstall script for Binary Semaphore Chat System

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "This script must be run as root (use sudo)"
fi

echo "Binary Semaphore Chat System Uninstaller"
echo "========================================"
echo ""
warn "This will completely remove the Binary Semaphore Chat System!"
warn "All data, logs, and configuration will be deleted!"
echo ""
read -p "Are you sure you want to continue? (type 'yes' to confirm): " confirm

if [ "$confirm" != "yes" ]; then
    log "Uninstall cancelled"
    exit 0
fi

log "Starting uninstall process..."

# Stop and disable services
log "Stopping and disabling services..."
if systemctl is-active --quiet chat-system.target; then
    systemctl stop chat-system.target
fi

systemctl disable chat-daemon.service 2>/dev/null || true
systemctl disable chat-api.service 2>/dev/null || true
systemctl disable chat-system.target 2>/dev/null || true

# Remove systemd service files
log "Removing systemd service files..."
rm -f /etc/systemd/system/chat-daemon.service
rm -f /etc/systemd/system/chat-api.service
rm -f /etc/systemd/system/chat-system.target

systemctl daemon-reload

# Remove installation directory
log "Removing installation directory..."
if [ -d "/opt/chat-system" ]; then
    rm -rf /opt/chat-system
    log "Removed /opt/chat-system"
fi

# Remove data directory
read -p "Remove data directory /var/lib/chat-system? (y/N): " remove_data
if [[ $remove_data =~ ^[Yy]$ ]]; then
    if [ -d "/var/lib/chat-system" ]; then
        rm -rf /var/lib/chat-system
        log "Removed /var/lib/chat-system"
    fi
else
    warn "Data directory preserved at /var/lib/chat-system"
fi

# Remove log directory
read -p "Remove log directory /var/log/chat-system? (y/N): " remove_logs
if [[ $remove_logs =~ ^[Yy]$ ]]; then
    if [ -d "/var/log/chat-system" ]; then
        rm -rf /var/log/chat-system
        log "Removed /var/log/chat-system"
    fi
else
    warn "Log directory preserved at /var/log/chat-system"
fi

# Remove runtime directory
log "Removing runtime directory..."
if [ -d "/run/chat-system" ]; then
    rm -rf /run/chat-system
    log "Removed /run/chat-system"
fi

# Remove binary
log "Removing daemon binary..."
if [ -f "/usr/local/bin/chat_daemon" ]; then
    rm -f /usr/local/bin/chat_daemon
    log "Removed /usr/local/bin/chat_daemon"
fi

# Remove users
read -p "Remove system users (chatsvc, chatapi)? (y/N): " remove_users
if [[ $remove_users =~ ^[Yy]$ ]]; then
    if id "chatapi" &>/dev/null; then
        userdel chatapi 2>/dev/null || warn "Failed to remove user chatapi"
        log "Removed user: chatapi"
    fi
    
    if id "chatsvc" &>/dev/null; then
        userdel chatsvc 2>/dev/null || warn "Failed to remove user chatsvc"
        log "Removed user: chatsvc"
    fi
else
    warn "System users preserved"
fi

log "Uninstall completed!"
echo ""
echo "Remaining items (if preserved):"
if [ -d "/var/lib/chat-system" ]; then
    echo "- Data: /var/lib/chat-system"
fi
if [ -d "/var/log/chat-system" ]; then
    echo "- Logs: /var/log/chat-system"
fi
if id "chatsvc" &>/dev/null || id "chatapi" &>/dev/null; then
    echo "- Users: chatsvc, chatapi"
fi
echo ""
echo "To remove development dependencies:"
echo "- C libraries: sudo apt-get remove libsqlite3-dev libcjson-dev"
echo "- Build tools: sudo apt-get remove build-essential"