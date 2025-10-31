#!/bin/bash
# Create configuration files for Binary Semaphore Chat System

set -e

CONFIG_DIR="/opt/chat-system/config"
TEMPLATE_DIR="config"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log "Creating configuration files..."

# Create production environment file
log "Creating production environment configuration..."
cat > "$CONFIG_DIR/.env" << EOF
# Binary Semaphore Chat System - Production Configuration
NODE_ENV=production
PORT=3000

# Security
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Daemon communication
DAEMON_SOCKET_PATH=/run/chat-system/daemon.sock

# Database paths
CHAT_DB_PATH=/var/lib/chat-system/chat.db
LOGS_DB_PATH=/var/lib/chat-system/logs.db
TRANSACTION_LOG_PATH=/var/log/chat-system/transactions.log

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/chat-system/api.log

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS settings
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true

# WebSocket settings
WS_HEARTBEAT_INTERVAL=30000
WS_MAX_CONNECTIONS=100
EOF

# Create C daemon configuration
log "Creating C daemon configuration..."
cat > "$CONFIG_DIR/daemon.conf" << EOF
# Binary Semaphore Chat System - C Daemon Configuration

# Socket configuration
socket_path=/run/chat-system/daemon.sock
socket_permissions=0660

# Database configuration
chat_db_path=/var/lib/chat-system/chat.db
logs_db_path=/var/lib/chat-system/logs.db
transaction_log_path=/var/log/chat-system/transactions.log

# Logging configuration
log_level=INFO
max_log_size=10485760
log_rotation=true

# Performance settings
max_connections=100
thread_pool_size=10
connection_timeout=30

# Security settings
max_message_length=2000
max_username_length=50
enable_admin_toggle=true
EOF

# Create nginx configuration template
log "Creating nginx configuration template..."
cat > "$CONFIG_DIR/nginx.conf.template" << 'EOF'
# Nginx configuration for Binary Semaphore Chat System

upstream chat_api {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";
    
    # API proxy
    location /api/ {
        proxy_pass http://chat_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Rate limiting
        limit_req zone=api burst=20 nodelay;
    }
    
    # WebSocket proxy
    location /ws/ {
        proxy_pass http://chat_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket specific settings
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
    
    # Static files (if serving frontend)
    location / {
        root /var/www/chat-frontend;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}

# Rate limiting zones
http {
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
}
EOF

# Set proper permissions
chown root:chatapi "$CONFIG_DIR/.env"
chmod 640 "$CONFIG_DIR/.env"

chown root:chatsvc "$CONFIG_DIR/daemon.conf"
chmod 640 "$CONFIG_DIR/daemon.conf"

chown root:root "$CONFIG_DIR/nginx.conf.template"
chmod 644 "$CONFIG_DIR/nginx.conf.template"

log "Configuration files created successfully!"
echo ""
echo "Configuration files:"
echo "- Environment: $CONFIG_DIR/.env"
echo "- C Daemon: $CONFIG_DIR/daemon.conf"
echo "- Nginx template: $CONFIG_DIR/nginx.conf.template"
echo ""
echo "Important: Review and customize these files before starting services!"
echo "- Update JWT_SECRET and SESSION_SECRET in .env"
echo "- Configure your domain in nginx.conf.template"
echo "- Adjust paths and settings as needed"