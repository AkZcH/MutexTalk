# Requirements Document

## Introduction

The Binary-Semaphore Chat System is a full-stack chat application backend that demonstrates Operating System synchronization techniques using a binary semaphore implemented with Mutex for controlling concurrent write access to a shared chat database. The system consists of a C core daemon for critical operations and a Node.js API layer for web communication, with all data stored in SQL databases.

## Glossary

- **Binary_Semaphore**: A synchronization primitive that allows only one writer to access the chat database at a time, implemented using pthread_mutex_t
- **C_Core_Daemon**: The low-level backend service written in C that manages concurrency, database operations, and transaction logging
- **Node_API_Layer**: The JavaScript service that provides HTTP/WebSocket endpoints and bridges frontend requests to the C daemon
- **Chat_Database**: SQLite database (chat.db) storing all chat messages accessible to users
- **Logs_Database**: SQLite database (logs.db) storing transaction logs accessible only to administrators
- **Writer_Role**: User role that can acquire the binary semaphore to perform CRUD operations on chat messages
- **Reader_Role**: User role that can view chat messages but cannot modify them
- **Admin_Role**: User role with access to transaction logs and system administration functions
- **Transaction_Log**: Both database entries and plaintext file recording all system operations for audit purposes

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the backend to enforce mutual exclusion for write operations, so that data integrity is maintained when multiple users attempt to modify chat messages simultaneously.

#### Acceptance Criteria

1. THE Binary_Semaphore SHALL be implemented using pthread_mutex_t with initial value of 1 (available)
2. WHEN a writer requests access, THE C_Core_Daemon SHALL attempt to acquire the Binary_Semaphore using non-blocking operations
3. IF the Binary_Semaphore is already locked, THEN THE C_Core_Daemon SHALL return failure status without blocking
4. WHILE a writer holds the Binary_Semaphore, THE C_Core_Daemon SHALL prevent other writers from acquiring it
5. WHEN a writer releases the Binary_Semaphore, THE C_Core_Daemon SHALL make it available for other writers

### Requirement 2

**User Story:** As a developer, I want all database operations to be handled by the C daemon, so that critical functionality remains in the low-level backend as specified.

#### Acceptance Criteria

1. THE C_Core_Daemon SHALL perform all CRUD operations directly on the Chat_Database using SQLite C API
2. THE C_Core_Daemon SHALL perform all logging operations directly on the Logs_Database using SQLite C API
3. THE Node_API_Layer SHALL NOT access any SQL databases directly
4. THE C_Core_Daemon SHALL use prepared statements for all SQL queries to prevent injection attacks
5. THE C_Core_Daemon SHALL maintain SQLite connections with WAL mode enabled for concurrent read access

### Requirement 3

**User Story:** As an administrator, I want comprehensive transaction logging, so that I can audit all system operations and maintain accountability.

#### Acceptance Criteria

1. THE C_Core_Daemon SHALL log every operation to both the Logs_Database and plaintext Transaction_Log file
2. WHEN any operation occurs, THE C_Core_Daemon SHALL record timestamp, action type, username, content, and current semaphore value
3. THE Transaction_Log file SHALL be created with permissions 0600 and owned by the admin user
4. THE C_Core_Daemon SHALL log semaphore acquisition events with action "ACQUIRE_MUTEX" and semaphore_value 0
5. THE C_Core_Daemon SHALL log semaphore release events with action "RELEASE_MUTEX" and semaphore_value 1

### Requirement 4

**User Story:** As a frontend developer, I want RESTful APIs and WebSocket communication, so that I can build a responsive user interface that communicates with the backend.

#### Acceptance Criteria

1. THE Node_API_Layer SHALL provide HTTP endpoints for authentication, message operations, and administration
2. THE Node_API_Layer SHALL provide WebSocket endpoints for real-time semaphore status updates
3. THE Node_API_Layer SHALL communicate with the C_Core_Daemon using JSON messages over Unix domain sockets
4. THE Node_API_Layer SHALL validate JWT tokens for all protected endpoints
5. THE Node_API_Layer SHALL enforce role-based access control for Reader_Role, Writer_Role, and Admin_Role users

