# Deployment Guide

This guide covers deployment of the Binary Semaphore Chat System in production environments.

## Prerequisites

### System Requirements

- **Operating System**: Linux (Ubuntu 20.04+, CentOS 8+, or similar)
- **CPU**: 2+ cores recommended
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 10GB minimum for system and logs
- **Network**: HTTP/HTTPS access for API endpoints

### Software Dependencies

- **C Compiler**: GCC 7+ or Clang 6+
- **Build Tools**: make, pkg-config
- **Libraries**: SQLite3 development, cJSON development
- **Runtime**: Node.js 16+, npm
- **System**: systemd (for service management)

## Installation Methods

### Method 1: Automated Installation (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd binary-semaphore-chat-backend

# Run complete installation
sudo ./scripts/install.sh

# Initialize databases
sudo ./scripts/init-db.sh

# Create configuration
sudo ./scripts/create-config.sh

# Start services
sudo systemctl start chat-system.target
```

### Method 2: Manual Installation

#### Step 1: System Preparation

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install dependencies
sudo apt-get install -y build-essential libsqlite3-dev libcjson-dev pkg-config nodejs npm

# Create users
sudo useradd -r -s /bin/false chatsvc
sudo useradd -r -s /bin/false chatapi
sudo usermod -a -G chatsvc chatapi
```

#### Step 2: Directory Structure

```bash
# Create directories
sudo mkdir -p /opt/chat-system/{bin,api,config}
sudo mkdir -p /var/lib/chat-system
sudo mkdir -p /var/log/chat-system
sudo mkdir -p /run/chat-system

# Set permissions
sudo chown chatsvc:chatsvc /var/lib/chat-system /var/log/chat-system
sudo chown chatsvc:chatapi /run/chat-system
sudo chmod 750 /var/lib/chat-system /var/log/chat-system
sudo chmod 770 /run/chat-system
```

#### Step 3: Build and Install

```bash
# Build C daemon
cd c-daemon
make clean && make
sudo make install

# Install Node.js API
cd ../node-api
sudo cp -r * /opt/chat-system/api/
sudo chown -R chatapi:chatapi /opt/chat-system/api
cd /opt/chat-system/api
sudo -u chatapi npm install --production
```

#### Step 4: Configuration

```bash
# Copy systemd services
sudo cp systemd/*.service /etc/systemd/system/
sudo cp systemd/*.target /etc/systemd/system/
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable chat-daemon.service chat-api.service chat-system.target
```

## Configuration

### Environment Configuration

Edit `/opt/chat-system/config/.env`:

```bash
# Production settings
NODE_ENV=production
PORT=3000

# Security (CHANGE THESE!)
JWT_SECRET=your-secure-jwt-secret-here
SESSION_SECRET=your-secure-session-secret-here

# Paths
DAEMON_SOCKET_PATH=/run/chat-system/daemon.sock
CHAT_DB_PATH=/var/lib/chat-system/chat.db
LOGS_DB_PATH=/var/lib/chat-system/logs.db
TRANSACTION_LOG_PATH=/var/log/chat-system/transactions.log

# CORS (adjust for your frontend)
CORS_ORIGIN=https://your-frontend-domain.com
CORS_CREDENTIALS=true

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### C Daemon Configuration

Edit `/opt/chat-system/config/daemon.conf`:

```ini
# Socket configuration
socket_path=/run/chat-system/daemon.sock
socket_permissions=0660

# Database paths
chat_db_path=/var/lib/chat-system/chat.db
logs_db_path=/var/lib/chat-system/logs.db
transaction_log_path=/var/log/chat-system/transactions.log

# Performance
max_connections=100
thread_pool_size=10
connection_timeout=30

# Security
max_message_length=2000
max_username_length=50
```

## Database Setup

### Initialize Databases

```bash
sudo ./scripts/init-db.sh
```

This creates:
- Chat database (`/var/lib/chat-system/chat.db`)
- Logs database (`/var/lib/chat-system/logs.db`)
- Transaction log file (`/var/log/chat-system/transactions.log`)

### Database Maintenance

```bash
# Check database integrity
sudo -u chatsvc sqlite3 /var/lib/chat-system/chat.db "PRAGMA integrity_check;"
sudo -u chatsvc sqlite3 /var/lib/chat-system/logs.db "PRAGMA integrity_check;"

# Backup databases
sudo cp /var/lib/chat-system/chat.db /backup/chat-$(date +%Y%m%d).db
sudo cp /var/lib/chat-system/logs.db /backup/logs-$(date +%Y%m%d).db

# Vacuum databases (reclaim space)
sudo -u chatsvc sqlite3 /var/lib/chat-system/chat.db "VACUUM;"
sudo -u chatsvc sqlite3 /var/lib/chat-system/logs.db "VACUUM;"
```

## Service Management

### Starting Services

```bash
# Start all services
sudo systemctl start chat-system.target

# Start individual services
sudo systemctl start chat-daemon.service
sudo systemctl start chat-api.service
```

### Monitoring Services

```bash
# Check status
sudo systemctl status chat-system.target
sudo systemctl status chat-daemon.service
sudo systemctl status chat-api.service

