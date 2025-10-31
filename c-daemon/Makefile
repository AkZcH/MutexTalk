# Binary Semaphore Chat Daemon Makefile

CC = gcc
CFLAGS = -Wall -Wextra -std=c99 -pthread -Iinclude
LDFLAGS = -pthread -lsqlite3 -lcjson
SRCDIR = src
INCDIR = include
OBJDIR = obj
BINDIR = bin

# Source files (updated as tasks are implemented)
SOURCES = $(SRCDIR)/main.c $(SRCDIR)/semaphore.c $(SRCDIR)/db.c $(SRCDIR)/logger.c $(SRCDIR)/handlers.c

OBJECTS = $(SOURCES:$(SRCDIR)/%.c=$(OBJDIR)/%.o)
TARGET = $(BINDIR)/chat_daemon

# Detect OS for cross-platform compatibility
UNAME_S := $(shell uname -s 2>/dev/null || echo Windows)
ifeq ($(UNAME_S),Windows_NT)
    TARGET = $(BINDIR)/chat_daemon.exe
    MKDIR = mkdir
    RM = del /Q /S
    RMDIR = rmdir /Q /S
else
    MKDIR = mkdir -p
    RM = rm -f
    RMDIR = rm -rf
endif

# Default target
all: $(TARGET)

# Create directories if they don't exist
$(OBJDIR):
ifeq ($(UNAME_S),Windows_NT)
	if not exist "$(OBJDIR)" $(MKDIR) "$(OBJDIR)"
else
	$(MKDIR) $(OBJDIR)
endif

$(BINDIR):
ifeq ($(UNAME_S),Windows_NT)
	if not exist "$(BINDIR)" $(MKDIR) "$(BINDIR)"
else
	$(MKDIR) $(BINDIR)
endif

# Build target
$(TARGET): $(OBJECTS) | $(BINDIR)
	$(CC) $(OBJECTS) -o $@ $(LDFLAGS)

# Compile source files
$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	$(CC) $(CFLAGS) -c $< -o $@

# Clean build artifacts
clean:
ifeq ($(UNAME_S),Windows_NT)
	if exist "$(OBJDIR)" $(RMDIR) "$(OBJDIR)"
	if exist "$(BINDIR)" $(RMDIR) "$(BINDIR)"
else
	$(RMDIR) $(OBJDIR) $(BINDIR)
endif

# Install target (for systemd service on Linux)
install: $(TARGET)
ifneq ($(UNAME_S),Windows_NT)
	sudo cp $(TARGET) /usr/local/bin/
	sudo chmod +x /usr/local/bin/chat_daemon
else
	@echo "Install target not supported on Windows. Use manual deployment."
endif

# Development build with debug symbols
debug: CFLAGS += -g -DDEBUG
debug: $(TARGET)

# Check for required dependencies
check-deps:
	@echo "Checking for required dependencies..."
ifeq ($(UNAME_S),Windows_NT)
	@echo "On Windows, ensure SQLite3 and cJSON libraries are available"
	@echo "Consider using vcpkg or manual installation"
else
	@pkg-config --exists sqlite3 || (echo "SQLite3 development libraries not found. Install with: sudo apt-get install libsqlite3-dev" && exit 1)
	@pkg-config --exists libcjson || (echo "cJSON library not found. Install with: sudo apt-get install libcjson-dev" && exit 1)
	@echo "All dependencies found."
endif

# Development setup - create necessary directories
setup-dev:
	$(MKDIR) ../data ../logs
ifeq ($(UNAME_S),Windows_NT)
	if not exist "../data" $(MKDIR) "../data"
	if not exist "../logs" $(MKDIR) "../logs"
else
	$(MKDIR) ../data ../logs
endif

.PHONY: all clean install debug check-deps setup-dev