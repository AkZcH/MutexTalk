// Transaction Logger Header
// Handles dual logging (database + file) for all operations

#ifndef LOGGER_H
#define LOGGER_H

#include <stdbool.h>

// Function declarations
int init_logger(const char *log_file_path);
void log_transaction(const char *action, const char *user, 
                    const char *content, int semaphore_value);
void log_semaphore_event(const char *action, const char *user, int value);
void cleanup_logger(void);

#endif // LOGGER_H