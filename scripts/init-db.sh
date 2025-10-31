#!/bin/bash
# Initialize SQLite databases for Binary Semaphore Chat System

set -e

# Configuration
DB_DIR="/var/lib/chat-system"
CHAT_DB="$DB_DIR/chat.db"
LOGS_DB="$DB_DIR/logs.db"
LOG_FILE="/var/log/chat-system/transactions.log"

echo "Initializing SQLite databases..."
echo "Database directory: $DB_DIR"
echo "Chat database: $CHAT_DB"
echo "Logs database: $LOGS_DB"
echo "Transaction log file: $LOG_FILE"

# Ensure directories exist
sudo mkdir -p "$DB_DIR"
sudo mkdir -p "$(dirname "$LOG_FILE")"

# Backup existing databases if they exist
if [ -f "$CHAT_DB" ]; then
    echo "Backing up existing chat database..."
    sudo cp "$CHAT_DB" "$CHAT_DB.backup.$(date +%Y%m%d_%H%M%S)"
fi

if [ -f "$LOGS_DB" ]; then
    echo "Backing up existing logs database..."
    sudo cp "$LOGS_DB" "$LOGS_DB.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create chat database schema
echo "Creating chat database schema..."
sudo -u chatsvc sqlite3 "$CHAT_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    message TEXT NOT NULL CHECK(length(message) <= 2000),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);

-- Insert a welcome message
INSERT INTO messages (username, message, created_at) 
VALUES ('system', 'Welcome to Binary Semaphore Chat!', datetime('now'));
EOF

# Create logs database schema
echo "Creating logs database schema..."
sudo -u chatsvc sqlite3 "$LOGS_DB" << 'EOF'
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN (
        'CREATE', 'UPDATE', 'DELETE', 'READ',
        'ACQUIRE_MUTEX', 'RELEASE_MUTEX', 'ADMIN_ACTION'
    )),
    user TEXT,
    content TEXT CHECK(length(content) <= 2000),
    semaphore_value INTEGER NOT NULL CHECK(semaphore_value IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_transactions_ts ON transactions(ts DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_action ON transactions(action);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user);

-- Insert initialization log entry
INSERT INTO transactions (ts, action, user, content, semaphore_value)
VALUES (datetime('now'), 'ADMIN_ACTION', 'system', 'Database initialized', 1);
EOF

# Create transaction log file
echo "Creating transaction log file..."
sudo touch "$LOG_FILE"

# Set proper permissions
echo "Setting database and log file permissions..."
sudo chown chatsvc:chatsvc "$CHAT_DB" "$LOGS_DB" "$LOG_FILE"
sudo chmod 640 "$CHAT_DB" "$LOGS_DB"
sudo chmod 600 "$LOG_FILE"

# Enable WAL mode for concurrent access
echo "Enabling WAL mode for concurrent access..."
sudo -u chatsvc sqlite3 "$CHAT_DB" "PRAGMA journal_mode=WAL;"
sudo -u chatsvc sqlite3 "$LOGS_DB" "PRAGMA journal_mode=WAL;"

# Verify database integrity
echo "Verifying database integrity..."
sudo -u chatsvc sqlite3 "$CHAT_DB" "PRAGMA integrity_check;"
sudo -u chatsvc sqlite3 "$LOGS_DB" "PRAGMA integrity_check;"

echo ""
echo "Database initialization complete!"
echo "Chat database: $CHAT_DB"
echo "Logs database: $LOGS_DB"
echo "Transaction log: $LOG_FILE"
echo ""
echo "Database statistics:"
echo "Chat messages: $(sudo -u chatsvc sqlite3 "$CHAT_DB" "SELECT COUNT(*) FROM messages;")"
echo "Transaction logs: $(sudo -u chatsvc sqlite3 "$LOGS_DB" "SELECT COUNT(*) FROM transactions;")"