#!/bin/bash
# Full Stack Startup Script for Binary Semaphore Chat System

set -e

echo "🚀 Starting Binary Semaphore Chat System Full Stack"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is in use
port_in_use() {
    lsof -i :$1 >/dev/null 2>&1
}

echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check for required commands
for cmd in node npm gcc make sqlite3; do
    if ! command_exists $cmd; then
        echo -e "${RED}❌ $cmd is not installed${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All prerequisites found${NC}"

# Check if ports are available
if port_in_use 3000; then
    echo -e "${RED}❌ Port 3000 is already in use (needed for API server)${NC}"
    exit 1
fi

if port_in_use 5173; then
    echo -e "${RED}❌ Port 5173 is already in use (needed for frontend)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Ports 3000 and 5173 are available${NC}"

# Setup development environment if not already done
if [ ! -f "node-api/node_modules/.package-lock.json" ]; then
    echo -e "${YELLOW}Setting up backend dependencies...${NC}"
    cd node-api && npm install && cd ..
fi

if [ ! -f "frontend/node_modules/.package-lock.json" ]; then
    echo -e "${YELLOW}Setting up frontend dependencies...${NC}"
    cd frontend && npm install && cd ..
fi

# Build C daemon if not already built
if [ ! -f "c-daemon/bin/chat_daemon" ]; then
    echo -e "${YELLOW}Building C daemon...${NC}"
    cd c-daemon && make && cd ..
fi

# Create data directories if they don't exist
mkdir -p data logs

# Initialize databases if they don't exist
if [ ! -f "data/chat.db" ]; then
    echo -e "${YELLOW}Initializing databases...${NC}"
    ./scripts/init-db.sh 2>/dev/null || {
        echo -e "${YELLOW}Creating basic database structure...${NC}"
        sqlite3 data/chat.db "CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);"
        sqlite3 data/logs.db "CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, action TEXT NOT NULL, user TEXT, content TEXT, semaphore_value INTEGER NOT NULL);"
    }
fi

echo -e "${GREEN}✅ Setup complete${NC}"
echo ""
echo -e "${YELLOW}Starting services...${NC}"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    jobs -p | xargs -r kill
    wait
    echo -e "${GREEN}✅ All services stopped${NC}"
}

trap cleanup EXIT

# Start C daemon in background
echo -e "${YELLOW}🔧 Starting C daemon...${NC}"
cd c-daemon
./bin/chat_daemon &
DAEMON_PID=$!
cd ..

# Wait a moment for daemon to start
sleep 2

# Check if daemon started successfully
if ! kill -0 $DAEMON_PID 2>/dev/null; then
    echo -e "${RED}❌ C daemon failed to start${NC}"
    exit 1
fi

echo -e "${GREEN}✅ C daemon started (PID: $DAEMON_PID)${NC}"

# Start Node.js API in background
echo -e "${YELLOW}🌐 Starting API server...${NC}"
cd node-api
npm start &
API_PID=$!
cd ..

# Wait for API to start
echo -e "${YELLOW}Waiting for API server to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:3000/health >/dev/null 2>&1; then
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ API server failed to start${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ API server started (PID: $API_PID)${NC}"

# Start frontend in background
echo -e "${YELLOW}🎨 Starting frontend...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
echo -e "${YELLOW}Waiting for frontend to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:5173 >/dev/null 2>&1; then
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Frontend failed to start${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"

echo ""
echo -e "${GREEN}🎉 Binary Semaphore Chat System is now running!${NC}"
echo ""
echo "📱 Frontend:  http://localhost:5173"
echo "🌐 API:       http://localhost:3000"
echo "🔍 Health:    http://localhost:3000/health"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and show logs
echo -e "${YELLOW}Service logs:${NC}"
echo "============="

# Wait for all background processes
wait