# View logs
sudo journalctl -u chat-daemon.service -f
sudo journalctl -u chat-api.service -f
sudo journalctl -u chat-system.target -f

# View application logs
sudo tail -f /var/log/chat-system/transactions.log
```

### Service Operations

```bash
# Restart services
sudo systemctl restart chat-system.target

# Stop services
sudo systemctl stop chat-system.target

# Reload configuration
sudo systemctl reload chat-api.service
```

## Reverse Proxy Setup (Nginx)

### Install Nginx

```bash
sudo apt-get install nginx
```

### Configuration

Create `/etc/nginx/sites-available/chat-system`:

```nginx
upstream chat_api {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL configuration
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000";
    
    # API endpoints
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
    }
    
    # WebSocket endpoints
    location /ws/ {
        proxy_pass http://chat_api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/chat-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL/TLS Setup

### Using Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring and Logging

### Log Rotation

Create `/etc/logrotate.d/chat-system`:

```
/var/log/chat-system/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 chatsvc chatsvc
    postrotate
        systemctl reload chat-daemon.service
    endscript
}
```

### Health Monitoring

Create monitoring script `/opt/chat-system/bin/health-check.sh`:

```bash
#!/bin/bash
# Health check script

# Check services
systemctl is-active --quiet chat-daemon.service || exit 1
systemctl is-active --quiet chat-api.service || exit 1

# Check API endpoint
curl -f -s http://localhost:3000/api/status > /dev/null || exit 1

# Check database
sudo -u chatsvc sqlite3 /var/lib/chat-system/chat.db "SELECT 1;" > /dev/null || exit 1

echo "All systems healthy"
```

### Performance Monitoring

```bash
# Monitor resource usage
htop
iotop
netstat -tulpn | grep :3000

# Database performance
sudo -u chatsvc sqlite3 /var/lib/chat-system/chat.db ".stats"

# Log analysis
sudo journalctl -u chat-system.target --since "1 hour ago" | grep ERROR
```

## Backup and Recovery

### Automated Backup Script

Create `/opt/chat-system/bin/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/backup/chat-system"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Stop services
systemctl stop chat-system.target

# Backup databases
cp /var/lib/chat-system/chat.db "$BACKUP_DIR/chat-$DATE.db"
cp /var/lib/chat-system/logs.db "$BACKUP_DIR/logs-$DATE.db"

# Backup configuration
tar -czf "$BACKUP_DIR/config-$DATE.tar.gz" /opt/chat-system/config

# Start services
systemctl start chat-system.target

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
```

### Recovery Procedure

```bash
# Stop services
sudo systemctl stop chat-system.target

# Restore databases
sudo cp /backup/chat-system/chat-YYYYMMDD_HHMMSS.db /var/lib/chat-system/chat.db
sudo cp /backup/chat-system/logs-YYYYMMDD_HHMMSS.db /var/lib/chat-system/logs.db

# Restore configuration
sudo tar -xzf /backup/chat-system/config-YYYYMMDD_HHMMSS.tar.gz -C /

# Fix permissions
sudo chown chatsvc:chatsvc /var/lib/chat-system/*.db
sudo chmod 640 /var/lib/chat-system/*.db

# Start services
sudo systemctl start chat-system.target
```

## Security Hardening

### Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# iptables
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -j DROP
```

### File Permissions Audit

```bash
# Check critical file permissions
ls -la /opt/chat-system/config/
ls -la /var/lib/chat-system/
ls -la /var/log/chat-system/
ls -la /run/chat-system/
```

### Security Updates

```bash
# Regular system updates
sudo apt-get update && sudo apt-get upgrade -y

# Update Node.js dependencies
cd /opt/chat-system/api
sudo -u chatapi npm audit fix
```

## Troubleshooting

### Common Issues

1. **Services won't start**:
   ```bash
   sudo journalctl -u chat-daemon.service -n 50
   sudo journalctl -u chat-api.service -n 50
   ```

2. **Database connection errors**:
   ```bash
   sudo -u chatsvc sqlite3 /var/lib/chat-system/chat.db ".tables"
   ls -la /var/lib/chat-system/
   ```

3. **Permission issues**:
   ```bash
   sudo ./scripts/install.sh  # Re-run to fix permissions
   ```

4. **High memory usage**:
   ```bash
   sudo systemctl restart chat-system.target
   ```

### Performance Tuning

1. **Database optimization**:
   ```sql
   PRAGMA optimize;
   PRAGMA analysis_limit=1000;
   ANALYZE;
   ```

2. **System limits**:
   Edit `/etc/security/limits.conf`:
   ```
   chatsvc soft nofile 65536
   chatsvc hard nofile 65536
   chatapi soft nofile 65536
   chatapi hard nofile 65536
   ```

## Maintenance

### Regular Tasks

- **Daily**: Check service status and logs
- **Weekly**: Review database size and performance
- **Monthly**: Update system packages and dependencies
- **Quarterly**: Review and rotate logs, update SSL certificates

### Maintenance Windows

For updates requiring downtime:

1. Schedule maintenance window
2. Notify users of downtime
3. Run backup script
4. Deploy updates using `./scripts/deploy.sh`
5. Verify all services are running
6. Monitor for issues post-deployment

This completes the deployment guide for the Binary Semaphore Chat System.