#!/bin/zsh

# =============================================================================
# CODE COMPILER - STARTUP SCRIPT
# =============================================================================
# This script automatically starts the entire code compiler project:
# 1. Docker services (PostgreSQL, Redis)
# 2. Backend server with worker
# 3. Frontend development server
# All with comprehensive logging
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Log files
MAIN_LOG="${LOG_DIR}/main_${TIMESTAMP}.log"
DOCKER_LOG="${LOG_DIR}/docker_${TIMESTAMP}.log"
BACKEND_LOG="${LOG_DIR}/backend_${TIMESTAMP}.log"
FRONTEND_LOG="${LOG_DIR}/frontend_${TIMESTAMP}.log"
ERROR_LOG="${LOG_DIR}/error_${TIMESTAMP}.log"

# PID file to track running processes
PID_FILE="${PROJECT_ROOT}/.pids"

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "${timestamp} [${level}] ${message}" | tee -a "${MAIN_LOG}"
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $@"
    log "INFO" "$@"
}

log_success() {
    echo -e "${GREEN}✓${NC} $@"
    log "SUCCESS" "$@"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $@"
    log "WARNING" "$@"
}

log_error() {
    echo -e "${RED}✗${NC} $@"
    log "ERROR" "$@"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] $@" >> "${ERROR_LOG}"
}

log_step() {
    echo -e "\n${CYAN}▶${NC} ${MAGENTA}$@${NC}"
    log "STEP" "$@"
}

cleanup() {
    log_warning "Cleaning up processes..."
    if [ -f "${PID_FILE}" ]; then
        while IFS= read -r pid; do
            if ps -p $pid > /dev/null 2>&1; then
                kill $pid 2>/dev/null || true
            fi
        done < "${PID_FILE}"
        rm -f "${PID_FILE}"
    fi
}

trap cleanup EXIT INT TERM

check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 is not installed. Please install it first."
        exit 1
    fi
}

# Check if port is open (works without netcat)
check_port() {
    local host=$1
    local port=$2
    timeout 1 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null
    return $?
}

wait_for_service() {
    local service=$1
    local host=$2
    local port=$3
    local max_attempts=30
    local attempt=1

    log_info "Waiting for ${service} to be ready at ${host}:${port}..."
    
    while [ $attempt -le $max_attempts ]; do
        if check_port ${host} ${port}; then
            log_success "${service} is ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        attempt=$((attempt + 1))
    done
    
    log_error "${service} failed to start after ${max_attempts} seconds"
    return 1
}

# =============================================================================
# MAIN SCRIPT
# =============================================================================

