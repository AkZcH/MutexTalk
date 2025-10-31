#!/bin/bash
# Install systemd service files

set -e

echo "Installing systemd service files..."

# Create chat-daemon.service
sudo tee /etc/systemd/system/chat-daemon.service > /dev/null << 'EOF'
[Unit]
Description=Binary Semaphore Chat Daemon
After=network.target

[Service]
Type=simple
User=chatsvc
Group=chatsvc
ExecStart=/usr/local/bin/chat_daemon
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/chat-system /var/log/chat-system /run/chat-system

[Install]
WantedBy=multi-user.target
EOF

# Create chat-api.service
sudo tee /etc/systemd/system/chat-api.service > /dev/null << 'EOF'
[Unit]
Description=Chat API Server
After=network.target chat-daemon.service
Requires=chat-daemon.service

[Service]
Type=simple
User=chatapi
Group=chatapi
WorkingDirectory=/opt/chat-system/api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

# Environment
Environment=NODE_ENV=production
Environment=PORT=3000

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable services
sudo systemctl daemon-reload
sudo systemctl enable chat-daemon.service
sudo systemctl enable chat-api.service

echo "Systemd services installed and enabled."
echo "Start services with: sudo systemctl start chat-daemon chat-api"
echo "Check status with: sudo systemctl status chat-daemon chat-api"