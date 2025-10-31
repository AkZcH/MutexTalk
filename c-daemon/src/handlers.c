// Command Handler Implementation
// Implements JSON command parsing and execution using cJSON library

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <cjson/cjson.h>

#include "handlers.h"
#include "semaphore.h"
#include "db.h"
#include "logger.h"

// Command structure for parsed JSON commands
typedef struct {
    command_type_t type;
    char user[MAX_USERNAME_LEN];
    char message[MAX_MESSAGE_LEN];
    int id;
    int page;
    int limit;
    bool enabled;
} command_t;

// Response structure for command results
typedef struct {
    int status;                    // 0 = success, negative = error
    char error[256];              // Error message if status != 0
    char data[MAX_JSON_LEN];      // JSON response data
} response_t;

// Parse JSON command string into command structure
int parse_json_command(const char *input, command_t *cmd) {
    if (input == NULL || cmd == NULL) {
        fprintf(stderr, "Invalid parameters for parse_json_command\n");
        return -4;
    }
    
    // Initialize command structure
    memset(cmd, 0, sizeof(command_t));
    cmd->page = 1;      // Default page
    cmd->limit = 50;    // Default limit
    
    // Parse JSON
    cJSON *json = cJSON_Parse(input);
    if (json == NULL) {
        fprintf(stderr, "Failed to parse JSON: %s\n", cJSON_GetErrorPtr());
        return -4;  // Invalid input
    }
    
    // Extract action (required)
    cJSON *action_item = cJSON_GetObjectItem(json, "action");
    if (!cJSON_IsString(action_item)) {
        fprintf(stderr, "Missing or invalid 'action' field\n");
        cJSON_Delete(json);
        return -4;
    }
    
    const char *action = action_item->valuestring;
    
    // Map action string to command type
    if (strcmp(action, "TRY_ACQUIRE") == 0) {
        cmd->type = CMD_TRY_ACQUIRE;
    } else if (strcmp(action, "RELEASE") == 0) {
        cmd->type = CMD_RELEASE;
    } else if (strcmp(action, "CREATE") == 0) {
        cmd->type = CMD_CREATE_MESSAGE;
    } else if (strcmp(action, "UPDATE") == 0) {
        cmd->type = CMD_UPDATE_MESSAGE;
    } else if (strcmp(action, "DELETE") == 0) {
        cmd->type = CMD_DELETE_MESSAGE;
    } else if (strcmp(action, "LIST") == 0) {
        cmd->type = CMD_LIST_MESSAGES;
    } else if (strcmp(action, "STATUS") == 0) {
        cmd->type = CMD_GET_STATUS;
    } else if (strcmp(action, "LOGS") == 0) {
        cmd->type = CMD_GET_LOGS;
    } else if (strcmp(action, "TOGGLE") == 0) {
        cmd->type = CMD_TOGGLE_WRITER;
    } else {
        fprintf(stderr, "Unknown action: %s\n", action);
        cJSON_Delete(json);
        return -4;
    }
    
    // Extract user (optional for some commands)
    cJSON *user_item = cJSON_GetObjectItem(json, "user");
    if (cJSON_IsString(user_item)) {
        strncpy(cmd->user, user_item->valuestring, MAX_USERNAME_LEN - 1);
        cmd->user[MAX_USERNAME_LEN - 1] = '\0';
    }
    
    // Extract message (for CREATE and UPDATE commands)
    cJSON *message_item = cJSON_GetObjectItem(json, "message");
    if (cJSON_IsString(message_item)) {
        strncpy(cmd->message, message_item->valuestring, MAX_MESSAGE_LEN - 1);
        cmd->message[MAX_MESSAGE_LEN - 1] = '\0';
    }
    
    // Extract id (for UPDATE and DELETE commands)
    cJSON *id_item = cJSON_GetObjectItem(json, "id");
    if (cJSON_IsNumber(id_item)) {
        cmd->id = id_item->valueint;
    }
    
    // Extract page (for LIST and LOGS commands)
    cJSON *page_item = cJSON_GetObjectItem(json, "page");
    if (cJSON_IsNumber(page_item)) {
        cmd->page = page_item->valueint;
        if (cmd->page < 1) cmd->page = 1;
    }
    
    // Extract limit (for LIST and LOGS commands)
    cJSON *limit_item = cJSON_GetObjectItem(json, "limit");
    if (cJSON_IsNumber(limit_item)) {
        cmd->limit = limit_item->valueint;
        if (cmd->limit < 1) cmd->limit = 1;
        if (cmd->limit > 100) cmd->limit = 100;
    }
    
    // Extract enabled (for TOGGLE command)
    cJSON *enabled_item = cJSON_GetObjectItem(json, "enabled");
    if (cJSON_IsBool(enabled_item)) {
        cmd->enabled = cJSON_IsTrue(enabled_item);
    }
    
    cJSON_Delete(json);
    return 0;
}

