// Admin Operations Implementation
// Handles administrative functions including log access

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "admin.h"
#include "db.h"
#include "semaphore.h"
#include "logger.h"

// Simple admin user validation (in production, this would use proper authentication)
// For now, we'll use a simple hardcoded list
static const char* admin_users[] = {
    "admin",
    "administrator", 
    "root",
    "sysadmin",
    NULL  // Sentinel value
};

// Check if a user has admin privileges
bool is_admin_user(const char *username) {
    if (username == NULL || strlen(username) == 0) {
        return false;
    }
    
    for (int i = 0; admin_users[i] != NULL; i++) {
        if (strcmp(username, admin_users[i]) == 0) {
            return true;
        }
    }
    
    return false;
}

// Admin function to retrieve transaction logs with pagination
int admin_get_logs(const char *admin_user, int page, int limit, char *out_json) {
    if (admin_user == NULL || out_json == NULL) {
        fprintf(stderr, "Invalid parameters for admin_get_logs\n");
        return -4;  // Invalid input
    }
    
    if (strlen(admin_user) == 0 || strlen(admin_user) >= MAX_ADMIN_USERNAME_LEN) {
        fprintf(stderr, "Invalid admin username length\n");
        return -4;  // Invalid input
    }
    
    // Validate admin privileges
    if (!is_admin_user(admin_user)) {
        fprintf(stderr, "User '%s' does not have admin privileges\n", admin_user);
        return -2;  // Permission denied
    }
    
    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
        fprintf(stderr, "Invalid pagination parameters (page: %d, limit: %d)\n", page, limit);
        return -4;  // Invalid input
    }
    
    // Call the database function to get logs
    int result = get_logs(page, limit, out_json);
    if (result != 0) {
        fprintf(stderr, "Failed to retrieve logs from database\n");
        return result;
    }
    
    // Log the admin action
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    get_semaphore_status(current_holder, &semaphore_value);
    
    char log_content[256];
    snprintf(log_content, sizeof(log_content), 
             "Admin accessed logs (page %d, limit %d)", page, limit);
    log_transaction("ADMIN_ACTION", admin_user, log_content, semaphore_value);
    
    printf("Admin '%s' retrieved logs (page %d, limit %d)\n", admin_user, page, limit);
    return 0;
}

// Admin function to get system status including semaphore state
int admin_get_system_status(const char *admin_user, char *out_json) {
    if (admin_user == NULL || out_json == NULL) {
        fprintf(stderr, "Invalid parameters for admin_get_system_status\n");
        return -4;  // Invalid input
    }
    
    if (strlen(admin_user) == 0 || strlen(admin_user) >= MAX_ADMIN_USERNAME_LEN) {
        fprintf(stderr, "Invalid admin username length\n");
        return -4;  // Invalid input
    }
    
    // Validate admin privileges
    if (!is_admin_user(admin_user)) {
        fprintf(stderr, "User '%s' does not have admin privileges\n", admin_user);
        return -2;  // Permission denied
    }
    
    // Get semaphore status
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    int status_result = get_semaphore_status(current_holder, &semaphore_value);
    
    if (status_result != 0) {
        fprintf(stderr, "Failed to get semaphore status\n");
        return -1;  // General error
    }
    
    // Get current timestamp
    time_t now = time(NULL);
    struct tm *utc_tm = gmtime(&now);
    char timestamp[64];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%dT%H:%M:%SZ", utc_tm);
    
    // Build JSON response
    snprintf(out_json, MAX_JSON_LEN,
             "{"
             "\"timestamp\":\"%s\","
             "\"semaphore\":{"
             "\"value\":%d,"
             "\"holder\":\"%s\","
             "\"available\":%s"
             "},"
             "\"system\":{"
             "\"status\":\"running\","
             "\"admin_user\":\"%s\""
             "}"
             "}",
             timestamp,
             semaphore_value,
             current_holder,
             semaphore_value == 1 ? "true" : "false",
             admin_user);
    
    // Log the admin action
    log_transaction("ADMIN_ACTION", admin_user, "Retrieved system status", semaphore_value);
    
    printf("Admin '%s' retrieved system status\n", admin_user);
    return 0;
}

// Admin function to force release semaphore (emergency use)
int admin_force_release_semaphore(const char *admin_user) {
    if (admin_user == NULL) {
        fprintf(stderr, "Invalid admin user for force release\n");
        return -4;  // Invalid input
    }
    
    if (strlen(admin_user) == 0 || strlen(admin_user) >= MAX_ADMIN_USERNAME_LEN) {
        fprintf(stderr, "Invalid admin username length\n");
        return -4;  // Invalid input
    }
    
    // Validate admin privileges
    if (!is_admin_user(admin_user)) {
        fprintf(stderr, "User '%s' does not have admin privileges\n", admin_user);
        return -2;  // Permission denied
    }
    
    // Get current semaphore status
    char current_holder[MAX_USERNAME_LEN];
    int semaphore_value;
    int status_result = get_semaphore_status(current_holder, &semaphore_value);
    
    if (status_result != 0) {
        fprintf(stderr, "Failed to get semaphore status\n");
        return -1;  // General error
    }
    
    // Check if semaphore is actually held
    if (semaphore_value == 1) {
        printf("Semaphore is not currently held, no action needed\n");
        return 0;  // Success (no-op)
    }
    
    printf("Admin '%s' forcing release of semaphore held by '%s'\n", 
           admin_user, current_holder);
    
    // Log the forced release action
    char log_content[256];
    snprintf(log_content, sizeof(log_content), 
             "Admin forced release of semaphore from user '%s'", current_holder);
    log_transaction("ADMIN_ACTION", admin_user, log_content, 0);
    
    // Force release by calling the release function with the current holder's name
    // This is a bit of a hack, but it ensures proper cleanup
    int release_result = release_writer(current_holder);
    
    if (release_result != 0) {
        fprintf(stderr, "Failed to force release semaphore\n");
        return -1;  // General error
    }
    
    printf("Semaphore successfully force-released by admin '%s'\n", admin_user);
    return 0;
}