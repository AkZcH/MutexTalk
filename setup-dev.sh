#!/bin/bash
# Development setup script for Binary Semaphore Chat System

echo "Setting up Binary Semaphore Chat System for development..."

# Create necessary directories
echo "Creating directory structure..."
mkdir -p data logs c-daemon/obj c-daemon/bin node-api/middleware

# Setup Node.js dependencies
echo "Installing Node.js dependencies..."
cd node-api
npm install
if [ $? -ne 0 ]; then
    echo "Failed to install Node.js dependencies!"
    exit 1
fi
cd ..

# Check C compilation environment
echo "Checking C compilation environment..."
if ! command -v gcc &> /dev/null; then
    echo "Warning: GCC not found. Install build-essential package."
    echo "Run: sudo apt-get install build-essential"
fi

# Check for required C libraries
echo "Checking for required C libraries..."
if ! pkg-config --exists sqlite3; then
    echo "Warning: SQLite3 development libraries not found."
    echo "Run: sudo apt-get install libsqlite3-dev"
fi

if ! pkg-config --exists libcjson; then
    echo "Warning: cJSON library not found."
    echo "Run: sudo apt-get install libcjson-dev"
fi

echo ""
echo "Development setup complete!"
echo ""
echo "Next steps:"
echo "1. Install missing C libraries if any warnings appeared above"
echo "2. Build C daemon: cd c-daemon && make"
echo "3. Start API server: cd node-api && npm run dev"
echo ""