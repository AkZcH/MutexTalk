# Implementation Plan

- [x] 1. Set up project structure and build system

  - Create directory structure for C daemon and Node.js API components
  - Set up Makefile for C compilation with pthread and SQLite linking
  - Initialize Node.js project with package.json and dependencies
  - Create configuration files and environment setup
  - _Requirements: 10.1, 10.2_

- [x] 2. Implement C daemon core infrastructure

  - [x] 2.1 Create main daemon entry point and socket server

    - Implement main.c with Unix domain socket creation and binding
    - Set up main event loop for accepting client connections
    - Add signal handling for graceful shutdown
    - _Requirements: 10.2, 10.3_

  - [x] 2.2 Implement binary semaphore manager

    - Create semaphore.c/.h with pthread_mutex_t implementation
    - Implement try_acquire_writer() with non-blocking mutex operations
    - Implement release_writer() with ownership validation
    - Add admin toggle functionality for global writer control
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.3_

  - [x] 2.3 Create database manager with SQLite integration

    - Implement db.c/.h with SQLite C API connections
    - Create database initialization and schema setup functions
    - Enable WAL mode for concurrent read access
    - Implement prepared statement management for security
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [x] 3. Implement database operations and CRUD functionality

  - [x] 3.1 Create chat message CRUD operations

    - Implement create_message() with timestamp generation
    - Implement update_message() and delete_message() with ownership validation
    - Implement list_messages() with pagination support
    - Add semaphore ownership checks for all write operations
    - _Requirements: 6.2, 6.3, 6.4, 5.1, 5.5_

  - [x] 3.2 Implement transaction logging system

    - Create logger.c/.h for dual logging (database + file)
    - Implement log_transaction() for all operation types
    - Set up transactions.log file with proper permissions (0600)
    - Add structured JSON logging format with timestamps
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.3 Create admin operations for logs access

    - Implement get_logs() function for logs database queries
    - Add pagination support for transaction log retrieval
    - Ensure logs are only accessible through admin functions
    - _Requirements: 7.1, 7.4, 5.4_

- [x] 4. Implement JSON command processing

  - [x] 4.1 Create command parser and handler system

    - Implement handlers.c/.h with JSON parsing using cJSON library
    - Create command structure definitions and parsing functions
    - Implement execute_command() dispatcher for all operation types
    - Add JSON response generation with proper error handling
    - _Requirements: 10.3, 10.4_

  - [x] 4.2 Add client connection handling

    - Implement multi-threaded client connection management
    - Create per-connection command processing loops
    - Add connection cleanup and resource management
    - Ensure thread-safe access to shared semaphore state
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 5. Create Node.js API foundation

  - [x] 5.1 Set up Express server with middleware

    - Create server.js with Express application setup
    - Add CORS, JSON parsing, and error handling middleware
    - Implement JWT authentication middleware
    - Set up rate limiting for security
    - _Requirements: 4.1, 4.4, 9.2, 9.5_

  - [x] 5.2 Implement authentication system

    - Create auth.js module with JWT token generation and validation
    - Implement POST /api/login and POST /api/signup endpoints
    - Add role-based access control (reader/writer/admin)
    - Store user credentials in memory or simple file for MVP
    - _Requirements: 9.1, 9.2, 4.4_

  - [x] 5.3 Create C daemon communication bridge

    - Implement cbridge.js for Unix socket communication with C daemon
    - Add JSON command serialization and response parsing
    - Implement connection management with automatic reconnection
    - Add error handling and timeout management
    - _Requirements: 10.1, 10.3, 10.4, 8.4_

