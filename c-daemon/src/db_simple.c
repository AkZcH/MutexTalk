// Simple File-Based Database Manager Implementation
// Alternative to SQLite for Windows compatibility

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#ifdef _WIN32
    #include <windows.h>
    #include <direct.h>
    #define mkdir(path, mode) _mkdir(path)
#else
    #include <sys/stat.h>
    #include <unistd.h>
#endif

#include "db_simple.h"
#include "semaphore.h"

// Global database context
static bool g_db_initialized = false;
static char g_data_dir[256];
static char g_messages_file[512];
static char g_logs_file[512];

// Generate ISO 8601 timestamp
void get_current_timestamp(char *timestamp, size_t size) {
    time_t now = time(NULL);
    struct tm *utc_tm = gmtime(&now);
    strftime(timestamp, size, "%Y-%m-%dT%H:%M:%S", utc_tm);
}

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

// Initialize databases
int init_databases(const char *chat_db_path, const char *log_db_path) {
    if (g_db_initialized) {
        return 0;  // Already initialized
    }
    
    // Set up data directory
    strcpy(g_data_dir, "../data");
    mkdir(g_data_dir, 0755);
    
    // Set up file paths
    snprintf(g_messages_file, sizeof(g_messages_file), "%s/messages.txt", g_data_dir);
    snprintf(g_logs_file, sizeof(g_logs_file), "%s/logs.txt", g_data_dir);
    
    // Create files if they don't exist
    FILE *f = fopen(g_messages_file, "a");
    if (f) fclose(f);
    
    f = fopen(g_logs_file, "a");
    if (f) fclose(f);
    
    g_db_initialized = true;
    printf("Simple file-based database manager initialized\n");
    printf("Messages file: %s\n", g_messages_file);
    printf("Logs file: %s\n", g_logs_file);
    
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
    
    // Write to messages file
    FILE *f = fopen(g_messages_file, "a");
    if (!f) {
        fprintf(stderr, "Failed to open messages file\n");
        return -5;  // Database error
    }
    
    fprintf(f, "%s|%s|%s\n", timestamp, username, message);
    fclose(f);
    
    // Copy timestamp to output
    strncpy(out_timestamp, timestamp, MAX_TIMESTAMP_LEN - 1);
    out_timestamp[MAX_TIMESTAMP_LEN - 1] = '\0';
    
    // Log the transaction
    insert_log_entry("CREATE", username, message, 0);
    
    printf("Created message by '%s' at %s\n", username, timestamp);
    return 0;
}

// Update an existing message (simplified - just append new version)
int update_message(int id, const char *username, const char *message) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    // Validate semaphore ownership for write operation
    int ownership_status = validate_semaphore_ownership(username);
    if (ownership_status != 0) {
        return ownership_status;
    }
    
    // For simplicity, just create a new message with update prefix
    char updated_message[MAX_MESSAGE_LEN + 50];
    snprintf(updated_message, sizeof(updated_message), "[UPDATED ID:%d] %s", id, message);
    
    char timestamp[MAX_TIMESTAMP_LEN];
    return create_message(username, updated_message, timestamp);
}

// Delete a message (simplified - just log the deletion)
int delete_message(int id, const char *username) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    // Validate semaphore ownership for write operation
    int ownership_status = validate_semaphore_ownership(username);
    if (ownership_status != 0) {
        return ownership_status;
    }
    
    // Log the deletion
    char log_content[256];
    snprintf(log_content, sizeof(log_content), "Deleted message ID %d", id);
    insert_log_entry("DELETE", username, log_content, 0);
    
    printf("Deleted message %d by '%s'\n", id, username);
    return 0;
}

// List messages with pagination (simplified - return last N messages)
int list_messages(int page, int limit, char *out_json) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (out_json == NULL) {
        fprintf(stderr, "Invalid parameters for list_messages\n");
        return -4;
    }
    
    FILE *f = fopen(g_messages_file, "r");
    if (!f) {
        strcpy(out_json, "{\"messages\":[]}");
        return 0;
    }
    
    // Simple implementation - just return a few recent messages
    strcpy(out_json, "{\"messages\":[");
    
    char line[2048];
    int count = 0;
    bool first = true;
    
    while (fgets(line, sizeof(line), f) && count < limit) {
        // Parse line: timestamp|username|message
        char *timestamp = strtok(line, "|");
        char *username = strtok(NULL, "|");
        char *message = strtok(NULL, "\n");
        
        if (timestamp && username && message) {
            if (!first) {
                strcat(out_json, ",");
            }
            first = false;
            
            char message_json[4096];
            snprintf(message_json, sizeof(message_json),
                    "{\"id\":%d,\"username\":\"%s\",\"message\":\"%s\",\"created_at\":\"%s\"}",
                    count + 1, username, message, timestamp);
            
            strcat(out_json, message_json);
            count++;
        }
    }
    
    strcat(out_json, "]}");
    fclose(f);
    
    printf("Listed messages (page %d, limit %d)\n", page, limit);
    return 0;
}

// Insert log entry
int insert_log_entry(const char *action, const char *user, const char *content, int semaphore_value) {
    if (!g_db_initialized) {
        return -1;
    }
    
    if (action == NULL) {
        return -4;
    }
    
    // Generate timestamp
    char timestamp[MAX_TIMESTAMP_LEN];
    get_current_timestamp(timestamp, sizeof(timestamp));
    
    // Write to logs file
    FILE *f = fopen(g_logs_file, "a");
    if (!f) {
        return -5;
    }
    
    fprintf(f, "%s|%s|%s|%s|%d\n", 
            timestamp, 
            action, 
            user ? user : "NULL", 
            content ? content : "NULL", 
            semaphore_value);
    fclose(f);
    
    return 0;
}

// Get logs with pagination
int get_logs(int page, int limit, char *out_json) {
    if (!g_db_initialized) {
        fprintf(stderr, "Database not initialized\n");
        return -1;
    }
    
    if (out_json == NULL) {
        return -4;
    }
    
    FILE *f = fopen(g_logs_file, "r");
    if (!f) {
        strcpy(out_json, "{\"logs\":[]}");
        return 0;
    }
    
    strcpy(out_json, "{\"logs\":[");
    
    char line[2048];
    int count = 0;
    bool first = true;
    
    while (fgets(line, sizeof(line), f) && count < limit) {
        // Parse line: timestamp|action|user|content|semaphore_value
        char *timestamp = strtok(line, "|");
        char *action = strtok(NULL, "|");
        char *user = strtok(NULL, "|");
        char *content = strtok(NULL, "|");
        char *sem_val_str = strtok(NULL, "\n");
        
        if (timestamp && action && user && content && sem_val_str) {
            if (!first) {
                strcat(out_json, ",");
            }
            first = false;
            
            int sem_val = atoi(sem_val_str);
            char log_json[4096];
            snprintf(log_json, sizeof(log_json),
                    "{\"id\":%d,\"ts\":\"%s\",\"action\":\"%s\",\"user\":\"%s\",\"content\":\"%s\",\"semaphore\":%d}",
                    count + 1, timestamp, action, 
                    strcmp(user, "NULL") == 0 ? "" : user,
                    strcmp(content, "NULL") == 0 ? "" : content,
                    sem_val);
            
            strcat(out_json, log_json);
            count++;
        }
    }
    
    strcat(out_json, "]}");
    fclose(f);
    
    printf("Retrieved logs (page %d, limit %d)\n", page, limit);
    return 0;
}

// Cleanup database resources
void cleanup_databases(void) {
    if (!g_db_initialized) {
        return;
    }
    
    g_db_initialized = false;
    printf("Simple database manager cleanup complete\n");
}