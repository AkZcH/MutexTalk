// Transaction Logger Implementation
// Handles dual logging (database + file) for all operations

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <errno.h>

#ifdef _WIN32
    #include <io.h>
    #include <fcntl.h>
    #include <sys/stat.h>
    #define F_OK 0
    #define access _access
#else
    #include <unistd.h>
    #include <sys/stat.h>
#endif

#include "logger.h"
#include "db.h"
#include "semaphore.h"

// Global logger context
static FILE *log_file = NULL;
static char log_file_path[512];
static bool logger_initialized = false;

// Generate ISO 8601 timestamp for logging
void get_log_timestamp(char *timestamp, size_t size) {
    time_t now = time(NULL);
    struct tm *utc_tm = gmtime(&now);
    strftime(timestamp, size, "%Y-%m-%dT%H:%M:%SZ", utc_tm);
}

// Initialize logger with file path
int init_logger(const char *log_file_path_param) {
    if (logger_initialized) {
        return 0;  // Already initialized
    }
    
    if (log_file_path_param == NULL) {
        fprintf(stderr, "Invalid log file path\n");
        return -1;
    }
    
    // Store log file path
    strncpy(log_file_path, log_file_path_param, sizeof(log_file_path) - 1);
    log_file_path[sizeof(log_file_path) - 1] = '\0';
    
    // Open log file in append mode
    log_file = fopen(log_file_path, "a");
    if (log_file == NULL) {
        fprintf(stderr, "Failed to open log file '%s': %s\n", 
                log_file_path, strerror(errno));
        return -1;
    }
    
    // Set proper file permissions (0600 - owner read/write only)
#ifdef _WIN32
    // Windows doesn't have the same permission model, but we can try to restrict access
    if (_chmod(log_file_path, _S_IREAD | _S_IWRITE) != 0) {
        fprintf(stderr, "Warning: Could not set file permissions on '%s'\n", log_file_path);
    }
#else
    if (chmod(log_file_path, 0600) != 0) {
        fprintf(stderr, "Warning: Could not set file permissions on '%s': %s\n", 
                log_file_path, strerror(errno));
    }
#endif
    
    // Write initialization log entry
    char timestamp[64];
    get_log_timestamp(timestamp, sizeof(timestamp));
    
    fprintf(log_file, "{\"ts\": \"%s\", \"action\": \"LOGGER_INIT\", "
                     "\"user\": null, \"content\": \"Transaction logger initialized\", "
                     "\"semaphore\": 1}\n", timestamp);
    fflush(log_file);
    
    logger_initialized = true;
    printf("Transaction logger initialized: %s\n", log_file_path);
    return 0;
}

// Log a transaction to both database and file
void log_transaction(const char *action, const char *user, 
                    const char *content, int semaphore_value) {
    if (!logger_initialized) {
        fprintf(stderr, "Logger not initialized\n");
        return;
    }
    
    if (action == NULL) {
        fprintf(stderr, "Invalid action for log_transaction\n");
        return;
    }
    
    // Validate semaphore_value
    if (semaphore_value != 0 && semaphore_value != 1) {
        fprintf(stderr, "Invalid semaphore value: %d (must be 0 or 1)\n", semaphore_value);
        return;
    }
    
    char timestamp[64];
    get_log_timestamp(timestamp, sizeof(timestamp));
    
    // Log to database (if database is initialized)
    if (insert_log_entry(action, user, content, semaphore_value) != 0) {
        fprintf(stderr, "Failed to log transaction to database\n");
        // Continue with file logging even if database logging fails
    }
    
    // Log to file in structured JSON format
    if (log_file != NULL) {
        fprintf(log_file, "{\"ts\": \"%s\", \"action\": \"%s\", "
                         "\"user\": %s%s%s, \"content\": %s%s%s, \"semaphore\": %d}\n",
                timestamp, 
                action,
                user ? "\"" : "null",
                user ? user : "",
                user ? "\"" : "",
                content ? "\"" : "null",
                content ? content : "",
                content ? "\"" : "",
                semaphore_value);
        fflush(log_file);  // Ensure immediate write
    }
}

// Log semaphore-specific events
void log_semaphore_event(const char *action, const char *user, int value) {
    if (!logger_initialized) {
        fprintf(stderr, "Logger not initialized\n");
        return;
    }
    
    if (action == NULL) {
        fprintf(stderr, "Invalid action for log_semaphore_event\n");
        return;
    }
    
    // Validate semaphore value
    if (value != 0 && value != 1) {
        fprintf(stderr, "Invalid semaphore value: %d (must be 0 or 1)\n", value);
        return;
    }
    
    char content[256];
    if (strcmp(action, "ACQUIRE_MUTEX") == 0) {
        snprintf(content, sizeof(content), "User '%s' acquired semaphore", 
                user ? user : "unknown");
    } else if (strcmp(action, "RELEASE_MUTEX") == 0) {
        snprintf(content, sizeof(content), "User '%s' released semaphore", 
                user ? user : "unknown");
    } else {
        snprintf(content, sizeof(content), "Semaphore event: %s", action);
    }
    
    log_transaction(action, user, content, value);
}

// Cleanup logger resources
void cleanup_logger(void) {
    if (!logger_initialized) {
        return;
    }
    
    if (log_file != NULL) {
        // Write shutdown log entry
        char timestamp[64];
        get_log_timestamp(timestamp, sizeof(timestamp));
        
        fprintf(log_file, "{\"ts\": \"%s\", \"action\": \"LOGGER_SHUTDOWN\", "
                         "\"user\": null, \"content\": \"Transaction logger shutting down\", "
                         "\"semaphore\": 1}\n", timestamp);
        fflush(log_file);
        
        fclose(log_file);
        log_file = NULL;
    }
    
    logger_initialized = false;
    printf("Transaction logger cleanup complete\n");
}