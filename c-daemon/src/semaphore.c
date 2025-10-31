// Binary Semaphore Manager Implementation
// Cross-platform mutex implementation for write operations

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
    #include <windows.h>
    typedef CRITICAL_SECTION mutex_t;
    #define mutex_init(m) InitializeCriticalSection(m)
    #define mutex_destroy(m) DeleteCriticalSection(m)
    #define mutex_lock(m) EnterCriticalSection(m)
    #define mutex_unlock(m) LeaveCriticalSection(m)
    #define mutex_trylock(m) (TryEnterCriticalSection(m) ? 0 : 1)
#else
    #include <pthread.h>
    typedef pthread_mutex_t mutex_t;
    #define mutex_init(m) pthread_mutex_init(m, NULL)
    #define mutex_destroy(m) pthread_mutex_destroy(m)
    #define mutex_lock(m) pthread_mutex_lock(m)
    #define mutex_unlock(m) pthread_mutex_unlock(m)
    #define mutex_trylock(m) pthread_mutex_trylock(m)
#endif

#include "semaphore.h"

// Global semaphore state
static semaphore_state_t g_semaphore_state;
static bool g_initialized = false;

// Initialize the semaphore system
int init_semaphore(void) {
    if (g_initialized) {
        return 0;  // Already initialized
    }
    
    // Initialize mutexes
    mutex_init(&g_semaphore_state.write_mutex);
    mutex_init(&g_semaphore_state.admin_mutex);
    
    // Initialize state
    memset(g_semaphore_state.current_holder, 0, sizeof(g_semaphore_state.current_holder));
    g_semaphore_state.writer_enabled = true;  // Writers enabled by default
    
    g_initialized = true;
    
    printf("Semaphore manager initialized successfully\n");
    return 0;
}

// Attempt to acquire writer semaphore (non-blocking)
int try_acquire_writer(const char *username) {
    if (!g_initialized) {
        fprintf(stderr, "Semaphore not initialized\n");
        return -1;
    }
    
    if (username == NULL || strlen(username) == 0) {
        fprintf(stderr, "Invalid username provided\n");
        return -4;  // Invalid input
    }
    
    if (strlen(username) >= MAX_USERNAME_LEN) {
        fprintf(stderr, "Username too long\n");
        return -4;  // Invalid input
    }
    
    // Check if writers are globally enabled
    mutex_lock(&g_semaphore_state.admin_mutex);
    bool writers_enabled = g_semaphore_state.writer_enabled;
    mutex_unlock(&g_semaphore_state.admin_mutex);
    
    if (!writers_enabled) {
        printf("Writer access is globally disabled\n");
        return -2;  // Permission denied
    }
    
    // Try to acquire the write mutex (non-blocking)
    int result = mutex_trylock(&g_semaphore_state.write_mutex);
    
    if (result == 0) {
        // Successfully acquired the mutex
        strncpy(g_semaphore_state.current_holder, username, MAX_USERNAME_LEN - 1);
        g_semaphore_state.current_holder[MAX_USERNAME_LEN - 1] = '\0';
        
        printf("User '%s' acquired writer semaphore\n", username);
        return 0;  // Success
    } else {
        // Mutex is already locked
        printf("Writer semaphore unavailable (held by '%s')\n", g_semaphore_state.current_holder);
        return -3;  // Resource unavailable
    }
}

// Release writer semaphore with ownership validation
int release_writer(const char *username) {
    if (!g_initialized) {
        fprintf(stderr, "Semaphore not initialized\n");
        return -1;
    }
    
    if (username == NULL || strlen(username) == 0) {
        fprintf(stderr, "Invalid username provided\n");
        return -4;  // Invalid input
    }
    
    // Validate ownership
    if (strcmp(g_semaphore_state.current_holder, username) != 0) {
        printf("User '%s' cannot release semaphore held by '%s'\n", 
               username, g_semaphore_state.current_holder);
        return -2;  // Permission denied
    }
    
    // Clear the current holder
    memset(g_semaphore_state.current_holder, 0, sizeof(g_semaphore_state.current_holder));
    
    // Release the mutex
    mutex_unlock(&g_semaphore_state.write_mutex);
    
    printf("User '%s' released writer semaphore\n", username);
    return 0;  // Success
}

// Get current semaphore status
int get_semaphore_status(char *holder, int *value) {
    if (!g_initialized) {
        fprintf(stderr, "Semaphore not initialized\n");
        return -1;
    }
    
    if (holder == NULL || value == NULL) {
        fprintf(stderr, "Invalid parameters provided\n");
        return -4;  // Invalid input
    }
    
    // Check if there's a current holder
    if (g_semaphore_state.current_holder[0] != '\0') {
        // Semaphore is held
        *value = 0;  // Locked
        strncpy(holder, g_semaphore_state.current_holder, MAX_USERNAME_LEN - 1);
        holder[MAX_USERNAME_LEN - 1] = '\0';
    } else {
        // Semaphore is available
        *value = 1;  // Available
        strcpy(holder, "");  // No current holder
    }
    
    return 0;  // Success
}

// Admin function to toggle writer access globally
int admin_toggle_writer(bool enabled, const char *admin_user) {
    if (!g_initialized) {
        fprintf(stderr, "Semaphore not initialized\n");
        return -1;
    }
    
    if (admin_user == NULL || strlen(admin_user) == 0) {
        fprintf(stderr, "Invalid admin username provided\n");
        return -4;  // Invalid input
    }
    
    // Lock admin mutex to modify global state
    mutex_lock(&g_semaphore_state.admin_mutex);
    
    bool previous_state = g_semaphore_state.writer_enabled;
    g_semaphore_state.writer_enabled = enabled;
    
    mutex_unlock(&g_semaphore_state.admin_mutex);
    
    printf("Admin '%s' %s writer access (was %s)\n", 
           admin_user,
           enabled ? "enabled" : "disabled",
           previous_state ? "enabled" : "disabled");
    
    return 0;  // Success
}

// Cleanup semaphore resources
void cleanup_semaphore(void) {
    if (!g_initialized) {
        return;
    }
    
    // Force release if someone is holding the semaphore
    if (g_semaphore_state.current_holder[0] != '\0') {
        printf("Forcing release of semaphore held by '%s' during cleanup\n", 
               g_semaphore_state.current_holder);
        
        // Clear holder
        memset(g_semaphore_state.current_holder, 0, sizeof(g_semaphore_state.current_holder));
        
        // Unlock the mutex
        mutex_unlock(&g_semaphore_state.write_mutex);
    }
    
    // Destroy mutexes
    mutex_destroy(&g_semaphore_state.write_mutex);
    mutex_destroy(&g_semaphore_state.admin_mutex);
    
    g_initialized = false;
    
    printf("Semaphore manager cleanup complete\n");
}