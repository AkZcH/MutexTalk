// Command Handler Header
// Implements JSON command parsing and execution using cJSON library

#ifndef HANDLERS_H
#define HANDLERS_H

#include "db.h"

// Command types enumeration
typedef enum {
    CMD_TRY_ACQUIRE,
    CMD_RELEASE,
    CMD_CREATE_MESSAGE,
    CMD_UPDATE_MESSAGE,
    CMD_DELETE_MESSAGE,
    CMD_LIST_MESSAGES,
    CMD_GET_STATUS,
    CMD_GET_LOGS,
    CMD_TOGGLE_WRITER
} command_type_t;

// Main command handler function - parses JSON input and generates JSON output
int handle_command(const char *json_input, char *json_output);

#endif // HANDLERS_H