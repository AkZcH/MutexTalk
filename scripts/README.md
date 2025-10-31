# Installation and Setup Scripts

This directory contains scripts for installing, configuring, and managing the Binary Semaphore Chat System.

## Linux/Unix Scripts

### Installation Scripts

- **`install.sh`** - Complete installation script (requires root)
  - Installs system dependencies
  - Creates users and directories
  - Builds and installs C daemon
  - Sets up Node.js API
  - Installs systemd services

- **`init-db.sh`** - Database initialization script
  - Creates SQLite database schemas
  - Sets up proper permissions
  - Enables WAL mode for concurrent access

- **`create-config.sh`** - Configuration file generator
  - Creates production environment files
  - Generates secure secrets
  - Creates nginx configuration template

### Management Scripts

- **`deploy.sh`** - Deployment script for updates
  - Creates backups before deployment
  - Updates C daemon and Node.js API
  - Verifies services after deployment

- **`uninstall.sh`** - Complete system removal
  - Stops and removes services
  - Optionally removes data and users
  - Clean uninstallation process

### Legacy Scripts

- **`setup.sh`** - Basic setup script (legacy)
- **`install-services.sh`** - Systemd service installer (legacy)

## Windows Scripts

- **`install.bat`** - Windows installation script
  - Builds C daemon with MinGW/Visual Studio
  - Installs Node.js dependencies
  - Creates configuration files
  - Sets up startup scripts

- **`setup.bat`** - Basic Windows setup (legacy)

## Usage Instructions

### Linux Installation

1. **Complete Installation** (recommended):
   ```bash
   sudo ./scripts/install.sh
   sudo ./scripts/init-db.sh
   sudo ./scripts/create-config.sh
   ```

2. **Manual Installation**:
   ```bash
   # Install dependencies and build
   sudo ./scripts/setup.sh
   
   # Install systemd services
   sudo ./scripts/install-services.sh
   
   # Initialize databases
   sudo ./scripts/init-db.sh
   ```

3. **Start Services**:
   ```bash
   sudo systemctl start chat-system.target
   sudo systemctl status chat-system.target
   ```

### Windows Installation

1. **Run as Administrator**:
   ```cmd
   scripts\install.bat
   ```

2. **Start Services**:
   ```cmd
   start-system.bat
   ```

### Deployment and Updates

1. **Deploy Updates**:
   ```bash
   sudo ./scripts/deploy.sh
   ```

2. **Create Configuration**:
   ```bash
   sudo ./scripts/create-config.sh
   ```

### Uninstallation

1. **Complete Removal**:
   ```bash
   sudo ./scripts/uninstall.sh
   ```

## File Permissions

On Linux systems, ensure scripts are executable:
```bash
chmod +x scripts/*.sh
```

## Configuration Files

After installation, review and customize:

- **Linux**: `/opt/chat-system/config/.env`
- **Windows**: `node-api\.env`

Important settings to customize:
- `JWT_SECRET` - Change from default
- `CORS_ORIGIN` - Set to your frontend URL
- Database paths (if different from defaults)

## Troubleshooting

### Common Issues

1. **Permission Denied**:
   - Ensure running as root/administrator
   - Check file permissions

2. **Dependencies Missing**:
   - Install build tools (gcc, make)
   - Install SQLite development libraries
   - Install Node.js and npm

3. **Services Won't Start**:
   - Check logs: `sudo journalctl -u chat-daemon -u chat-api`
   - Verify configuration files
   - Check database permissions

4. **Database Errors**:
   - Run database integrity check
   - Reinitialize with `init-db.sh`
   - Check file permissions

### Log Locations

- **Linux**: 
  - System logs: `journalctl -u chat-daemon -u chat-api`
  - Application logs: `/var/log/chat-system/`
  
- **Windows**:
  - Application logs: `logs\` directory
  - Console output when running scripts

## Security Considerations

- Change default JWT secrets before production use
- Review and customize systemd security settings
- Set up proper firewall rules
- Use HTTPS in production (see nginx template)
- Regularly update dependencies

## Support

For issues with installation or setup:
1. Check the main README.md
2. Review SETUP.md for detailed instructions
3. Check logs for error messages
4. Verify all dependencies are installed