// Database Manager Implementation
// Handles SQLite operations for chat and logs databases

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <sqlite3.h>

#include "db.h"
#include "semaphore.h"
#include "logger.h"

// Helper function to validate semaphore ownership for write operations
int validate_semaphore_ownership(const char *username) {
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    
    int status = get_semaphore_status(current_holder, &semaphore_value);
    if (status != 0) {
        fprintf(stderr, "Failed to get semaphore status\n");
        return -1;  // General error
    }
    
    // Check if semaphore is available (value = 1 means no one holds it)
    if (semaphore_value == 1) {
        fprintf(stderr, "No writer currently holds the semaphore\n");
        return -2;  // Permission denied
    }
    
    // Check if the requesting user is the current holder
    if (strcmp(current_holder, username) != 0) {
        fprintf(stderr, "User '%s' does not hold the semaphore (held by '%s')\n", 
                username, current_holder);
        return -2;  // Permission denied
    }
    
    return 0;  // Ownership validated
}

// Global database context
static db_context_t g_db_ctx;
static bool g_db_initialized = false;

// Generate ISO 8601 timestamp
void get_current_timestamp(char *timestamp, size_t size) {
    time_t now = time(NULL);
    struct tm *utc_tm = gmtime(&now);
    strftime(timestamp, size, "%Y-%m-%dT%H:%M:%S", utc_tm);
}

