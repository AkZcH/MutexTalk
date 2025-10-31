// Simple Database Manager Header
// File-based database operations without SQLite dependency

#ifndef DB_SIMPLE_H
#define DB_SIMPLE_H

#include <stdbool.h>

#define MAX_MESSAGE_LEN 2000
#define MAX_USERNAME_LEN 64
#define MAX_TIMESTAMP_LEN 32
#define MAX_JSON_LEN 8192

// Function declarations
int init_databases(const char *chat_db_path, const char *log_db_path);
int create_message(const char *username, const char *message, char *out_timestamp);
int update_message(int id, const char *username, const char *message);
int delete_message(int id, const char *username);
int list_messages(int page, int limit, char *out_json);
int get_logs(int page, int limit, char *out_json);
int insert_log_entry(const char *action, const char *user, const char *content, int semaphore_value);
void cleanup_databases(void);

#endif // DB_SIMPLE_H