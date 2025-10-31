// Database Manager Header
// Handles SQLite operations for chat and logs databases

#ifndef DB_H
#define DB_H

#include <sqlite3.h>

#define MAX_MESSAGE_LEN 2000
#define MAX_USERNAME_LEN 64
#define MAX_TIMESTAMP_LEN 32
#define MAX_JSON_LEN 8192

// Database connection structure
typedef struct {
    sqlite3 *chat_db;
    sqlite3 *logs_db;
    
    // Prepared statements for chat operations
    sqlite3_stmt *stmt_create_message;
    sqlite3_stmt *stmt_update_message;
    sqlite3_stmt *stmt_delete_message;
    sqlite3_stmt *stmt_list_messages;
    
    // Prepared statements for log operations
    sqlite3_stmt *stmt_insert_log;
    sqlite3_stmt *stmt_get_logs;
} db_context_t;

// Function declarations
int init_databases(const char *chat_db_path, const char *log_db_path);
int create_message(const char *username, const char *message, char *out_timestamp);
int update_message(int id, const char *username, const char *message);
int delete_message(int id, const char *username);
int list_messages(int page, int limit, char *out_json);
int get_logs(int page, int limit, char *out_json);
int insert_log_entry(const char *action, const char *user, const char *content, int semaphore_value);
void cleanup_databases(void);

#endif // DB_H