// Create chat database schema
int create_chat_schema(sqlite3 *db) {
    const char *create_messages_table = 
        "CREATE TABLE IF NOT EXISTS messages ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "username TEXT NOT NULL CHECK(length(username) > 0 AND length(username) <= 64),"
        "message TEXT NOT NULL CHECK(length(message) > 0 AND length(message) <= 2000),"
        "created_at TEXT NOT NULL"
        ");";
    
    const char *create_messages_index1 = 
        "CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);";
    
    const char *create_messages_index2 = 
        "CREATE INDEX IF NOT EXISTS idx_messages_username ON messages(username);";
    
    if (sqlite3_exec(db, create_messages_table, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create messages table: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    if (sqlite3_exec(db, create_messages_index1, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create messages index 1: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    if (sqlite3_exec(db, create_messages_index2, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create messages index 2: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    return 0;
}

// Create logs database schema
int create_logs_schema(sqlite3 *db) {
    const char *create_transactions_table = 
        "CREATE TABLE IF NOT EXISTS transactions ("
        "id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "ts TEXT NOT NULL,"
        "action TEXT NOT NULL CHECK(action IN ("
        "'CREATE', 'UPDATE', 'DELETE', 'READ',"
        "'ACQUIRE_MUTEX', 'RELEASE_MUTEX', 'ADMIN_ACTION'"
        ")),"
        "user TEXT,"
        "content TEXT CHECK(content IS NULL OR length(content) <= 2000),"
        "semaphore_value INTEGER NOT NULL CHECK(semaphore_value IN (0, 1))"
        ");";
    
    const char *create_transactions_index1 = 
        "CREATE INDEX IF NOT EXISTS idx_transactions_ts ON transactions(ts DESC);";
    
    const char *create_transactions_index2 = 
        "CREATE INDEX IF NOT EXISTS idx_transactions_action ON transactions(action);";
    
    const char *create_transactions_index3 = 
        "CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user);";
    
    if (sqlite3_exec(db, create_transactions_table, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create transactions table: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    if (sqlite3_exec(db, create_transactions_index1, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create transactions index 1: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    if (sqlite3_exec(db, create_transactions_index2, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create transactions index 2: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    if (sqlite3_exec(db, create_transactions_index3, NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to create transactions index 3: %s\n", sqlite3_errmsg(db));
        return -1;
    }
    
    return 0;
}

// Prepare all SQL statements
int prepare_statements() {
    // Chat database statements
    const char *sql_create_message = 
        "INSERT INTO messages (username, message, created_at) VALUES (?, ?, ?)";
    
    const char *sql_update_message = 
        "UPDATE messages SET message = ? WHERE id = ? AND username = ?";
    
    const char *sql_delete_message = 
        "DELETE FROM messages WHERE id = ? AND username = ?";
    
    const char *sql_list_messages = 
        "SELECT id, username, message, created_at FROM messages "
        "ORDER BY created_at DESC LIMIT ? OFFSET ?";
    
    // Logs database statements
    const char *sql_insert_log = 
        "INSERT INTO transactions (ts, action, user, content, semaphore_value) "
        "VALUES (?, ?, ?, ?, ?)";
    
    const char *sql_get_logs = 
        "SELECT id, ts, action, user, content, semaphore_value FROM transactions "
        "ORDER BY ts DESC LIMIT ? OFFSET ?";
    
    // Prepare chat statements
    if (sqlite3_prepare_v2(g_db_ctx.chat_db, sql_create_message, -1, 
                          &g_db_ctx.stmt_create_message, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare create_message statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.chat_db));
        return -1;
    }
    
    if (sqlite3_prepare_v2(g_db_ctx.chat_db, sql_update_message, -1, 
                          &g_db_ctx.stmt_update_message, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare update_message statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.chat_db));
        return -1;
    }
    
    if (sqlite3_prepare_v2(g_db_ctx.chat_db, sql_delete_message, -1, 
                          &g_db_ctx.stmt_delete_message, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare delete_message statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.chat_db));
        return -1;
    }
    
    if (sqlite3_prepare_v2(g_db_ctx.chat_db, sql_list_messages, -1, 
                          &g_db_ctx.stmt_list_messages, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare list_messages statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.chat_db));
        return -1;
    }
    
    // Prepare log statements
    if (sqlite3_prepare_v2(g_db_ctx.logs_db, sql_insert_log, -1, 
                          &g_db_ctx.stmt_insert_log, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare insert_log statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.logs_db));
        return -1;
    }
    
    if (sqlite3_prepare_v2(g_db_ctx.logs_db, sql_get_logs, -1, 
                          &g_db_ctx.stmt_get_logs, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to prepare get_logs statement: %s\n", 
                sqlite3_errmsg(g_db_ctx.logs_db));
        return -1;
    }
    
    return 0;
}

// Initialize databases
int init_databases(const char *chat_db_path, const char *log_db_path) {
    if (g_db_initialized) {
        return 0;  // Already initialized
    }
    
    // Initialize context
    memset(&g_db_ctx, 0, sizeof(g_db_ctx));
    
    // Open chat database
    if (sqlite3_open(chat_db_path, &g_db_ctx.chat_db) != SQLITE_OK) {
        fprintf(stderr, "Failed to open chat database: %s\n", sqlite3_errmsg(g_db_ctx.chat_db));
        return -1;
    }
    
    // Open logs database
    if (sqlite3_open(log_db_path, &g_db_ctx.logs_db) != SQLITE_OK) {
        fprintf(stderr, "Failed to open logs database: %s\n", sqlite3_errmsg(g_db_ctx.logs_db));
        sqlite3_close(g_db_ctx.chat_db);
        return -1;
    }
    
    // Enable WAL mode for concurrent read access
    if (sqlite3_exec(g_db_ctx.chat_db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to enable WAL mode for chat database: %s\n", 
                sqlite3_errmsg(g_db_ctx.chat_db));
    }
    
    if (sqlite3_exec(g_db_ctx.logs_db, "PRAGMA journal_mode=WAL;", NULL, NULL, NULL) != SQLITE_OK) {
        fprintf(stderr, "Failed to enable WAL mode for logs database: %s\n", 
                sqlite3_errmsg(g_db_ctx.logs_db));
    }
    
    // Enable foreign keys
    sqlite3_exec(g_db_ctx.chat_db, "PRAGMA foreign_keys=ON;", NULL, NULL, NULL);
    sqlite3_exec(g_db_ctx.logs_db, "PRAGMA foreign_keys=ON;", NULL, NULL, NULL);
    
    // Create schemas
    if (create_chat_schema(g_db_ctx.chat_db) != 0) {
        fprintf(stderr, "Failed to create chat database schema\n");
        sqlite3_close(g_db_ctx.chat_db);
        sqlite3_close(g_db_ctx.logs_db);
        return -1;
    }
    
    if (create_logs_schema(g_db_ctx.logs_db) != 0) {
        fprintf(stderr, "Failed to create logs database schema\n");
        sqlite3_close(g_db_ctx.chat_db);
        sqlite3_close(g_db_ctx.logs_db);
        return -1;
    }
    
    // Prepare statements
    if (prepare_statements() != 0) {
        fprintf(stderr, "Failed to prepare SQL statements\n");
        cleanup_databases();
        return -1;
    }
    
    g_db_initialized = true;
    printf("Database manager initialized successfully\n");
    return 0;
}

// Create a new message
int create_message(const char *username, const char *message, char *out_timestamp) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (username == NULL || message == NULL || out_timestamp == NULL) {
        fprintf(stderr, "Invalid parameters for create_message\n");
        return -4;
    }
    
    if (strlen(username) == 0 || strlen(username) > MAX_USERNAME_LEN ||
        strlen(message) == 0 || strlen(message) > MAX_MESSAGE_LEN) {
        fprintf(stderr, "Invalid username or message length\n");
        return -4;
    }
    
    // Validate semaphore ownership for write operation
    int ownership_status = validate_semaphore_ownership(username);
    if (ownership_status != 0) {
        return ownership_status;  // Return the specific error code
    }
    
    // Generate timestamp
    char timestamp[MAX_TIMESTAMP_LEN];
    get_current_timestamp(timestamp, sizeof(timestamp));
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_create_message);
    sqlite3_bind_text(g_db_ctx.stmt_create_message, 1, username, -1, SQLITE_STATIC);
    sqlite3_bind_text(g_db_ctx.stmt_create_message, 2, message, -1, SQLITE_STATIC);
    sqlite3_bind_text(g_db_ctx.stmt_create_message, 3, timestamp, -1, SQLITE_STATIC);
    
    // Execute statement
    int result = sqlite3_step(g_db_ctx.stmt_create_message);
    if (result != SQLITE_DONE) {
        fprintf(stderr, "Failed to create message: %s\n", sqlite3_errmsg(g_db_ctx.chat_db));
        return -5;  // Database error
    }
    
    // Copy timestamp to output
    strncpy(out_timestamp, timestamp, MAX_TIMESTAMP_LEN - 1);
    out_timestamp[MAX_TIMESTAMP_LEN - 1] = '\0';
    
    // Log the transaction
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    get_semaphore_status(current_holder, &semaphore_value);
    log_transaction("CREATE", username, message, semaphore_value);
    
    printf("Created message by '%s' at %s\n", username, timestamp);
    return 0;
}

// Update an existing message
int update_message(int id, const char *username, const char *message) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (username == NULL || message == NULL) {
        fprintf(stderr, "Invalid parameters for update_message\n");
        return -4;
    }
    
    if (strlen(username) == 0 || strlen(username) > MAX_USERNAME_LEN ||
        strlen(message) == 0 || strlen(message) > MAX_MESSAGE_LEN) {
        fprintf(stderr, "Invalid username or message length\n");
        return -4;
    }
    
    // Validate semaphore ownership for write operation
    int ownership_status = validate_semaphore_ownership(username);
    if (ownership_status != 0) {
        return ownership_status;  // Return the specific error code
    }
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_update_message);
    sqlite3_bind_text(g_db_ctx.stmt_update_message, 1, message, -1, SQLITE_STATIC);
    sqlite3_bind_int(g_db_ctx.stmt_update_message, 2, id);
    sqlite3_bind_text(g_db_ctx.stmt_update_message, 3, username, -1, SQLITE_STATIC);
    
    // Execute statement
    int result = sqlite3_step(g_db_ctx.stmt_update_message);
    if (result != SQLITE_DONE) {
        fprintf(stderr, "Failed to update message: %s\n", sqlite3_errmsg(g_db_ctx.chat_db));
        return -5;  // Database error
    }
    
    // Check if any rows were affected
    int changes = sqlite3_changes(g_db_ctx.chat_db);
    if (changes == 0) {
        printf("No message found with id %d for user '%s'\n", id, username);
        return -2;  // Permission denied (message not found or not owned)
    }
    
    // Log the transaction
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    get_semaphore_status(current_holder, &semaphore_value);
    char log_content[256];
    snprintf(log_content, sizeof(log_content), "Updated message ID %d", id);
    log_transaction("UPDATE", username, log_content, semaphore_value);
    
    printf("Updated message %d by '%s'\n", id, username);
    return 0;
}

// Delete a message
int delete_message(int id, const char *username) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (username == NULL) {
        fprintf(stderr, "Invalid parameters for delete_message\n");
        return -4;
    }
    
    if (strlen(username) == 0 || strlen(username) > MAX_USERNAME_LEN) {
        fprintf(stderr, "Invalid username length\n");
        return -4;
    }
    
    // Validate semaphore ownership for write operation
    int ownership_status = validate_semaphore_ownership(username);
    if (ownership_status != 0) {
        return ownership_status;  // Return the specific error code
    }
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_delete_message);
    sqlite3_bind_int(g_db_ctx.stmt_delete_message, 1, id);
    sqlite3_bind_text(g_db_ctx.stmt_delete_message, 2, username, -1, SQLITE_STATIC);
    
    // Execute statement
    int result = sqlite3_step(g_db_ctx.stmt_delete_message);
    if (result != SQLITE_DONE) {
        fprintf(stderr, "Failed to delete message: %s\n", sqlite3_errmsg(g_db_ctx.chat_db));
        return -5;  // Database error
    }
    
    // Check if any rows were affected
    int changes = sqlite3_changes(g_db_ctx.chat_db);
    if (changes == 0) {
        printf("No message found with id %d for user '%s'\n", id, username);
        return -2;  // Permission denied (message not found or not owned)
    }
    
    // Log the transaction
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    get_semaphore_status(current_holder, &semaphore_value);
    char log_content[256];
    snprintf(log_content, sizeof(log_content), "Deleted message ID %d", id);
    log_transaction("DELETE", username, log_content, semaphore_value);
    
    printf("Deleted message %d by '%s'\n", id, username);
    return 0;
}

// List messages with pagination
int list_messages(int page, int limit, char *out_json) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (out_json == NULL) {
        fprintf(stderr, "Invalid parameters for list_messages\n");
        return -4;
    }
    
    if (page < 1 || limit < 1 || limit > 100) {
        fprintf(stderr, "Invalid page or limit parameters\n");
        return -4;
    }
    
    int offset = (page - 1) * limit;
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_list_messages);
    sqlite3_bind_int(g_db_ctx.stmt_list_messages, 1, limit);
    sqlite3_bind_int(g_db_ctx.stmt_list_messages, 2, offset);
    
    // Build JSON response
    strcpy(out_json, "{\"messages\":[");
    bool first = true;
    
    while (sqlite3_step(g_db_ctx.stmt_list_messages) == SQLITE_ROW) {
        if (!first) {
            strcat(out_json, ",");
        }
        first = false;
        
        int id = sqlite3_column_int(g_db_ctx.stmt_list_messages, 0);
        const char *username = (const char*)sqlite3_column_text(g_db_ctx.stmt_list_messages, 1);
        const char *message = (const char*)sqlite3_column_text(g_db_ctx.stmt_list_messages, 2);
        const char *created_at = (const char*)sqlite3_column_text(g_db_ctx.stmt_list_messages, 3);
        
        char message_json[4096];
        snprintf(message_json, sizeof(message_json),
                "{\"id\":%d,\"username\":\"%s\",\"message\":\"%s\",\"created_at\":\"%s\"}",
                id, username ? username : "", message ? message : "", created_at ? created_at : "");
        
        strcat(out_json, message_json);
    }
    
    strcat(out_json, "]}");
    
    // Log the read operation
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    get_semaphore_status(current_holder, &semaphore_value);
    char log_content[256];
    snprintf(log_content, sizeof(log_content), "Listed messages (page %d, limit %d)", page, limit);
    log_transaction("READ", NULL, log_content, semaphore_value);
    
    printf("Listed messages (page %d, limit %d)\n", page, limit);
    return 0;
}