// Execute a parsed command and generate response
int execute_command(const command_t *cmd, response_t *resp) {
    if (cmd == NULL || resp == NULL) {
        fprintf(stderr, "Invalid parameters for execute_command\n");
        return -4;
    }
    
    // Initialize response
    memset(resp, 0, sizeof(response_t));
    
    switch (cmd->type) {
        case CMD_TRY_ACQUIRE: {
            if (strlen(cmd->user) == 0) {
                resp->status = -4;
                strcpy(resp->error, "Username required for TRY_ACQUIRE");
                return resp->status;
            }
            
            resp->status = try_acquire_writer(cmd->user);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"semaphore\":0,\"holder\":\"%s\"}", cmd->user);
            } else if (resp->status == -3) {
                char current_holder[MAX_USERNAME_LEN];
                int semaphore_value;
                get_semaphore_status(current_holder, &semaphore_value);
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"semaphore\":%d,\"holder\":\"%s\"}", 
                        semaphore_value, current_holder);
                strcpy(resp->error, "Semaphore unavailable");
            } else if (resp->status == -2) {
                strcpy(resp->error, "Writer access disabled");
            } else {
                strcpy(resp->error, "Failed to acquire semaphore");
            }
            break;
        }
        
        case CMD_RELEASE: {
            if (strlen(cmd->user) == 0) {
                resp->status = -4;
                strcpy(resp->error, "Username required for RELEASE");
                return resp->status;
            }
            
            resp->status = release_writer(cmd->user);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"semaphore\":1,\"holder\":\"\"}");
            } else if (resp->status == -2) {
                strcpy(resp->error, "Permission denied - not semaphore holder");
            } else {
                strcpy(resp->error, "Failed to release semaphore");
            }
            break;
        }
        
        case CMD_CREATE_MESSAGE: {
            if (strlen(cmd->user) == 0 || strlen(cmd->message) == 0) {
                resp->status = -4;
                strcpy(resp->error, "Username and message required for CREATE");
                return resp->status;
            }
            
            char timestamp[MAX_TIMESTAMP_LEN];
            resp->status = create_message(cmd->user, cmd->message, timestamp);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"timestamp\":\"%s\"}", timestamp);
            } else if (resp->status == -2) {
                strcpy(resp->error, "Permission denied - semaphore not held");
            } else if (resp->status == -5) {
                strcpy(resp->error, "Database error");
            } else {
                strcpy(resp->error, "Failed to create message");
            }
            break;
        }
        
        case CMD_UPDATE_MESSAGE: {
            if (strlen(cmd->user) == 0 || strlen(cmd->message) == 0 || cmd->id <= 0) {
                resp->status = -4;
                strcpy(resp->error, "Username, message, and valid ID required for UPDATE");
                return resp->status;
            }
            
            resp->status = update_message(cmd->id, cmd->user, cmd->message);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"id\":%d}", cmd->id);
            } else if (resp->status == -2) {
                strcpy(resp->error, "Permission denied - message not found or not owned");
            } else if (resp->status == -5) {
                strcpy(resp->error, "Database error");
            } else {
                strcpy(resp->error, "Failed to update message");
            }
            break;
        }
        
        case CMD_DELETE_MESSAGE: {
            if (strlen(cmd->user) == 0 || cmd->id <= 0) {
                resp->status = -4;
                strcpy(resp->error, "Username and valid ID required for DELETE");
                return resp->status;
            }
            
            resp->status = delete_message(cmd->id, cmd->user);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"id\":%d}", cmd->id);
            } else if (resp->status == -2) {
                strcpy(resp->error, "Permission denied - message not found or not owned");
            } else if (resp->status == -5) {
                strcpy(resp->error, "Database error");
            } else {
                strcpy(resp->error, "Failed to delete message");
            }
            break;
        }
        
        case CMD_LIST_MESSAGES: {
            resp->status = list_messages(cmd->page, cmd->limit, resp->data);
            if (resp->status != 0) {
                if (resp->status == -4) {
                    strcpy(resp->error, "Invalid page or limit parameters");
                } else if (resp->status == -5) {
                    strcpy(resp->error, "Database error");
                } else {
                    strcpy(resp->error, "Failed to list messages");
                }
            }
            break;
        }
        
        case CMD_GET_STATUS: {
            char current_holder[MAX_USERNAME_LEN];
            int semaphore_value;
            resp->status = get_semaphore_status(current_holder, &semaphore_value);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"semaphore\":%d,\"holder\":\"%s\"}", 
                        semaphore_value, current_holder);
            } else {
                strcpy(resp->error, "Failed to get semaphore status");
            }
            break;
        }
        
        case CMD_GET_LOGS: {
            resp->status = get_logs(cmd->page, cmd->limit, resp->data);
            if (resp->status != 0) {
                if (resp->status == -4) {
                    strcpy(resp->error, "Invalid page or limit parameters");
                } else if (resp->status == -5) {
                    strcpy(resp->error, "Database error");
                } else {
                    strcpy(resp->error, "Failed to get logs");
                }
            }
            break;
        }
        
        case CMD_TOGGLE_WRITER: {
            if (strlen(cmd->user) == 0) {
                resp->status = -4;
                strcpy(resp->error, "Username required for TOGGLE");
                return resp->status;
            }
            
            resp->status = admin_toggle_writer(cmd->enabled, cmd->user);
            if (resp->status == 0) {
                snprintf(resp->data, sizeof(resp->data), 
                        "{\"writer_enabled\":%s}", cmd->enabled ? "true" : "false");
            } else {
                strcpy(resp->error, "Failed to toggle writer access");
            }
            break;
        }
        
        default:
            resp->status = -4;
            strcpy(resp->error, "Unknown command type");
            break;
    }
    
    return resp->status;
}