main() {
    clear
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                                                        ║"
    echo "║        CODE COMPILER - PROJECT STARTUP                 ║"
    echo "║                                                        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"

    log_info "Starting Code Compiler Project..."
    log_info "Logs directory: ${LOG_DIR}"
    log_info "Main log: ${MAIN_LOG}"
    log_info "Error log: ${ERROR_LOG}"

    # Create logs directory if it doesn't exist
    mkdir -p "${LOG_DIR}"

    # Check required commands
    log_step "Step 1: Checking prerequisites..."
    check_command "docker"
    check_command "docker-compose"
    check_command "node"
    check_command "npm"
    log_success "All prerequisites are installed"

    # Start Docker services
    log_step "Step 2: Starting Docker services (PostgreSQL, Redis)..."
    cd "${PROJECT_ROOT}/backend"
    
    if docker-compose ps | grep -q "Up"; then
        log_warning "Docker services are already running"
    else
        docker-compose up -d >> "${DOCKER_LOG}" 2>&1
        if [ $? -eq 0 ]; then
            log_success "Docker services started"
        else
            log_error "Failed to start Docker services. Check ${DOCKER_LOG}"
            exit 1
        fi
    fi

    # Wait for services to be ready
    wait_for_service "PostgreSQL" "localhost" "5432"
    wait_for_service "Redis" "localhost" "6379"

    # Setup Backend
    log_step "Step 3: Setting up Backend..."
    cd "${PROJECT_ROOT}/backend"
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing backend dependencies..."
        npm install >> "${BACKEND_LOG}" 2>&1
        log_success "Backend dependencies installed"
    else
        log_info "Backend dependencies already installed"
    fi

    log_info "Running Prisma migrations..."
    npx prisma migrate deploy >> "${BACKEND_LOG}" 2>&1
    npx prisma generate >> "${BACKEND_LOG}" 2>&1
    log_success "Database is ready"

    # Start Backend
    log_step "Step 4: Starting Backend server..."
    cd "${PROJECT_ROOT}/backend"
    npm run dev >> "${BACKEND_LOG}" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID >> "${PID_FILE}"
    log_success "Backend server started (PID: ${BACKEND_PID})"
    log_info "Backend log: ${BACKEND_LOG}"

    # Wait for backend to be ready
    sleep 3
    wait_for_service "Backend API" "localhost" "4000"

    # Setup Frontend
    log_step "Step 5: Setting up Frontend..."
    cd "${PROJECT_ROOT}/frontend"
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install >> "${FRONTEND_LOG}" 2>&1
        log_success "Frontend dependencies installed"
    else
        log_info "Frontend dependencies already installed"
    fi

    # Start Frontend
    log_step "Step 6: Starting Frontend development server..."
    cd "${PROJECT_ROOT}/frontend"
    npm run dev >> "${FRONTEND_LOG}" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID >> "${PID_FILE}"
    log_success "Frontend server started (PID: ${FRONTEND_PID})"
    log_info "Frontend log: ${FRONTEND_LOG}"

    # Wait for frontend to be ready
    sleep 3
    wait_for_service "Frontend" "localhost" "5173"

    # Start Worker (in background)
    log_step "Step 7: Starting Background Worker..."
    cd "${PROJECT_ROOT}/backend"
    node --loader ts-node/esm src/workers/submissionWorker.ts >> "${BACKEND_LOG}" 2>&1 &
    WORKER_PID=$!
    echo $WORKER_PID >> "${PID_FILE}"
    log_success "Worker started (PID: ${WORKER_PID})"

    # Final summary
    echo -e "\n${GREEN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║                                                        ║"
    echo "║              🚀 ALL SERVICES RUNNING! 🚀               ║"
    echo "║                                                        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"

    echo -e "${CYAN}📍 Service URLs:${NC}"
    echo -e "   Frontend:  ${GREEN}http://localhost:5173${NC}"
    echo -e "   Backend:   ${GREEN}http://localhost:4000${NC}"
    echo -e "   API Docs:  ${GREEN}http://localhost:4000/api/health${NC}"
    echo -e "   Prisma:    Run ${YELLOW}npx prisma studio${NC} in backend folder"
    
    echo -e "\n${CYAN}📝 Log Files:${NC}"
    echo -e "   Main:      ${LOG_DIR}/main_${TIMESTAMP}.log"
    echo -e "   Backend:   ${LOG_DIR}/backend_${TIMESTAMP}.log"
    echo -e "   Frontend:  ${LOG_DIR}/frontend_${TIMESTAMP}.log"
    echo -e "   Docker:    ${LOG_DIR}/docker_${TIMESTAMP}.log"
    echo -e "   Errors:    ${LOG_DIR}/error_${TIMESTAMP}.log"
    
    echo -e "\n${CYAN}🔧 Management:${NC}"
    echo -e "   Stop all:  ${YELLOW}./stop.sh${NC}"
    echo -e "   View logs: ${YELLOW}tail -f logs/backend_${TIMESTAMP}.log${NC}"
    echo -e "   Monitor:   ${YELLOW}./monitor.sh${NC}"
    
    echo -e "\n${YELLOW}⚠  Press Ctrl+C to stop all services${NC}\n"

    # Keep script running and monitor processes
    while true; do
        if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
            log_error "Backend process died! Check logs."
            exit 1
        fi
        if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
            log_error "Frontend process died! Check logs."
            exit 1
        fi
        if ! ps -p $WORKER_PID > /dev/null 2>&1; then
            log_warning "Worker process died! Restarting..."
            cd "${PROJECT_ROOT}/backend"
            node --loader ts-node/esm src/workers/submissionWorker.ts >> "${BACKEND_LOG}" 2>&1 &
            WORKER_PID=$!
            echo $WORKER_PID >> "${PID_FILE}"
        fi
        sleep 5
    done
}

# Run main function
main
