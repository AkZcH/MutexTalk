#!/bin/bash
# Binary Semaphore Chat System Setup Script

set -e

echo "Setting up Binary Semaphore Chat System..."

# Create system directories
echo "Creating system directories..."
sudo mkdir -p /opt/chat-system/{bin,api,config}
sudo mkdir -p /var/lib/chat-system
sudo mkdir -p /var/log/chat-system
sudo mkdir -p /run/chat-system

# Create system users
echo "Creating system users..."
sudo useradd -r -s /bin/false chatsvc || echo "User chatsvc already exists"
sudo useradd -r -s /bin/false chatapi || echo "User chatapi already exists"

# Set directory permissions
echo "Setting directory permissions..."
sudo chown chatsvc:chatsvc /var/lib/chat-system
sudo chmod 750 /var/lib/chat-system

sudo chown chatsvc:chatsvc /var/log/chat-system
sudo chmod 750 /var/log/chat-system

sudo chown chatsvc:chatapi /run/chat-system
sudo chmod 770 /run/chat-system

# Copy configuration files
echo "Copying configuration files..."
sudo cp config/config.json /opt/chat-system/config/

# Install C daemon dependencies (Ubuntu/Debian)
echo "Installing C daemon dependencies..."
sudo apt-get update
sudo apt-get install -y build-essential libsqlite3-dev libcjson-dev pkg-config

# Build C daemon
echo "Building C daemon..."
cd c-daemon
make clean
make check-deps
make
sudo make install
cd ..

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
cd node-api
npm install
cd ..

echo "Setup complete!"
echo "Next steps:"
echo "1. Configure systemd services (see scripts/install-services.sh)"
echo "2. Initialize databases (see scripts/init-db.sh)"
echo "3. Start services: sudo systemctl start chat-daemon chat-api"