// Main command handler function - parses JSON input and generates JSON output
int handle_command(const char *json_input, char *json_output) {
    if (json_input == NULL || json_output == NULL) {
        fprintf(stderr, "Invalid parameters for handle_command\n");
        return -4;
    }
    
    command_t cmd;
    response_t resp;
    
    // Parse the JSON command
    int parse_result = parse_json_command(json_input, &cmd);
    if (parse_result != 0) {
        // Generate error response for parsing failure
        snprintf(json_output, MAX_JSON_LEN, 
                "{\"status\":\"ERROR\",\"error\":\"Invalid JSON command\"}");
        return parse_result;
    }
    
    // Execute the command
    int exec_result = execute_command(&cmd, &resp);
    
    // Generate JSON response
    if (resp.status == 0) {
        // Success response
        if (strlen(resp.data) > 0) {
            snprintf(json_output, MAX_JSON_LEN, 
                    "{\"status\":\"OK\",\"data\":%s}", resp.data);
        } else {
            snprintf(json_output, MAX_JSON_LEN, 
                    "{\"status\":\"OK\"}");
        }
    } else {
        // Error response
        snprintf(json_output, MAX_JSON_LEN, 
                "{\"status\":\"ERROR\",\"error\":\"%s\"}", 
                strlen(resp.error) > 0 ? resp.error : "Unknown error");
    }
    
    return exec_result;
}