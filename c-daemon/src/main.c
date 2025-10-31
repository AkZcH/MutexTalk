// Binary Semaphore Chat Daemon - Main Entry Point
// Simple HTTP server implementation for Windows compatibility

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>

#ifdef _WIN32
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>
    #pragma comment(lib, "ws2_32.lib")
    #define close closesocket
    #define ssize_t int
    typedef int socklen_t;
    #define sleep(x) Sleep((x) * 1000)
#else
    #include <unistd.h>
    #include <sys/socket.h>
    #include <pthread.h>
    #include <errno.h>
    #include <netinet/in.h>
    #include <arpa/inet.h>
#endif

#include "semaphore.h"
#include "db_simple.h"

// Global variables for graceful shutdown
static volatile sig_atomic_t running = 1;
static int server_socket = -1;
static const int server_port = 8081;

// Signal handler for graceful shutdown
void signal_handler(int sig) {
    printf("\nReceived signal %d, shutting down gracefully...\n", sig);
    running = 0;
    
    if (server_socket != -1) {
        close(server_socket);
        server_socket = -1;
    }
}

// Simple HTTP response helper
void send_http_response(int client_socket, const char* status, const char* content) {
    char response[4096];
    int content_length = strlen(content);
    
    snprintf(response, sizeof(response),
        "HTTP/1.1 %s\r\n"
        "Content-Type: application/json\r\n"
        "Content-Length: %d\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
        "Access-Control-Allow-Headers: Content-Type\r\n"
        "\r\n"
        "%s",
        status, content_length, content);
    
    send(client_socket, response, strlen(response), 0);
}

// Extract username from JSON request body
int extract_username_from_json(const char* body, char* username, size_t username_size) {
    // Simple JSON parsing to extract username
    const char* username_start = strstr(body, "\"username\":");
    if (!username_start) {
        return -1;
    }
    
    // Skip to the value
    username_start = strchr(username_start, ':');
    if (!username_start) {
        return -1;
    }
    username_start++;
    
    // Skip whitespace and opening quote
    while (*username_start == ' ' || *username_start == '\t') {
        username_start++;
    }
    if (*username_start != '"') {
        return -1;
    }
    username_start++;
    
    // Find closing quote
    const char* username_end = strchr(username_start, '"');
    if (!username_end) {
        return -1;
    }
    
    // Copy username
    size_t len = username_end - username_start;
    if (len >= username_size) {
        len = username_size - 1;
    }
    strncpy(username, username_start, len);
    username[len] = '\0';
    
    return 0;
}

// Handle HTTP requests
void handle_http_request(int client_socket) {
    char buffer[4096];
    char response_content[2048];
    
    // Read HTTP request
    ssize_t bytes_read = recv(client_socket, buffer, sizeof(buffer) - 1, 0);
    if (bytes_read <= 0) {
        return;
    }
    buffer[bytes_read] = '\0';
    
    printf("Received request: %.100s...\n", buffer);
    
    // Parse HTTP method and path
    char method[16], path[256];
    if (sscanf(buffer, "%15s %255s", method, path) != 2) {
        send_http_response(client_socket, "400 Bad Request", 
                          "{\"error\":\"Invalid HTTP request\"}");
        return;
    }
    
    // Handle OPTIONS for CORS
    if (strcmp(method, "OPTIONS") == 0) {
        send_http_response(client_socket, "200 OK", "");
        return;
    }
    
    // Find request body (after double CRLF)
    char* body = strstr(buffer, "\r\n\r\n");
    if (body) {
        body += 4; // Skip the double CRLF
    }
    
    // Route handling
    if (strcmp(path, "/api/semaphore/acquire") == 0 && strcmp(method, "POST") == 0) {
        char username[64] = {0};
        
        // Extract username from request body
        if (!body || extract_username_from_json(body, username, sizeof(username)) != 0) {
            send_http_response(client_socket, "400 Bad Request", 
                              "{\"status\":\"error\",\"message\":\"Username required in request body\"}");
            return;
        }
        
        printf("User '%s' requesting semaphore acquisition\n", username);
        
        // Try to acquire semaphore for the specified user
        int result = try_acquire_writer(username);
        if (result == 0) {
            snprintf(response_content, sizeof(response_content),
                    "{\"status\":\"success\",\"message\":\"Semaphore acquired\",\"holder\":\"%s\"}", username);
            send_http_response(client_socket, "200 OK", response_content);
        } else if (result == -3) {
            // Get current holder info
            char current_holder[64];
            int value;
            get_semaphore_status(current_holder, &value);
            snprintf(response_content, sizeof(response_content),
                    "{\"status\":\"error\",\"message\":\"Semaphore unavailable\",\"holder\":\"%s\"}", current_holder);
            send_http_response(client_socket, "409 Conflict", response_content);
        } else {
            strcpy(response_content, "{\"status\":\"error\",\"message\":\"Failed to acquire semaphore\"}");
            send_http_response(client_socket, "500 Internal Server Error", response_content);
        }
    }
    else if (strcmp(path, "/api/semaphore/release") == 0 && strcmp(method, "POST") == 0) {
        char username[64] = {0};
        
        // Extract username from request body
        if (!body || extract_username_from_json(body, username, sizeof(username)) != 0) {
            send_http_response(client_socket, "400 Bad Request", 
                              "{\"status\":\"error\",\"message\":\"Username required in request body\"}");
            return;
        }
        
        printf("User '%s' requesting semaphore release\n", username);
        
        // Release semaphore for the specified user
        int result = release_writer(username);
        if (result == 0) {
            strcpy(response_content, "{\"status\":\"success\",\"message\":\"Semaphore released\"}");
            send_http_response(client_socket, "200 OK", response_content);
        } else if (result == -2) {
            strcpy(response_content, "{\"status\":\"error\",\"message\":\"Permission denied - not semaphore holder\"}");
            send_http_response(client_socket, "403 Forbidden", response_content);
        } else {
            strcpy(response_content, "{\"status\":\"error\",\"message\":\"Cannot release semaphore\"}");
            send_http_response(client_socket, "500 Internal Server Error", response_content);
        }
    }
    else if (strcmp(path, "/api/semaphore/status") == 0 && strcmp(method, "GET") == 0) {
        // Get semaphore status
        char holder[64];
        int value;
        int result = get_semaphore_status(holder, &value);
        if (result == 0) {
            snprintf(response_content, sizeof(response_content),
                    "{\"status\":\"success\",\"semaphore_value\":%d,\"holder\":\"%s\"}",
                    value, holder);
            send_http_response(client_socket, "200 OK", response_content);
        } else {
            strcpy(response_content, "{\"status\":\"error\",\"message\":\"Cannot get status\"}");
            send_http_response(client_socket, "500 Internal Server Error", response_content);
        }
    }
    else {
        // Default response
        strcpy(response_content, "{\"status\":\"error\",\"message\":\"Endpoint not found\"}");
        send_http_response(client_socket, "404 Not Found", response_content);
    }
}