// Insert log entry
int insert_log_entry(const char *action, const char *user, const char *content, int semaphore_value) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (action == NULL) {
        fprintf(stderr, "Invalid action for log entry\n");
        return -4;
    }
    
    // Generate timestamp
    char timestamp[MAX_TIMESTAMP_LEN];
    get_current_timestamp(timestamp, sizeof(timestamp));
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_insert_log);
    sqlite3_bind_text(g_db_ctx.stmt_insert_log, 1, timestamp, -1, SQLITE_STATIC);
    sqlite3_bind_text(g_db_ctx.stmt_insert_log, 2, action, -1, SQLITE_STATIC);
    sqlite3_bind_text(g_db_ctx.stmt_insert_log, 3, user, -1, SQLITE_STATIC);
    sqlite3_bind_text(g_db_ctx.stmt_insert_log, 4, content, -1, SQLITE_STATIC);
    sqlite3_bind_int(g_db_ctx.stmt_insert_log, 5, semaphore_value);
    
    // Execute statement
    int result = sqlite3_step(g_db_ctx.stmt_insert_log);
    if (result != SQLITE_DONE) {
        fprintf(stderr, "Failed to insert log entry: %s\n", sqlite3_errmsg(g_db_ctx.logs_db));
        return -5;  // Database error
    }
    
    return 0;
}