### Requirement 5

**User Story:** As a chat user with reader permissions, I want to view chat messages without affecting writers, so that I can follow conversations without interfering with ongoing modifications.

#### Acceptance Criteria

1. THE C_Core_Daemon SHALL allow Reader_Role users to query messages without acquiring the Binary_Semaphore
2. THE C_Core_Daemon SHALL provide consistent read access during write operations using SQLite transaction isolation
3. THE Node_API_Layer SHALL provide GET /api/messages endpoint accessible to both Reader_Role and Writer_Role users
4. THE C_Core_Daemon SHALL log read operations with action "READ" and current semaphore value
5. THE Node_API_Layer SHALL support pagination parameters for message listing

### Requirement 6

**User Story:** As a chat user with writer permissions, I want to create, update, and delete messages when I hold the semaphore, so that I can contribute to and manage chat content.

#### Acceptance Criteria

1. THE Node_API_Layer SHALL provide POST /api/writer/request endpoint to attempt semaphore acquisition
2. THE C_Core_Daemon SHALL only allow CRUD operations from users who currently hold the Binary_Semaphore
3. THE Node_API_Layer SHALL provide POST, PUT, and DELETE endpoints for message operations requiring semaphore ownership
4. THE C_Core_Daemon SHALL validate semaphore ownership before executing any write operation
5. THE Node_API_Layer SHALL provide POST /api/writer/release endpoint to release the semaphore

### Requirement 7

**User Story:** As an administrator, I want to view transaction logs and control writer access, so that I can monitor system usage and manage access during maintenance.

#### Acceptance Criteria

1. THE Node_API_Layer SHALL provide GET /api/logs endpoint accessible only to Admin_Role users
2. THE Node_API_Layer SHALL provide POST /api/admin/toggle-writer endpoint to enable/disable writer access globally
3. THE C_Core_Daemon SHALL respect the global writer_enabled flag when processing semaphore acquisition requests
4. THE Logs_Database SHALL be accessible only through admin endpoints, not to regular users
5. THE Node_API_Layer SHALL return 403 status when non-admin users attempt to access admin endpoints

### Requirement 8

**User Story:** As a system operator, I want the system to handle concurrent requests safely, so that the application remains stable under load.

#### Acceptance Criteria

1. THE C_Core_Daemon SHALL use thread-safe operations for all shared data structures
2. THE C_Core_Daemon SHALL handle multiple simultaneous client connections without data corruption
3. THE C_Core_Daemon SHALL use atomic operations or proper locking for the writer_enabled flag
4. THE Node_API_Layer SHALL handle connection failures to the C_Core_Daemon gracefully
5. THE C_Core_Daemon SHALL maintain consistent database state even during unexpected shutdowns

### Requirement 9

**User Story:** As a security-conscious administrator, I want proper authentication and authorization, so that only authorized users can access system functions.

#### Acceptance Criteria

1. THE Node_API_Layer SHALL implement JWT-based authentication for all protected endpoints
2. THE Node_API_Layer SHALL validate user roles before forwarding requests to the C_Core_Daemon
3. THE Node_API_Layer SHALL use HTTPS in production deployments
4. THE C_Core_Daemon SHALL validate that only semaphore holders or admins can release the semaphore
5. THE Node_API_Layer SHALL implement rate limiting for writer request attempts

### Requirement 10

**User Story:** As a developer, I want clear separation between the API layer and core logic, so that the system architecture remains maintainable and follows the specified design.

#### Acceptance Criteria

1. THE Node_API_Layer SHALL act only as a bridge between frontend and C_Core_Daemon
2. THE C_Core_Daemon SHALL run as an independent service listening on Unix domain sockets
3. THE Node_API_Layer SHALL translate HTTP requests to JSON commands for the C_Core_Daemon
4. THE C_Core_Daemon SHALL respond with structured JSON messages containing operation results
5. THE Node_API_Layer SHALL handle JSON parsing and error translation between the two layers