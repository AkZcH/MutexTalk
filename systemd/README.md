# Systemd Service Configuration

This directory contains systemd service files for the Binary Semaphore Chat System.

## Service Files

- `chat-daemon.service` - C daemon service that manages the binary semaphore and database operations
- `chat-api.service` - Node.js API service that provides HTTP/WebSocket endpoints
- `chat-system.target` - Target to manage both services together

## Installation

1. Copy service files to systemd directory:
```bash
sudo cp systemd/*.service /etc/systemd/system/
sudo cp systemd/*.target /etc/systemd/system/
```

2. Create required users and groups:
```bash
sudo useradd -r -s /bin/false chatsvc
sudo useradd -r -s /bin/false chatapi
sudo usermod -a -G chatsvc chatapi
```

3. Reload systemd configuration:
```bash
sudo systemctl daemon-reload
```

4. Enable services:
```bash
sudo systemctl enable chat-daemon.service
sudo systemctl enable chat-api.service
sudo systemctl enable chat-system.target
```

## Service Management

### Start all services:
```bash
sudo systemctl start chat-system.target
```

### Stop all services:
```bash
sudo systemctl stop chat-system.target
```

### Check service status:
```bash
sudo systemctl status chat-daemon.service
sudo systemctl status chat-api.service
```

### View logs:
```bash
sudo journalctl -u chat-daemon.service -f
sudo journalctl -u chat-api.service -f
```

### Restart individual services:
```bash
sudo systemctl restart chat-daemon.service
sudo systemctl restart chat-api.service
```

## Security Features

Both services include security hardening:
- Run as dedicated non-root users
- Private temporary directories
- Protected system and home directories
- Limited capabilities
- Resource limits for file descriptors and processes

## Dependencies

- `chat-daemon.service` must start before `chat-api.service`
- Both services depend on network availability
- Services automatically restart on failure with 5-second delay