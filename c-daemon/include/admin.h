// Admin Operations Header
// Handles administrative functions including log access

#ifndef ADMIN_H
#define ADMIN_H

#include <stdbool.h>

#define MAX_ADMIN_USERNAME_LEN 64

// Admin function declarations
int admin_get_logs(const char *admin_user, int page, int limit, char *out_json);
int admin_get_system_status(const char *admin_user, char *out_json);
bool is_admin_user(const char *username);
int admin_force_release_semaphore(const char *admin_user);

#endif // ADMIN_H