// Get logs with pagination
int get_logs(int page, int limit, char *out_json) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (out_json == NULL) {
        fprintf(stderr, "Invalid parameters for get_logs\n");
        return -4;
    }
    
    if (page < 1 || limit < 1 || limit > 100) {
        fprintf(stderr, "Invalid page or limit parameters\n");
        return -4;
    }
    
    int offset = (page - 1) * limit;
    
    // Bind parameters
    sqlite3_reset(g_db_ctx.stmt_get_logs);
    sqlite3_bind_int(g_db_ctx.stmt_get_logs, 1, limit);
    sqlite3_bind_int(g_db_ctx.stmt_get_logs, 2, offset);
    
    // Build JSON response
    strcpy(out_json, "{\"logs\":[");
    bool first = true;
    
    while (sqlite3_step(g_db_ctx.stmt_get_logs) == SQLITE_ROW) {
        if (!first) {
            strcat(out_json, ",");
        }
        first = false;
        
        int id = sqlite3_column_int(g_db_ctx.stmt_get_logs, 0);
        const char *ts = (const char*)sqlite3_column_text(g_db_ctx.stmt_get_logs, 1);
        const char *action = (const char*)sqlite3_column_text(g_db_ctx.stmt_get_logs, 2);
        const char *user = (const char*)sqlite3_column_text(g_db_ctx.stmt_get_logs, 3);
        const char *content = (const char*)sqlite3_column_text(g_db_ctx.stmt_get_logs, 4);
        int semaphore_value = sqlite3_column_int(g_db_ctx.stmt_get_logs, 5);
        
        char log_json[4096];
        snprintf(log_json, sizeof(log_json),
                "{\"id\":%d,\"ts\":\"%s\",\"action\":\"%s\",\"user\":\"%s\",\"content\":\"%s\",\"semaphore\":%d}",
                id, ts ? ts : "", action ? action : "", user ? user : "", 
                content ? content : "", semaphore_value);
        
        strcat(out_json, log_json);
    }
    
    strcat(out_json, "]}");
    
    printf("Retrieved logs (page %d, limit %d)\n", page, limit);
    return 0;
}

// Cleanup database resources
void cleanup_databases(void) {
    if (!g_db_initialized) {
        return;
    }
    
    // Finalize prepared statements
    if (g_db_ctx.stmt_create_message) sqlite3_finalize(g_db_ctx.stmt_create_message);
    if (g_db_ctx.stmt_update_message) sqlite3_finalize(g_db_ctx.stmt_update_message);
    if (g_db_ctx.stmt_delete_message) sqlite3_finalize(g_db_ctx.stmt_delete_message);
    if (g_db_ctx.stmt_list_messages) sqlite3_finalize(g_db_ctx.stmt_list_messages);
    if (g_db_ctx.stmt_insert_log) sqlite3_finalize(g_db_ctx.stmt_insert_log);
    if (g_db_ctx.stmt_get_logs) sqlite3_finalize(g_db_ctx.stmt_get_logs);
    
    // Close databases
    if (g_db_ctx.chat_db) sqlite3_close(g_db_ctx.chat_db);
    if (g_db_ctx.logs_db) sqlite3_close(g_db_ctx.logs_db);
    
    // Clear context
    memset(&g_db_ctx, 0, sizeof(g_db_ctx));
    g_db_initialized = false;
    
    printf("Database manager cleanup complete\n");
}