- [x] 6. Implement API endpoints for message operations

  - [x] 6.1 Create message routes for readers and writers

    - Implement GET /api/messages with pagination for all users
    - Add role validation middleware for endpoint access
    - Forward requests to C daemon via bridge module
    - Handle C daemon responses and HTTP status code mapping
    - _Requirements: 5.3, 5.5, 4.1, 4.3_

  - [x] 6.2 Implement writer-specific message operations

    - Create POST /api/messages for message creation (writer only)
    - Implement PUT /api/messages/:id for message updates (writer only)
    - Add DELETE /api/messages/:id for message deletion (writer only)
    - Validate semaphore ownership before allowing operations
    - _Requirements: 6.3, 6.4, 6.2_

- [x] 7. Implement semaphore control endpoints

  - [x] 7.1 Create writer semaphore request and release endpoints

    - Implement POST /api/writer/request for semaphore acquisition
    - Create POST /api/writer/release for semaphore release
    - Add ownership validation for release operations
    - Handle semaphore conflict responses (409 status)
    - _Requirements: 6.1, 6.5, 1.2, 1.3_

  - [x] 7.2 Add semaphore status endpoint

    - Implement GET /api/status for current semaphore state
    - Return semaphore value, current holder, and writer_enabled flag
    - Make accessible to all authenticated users
    - _Requirements: 4.1, 1.4_

- [x] 8. Implement administrative functionality

  - [x] 8.1 Create admin routes for system management

    - Implement GET /api/logs endpoint with admin role validation
    - Create POST /api/admin/toggle-writer for global writer control
    - Add pagination support for log retrieval
    - Ensure proper admin-only access control
    - _Requirements: 7.1, 7.2, 7.5, 9.2_

  - [x] 8.2 Add WebSocket server for real-time updates

    - Create websocket.js module for real-time semaphore status
    - Implement WebSocket endpoint at /ws/status
    - Add periodic status polling from C daemon
    - Broadcast semaphore changes to connected clients
    - _Requirements: 4.2, 4.1_

- [x] 9. Add error handling and security measures

  - [x] 9.1 Implement comprehensive error handling

    - Add error mapping between C daemon codes and HTTP status
    - Implement graceful degradation for C daemon disconnection
    - Add input validation and sanitization for all endpoints
    - Create consistent error response format
    - _Requirements: 8.4, 9.4_

  - [x] 9.2 Add security hardening

    - Implement HTTPS configuration for production
    - Add request rate limiting and brute force protection
    - Validate JWT tokens and enforce role boundaries
    - Secure Unix socket file permissions
    - _Requirements: 9.3, 9.5, 9.1, 9.2_

- [x] 10. Create deployment and configuration


  - [x] 10.1 Set up systemd service configurations

    - Create chat-daemon.service for C daemon
    - Create chat-api.service for Node.js API
    - Add proper user/group configuration and dependencies
    - Set up automatic restart and logging
    - _Requirements: 8.3, 8.1_

  - [x] 10.2 Create installation and setup scripts

    - Write database initialization scripts for both SQLite files
    - Create directory structure setup with proper permissions
    - Add configuration file templates
    - Write compilation and deployment instructions
    - _Requirements: 3.3, 2.5_

- [ ]\* 11. Add testing and validation

  - [ ]\* 11.1 Create unit tests for C daemon functions

    - Write tests for semaphore acquire/release logic
    - Test database CRUD operations with mock data
    - Validate JSON command parsing and response generation
    - Test concurrent access scenarios
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 8.1, 8.2_

  - [ ]\* 11.2 Create integration tests for API endpoints

    - Test authentication flow with JWT validation
    - Validate all REST endpoints with proper role enforcement
    - Test WebSocket functionality and real-time updates
    - Verify C daemon communication bridge
    - _Requirements: 4.1, 4.4, 9.1, 9.2_

  - [ ]\* 11.3 Add end-to-end testing scenarios
    - Test complete reader workflow (login → view messages)
    - Test complete writer workflow (login → acquire → CRUD → release)
    - Test admin workflow (login → view logs → toggle writer)
    - Validate concurrent writer access prevention
    - \_Requirements: 5.1, 6.1, 7.1, 1.
