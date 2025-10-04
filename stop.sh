#!/bin/zsh

# =============================================================================
# CODE COMPILER - STOP SCRIPT
# =============================================================================
# Gracefully stops all running services
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="${PROJECT_ROOT}/.pids"

log_info() {
    echo -e "${BLUE}ℹ${NC} $@"
}

log_success() {
    echo -e "${GREEN}✓${NC} $@"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $@"
}

log_error() {
    echo -e "${RED}✗${NC} $@"
}

echo -e "${YELLOW}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║        STOPPING CODE COMPILER SERVICES                ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Stop processes from PID file
if [ -f "${PID_FILE}" ]; then
    log_info "Stopping application processes..."
    while IFS= read -r pid; do
        if ps -p $pid > /dev/null 2>&1; then
            process_name=$(ps -p $pid -o comm=)
            log_info "Stopping process: ${process_name} (PID: ${pid})"
            kill -TERM $pid 2>/dev/null || kill -KILL $pid 2>/dev/null || true
            sleep 1
            if ps -p $pid > /dev/null 2>&1; then
                log_warning "Force killing process ${pid}"
                kill -9 $pid 2>/dev/null || true
            fi
            log_success "Stopped ${process_name}"
        fi
    done < "${PID_FILE}"
    rm -f "${PID_FILE}"
    log_success "All application processes stopped"
else
    log_warning "No PID file found. Processes may not be running."
fi

# Stop Docker services
log_info "Stopping Docker services..."
cd "${PROJECT_ROOT}/backend"
if docker-compose ps 2>/dev/null | grep -q "Up"; then
    docker-compose stop
    log_success "Docker services stopped"
else
    log_warning "Docker services are not running"
fi

# Kill any remaining node processes (optional, use with caution)
# pkill -f "vite" 2>/dev/null || true
# pkill -f "nodemon" 2>/dev/null || true

echo -e "\n${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            ✓ All services stopped successfully         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}\n"

log_info "To start services again, run: ${YELLOW}./start.sh${NC}"
