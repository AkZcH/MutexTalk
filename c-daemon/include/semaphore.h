// Binary Semaphore Manager Header
// Cross-platform mutex implementation for write operations

#ifndef SEMAPHORE_H
#define SEMAPHORE_H

#include <stdbool.h>

#ifdef _WIN32
    #include <windows.h>
    typedef CRITICAL_SECTION mutex_t;
#else
    #include <pthread.h>
    typedef pthread_mutex_t mutex_t;
#endif

#define MAX_USERNAME_LEN 64

// Semaphore state structure
typedef struct {
    mutex_t write_mutex;                      // Binary semaphore implementation
    mutex_t admin_mutex;                      // Protects admin operations
    char current_holder[MAX_USERNAME_LEN];    // Current semaphore holder
    bool writer_enabled;                      // Global writer toggle (admin control)
} semaphore_state_t;

// Function declarations
int init_semaphore(void);
int try_acquire_writer(const char *username);
int release_writer(const char *username);
int get_semaphore_status(char *holder, int *value);
int admin_toggle_writer(bool enabled, const char *admin_user);
void cleanup_semaphore(void);

#endif // SEMAPHORE_H