// Initialize TCP socket server
int init_socket_server() {
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        printf("WSAStartup failed\n");
        return -1;
    }
#endif

    struct sockaddr_in addr;
    
    // Create socket
    server_socket = socket(AF_INET, SOCK_STREAM, 0);
    if (server_socket == -1) {
        printf("Socket creation failed\n");
        return -1;
    }
    
    // Set socket options to reuse address
    int opt = 1;
    setsockopt(server_socket, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));
    
    // Set up address structure
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    addr.sin_port = htons(server_port);
    
    // Bind socket
    if (bind(server_socket, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        printf("Bind failed\n");
        close(server_socket);
        return -1;
    }
    
    // Listen for connections
    if (listen(server_socket, 10) == -1) {
        printf("Listen failed\n");
        close(server_socket);
        return -1;
    }
    
    printf("HTTP server listening on http://127.0.0.1:%d\n", server_port);
    return 0;
}

// Main server loop
void run_server() {
    struct sockaddr_in client_addr;
    socklen_t client_len = sizeof(client_addr);
    
    printf("Server running, waiting for HTTP requests...\n");
    printf("Test endpoints:\n");
    printf("  POST http://127.0.0.1:%d/api/semaphore/acquire\n", server_port);
    printf("  POST http://127.0.0.1:%d/api/semaphore/release\n", server_port);
    printf("  GET  http://127.0.0.1:%d/api/semaphore/status\n", server_port);
    
    while (running) {
        // Accept client connection
        int client_socket = accept(server_socket, (struct sockaddr*)&client_addr, &client_len);
        
        if (client_socket == -1) {
            if (running) {
                printf("Accept failed\n");
            }
            continue;
        }
        
        printf("New connection from %s\n", inet_ntoa(client_addr.sin_addr));
        
        // Handle request
        handle_http_request(client_socket);
        
        // Close connection
        close(client_socket);
    }
}

// Cleanup function
void cleanup() {
    printf("Cleaning up resources...\n");
    
    if (server_socket != -1) {
        close(server_socket);
    }
    
#ifdef _WIN32
    WSACleanup();
#endif
    
    cleanup_semaphore();
    cleanup_databases();
    printf("Cleanup complete\n");
}

int main(int argc, char *argv[]) {
    printf("Binary Semaphore Chat Daemon starting...\n");
    
    // Set up signal handlers
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    
    // Initialize semaphore manager
    printf("Initializing semaphore manager...\n");
    if (init_semaphore() != 0) {
        fprintf(stderr, "Failed to initialize semaphore manager\n");
        return 1;
    }
    
    // Initialize database manager
    printf("Initializing database manager...\n");
    if (init_databases("../data/chat.db", "../data/logs.db") != 0) {
        fprintf(stderr, "Failed to initialize database manager\n");
        return 1;
    }
    
    // Initialize socket server
    printf("Initializing HTTP server...\n");
    if (init_socket_server() != 0) {
        fprintf(stderr, "Failed to initialize HTTP server\n");
        return 1;
    }
    
    // Run main server loop
    run_server();
    
    // Cleanup on exit
    cleanup();
    
    printf("Chat daemon shutdown complete\n");
    return 0;
}