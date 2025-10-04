#!/bin/zsh

# =============================================================================
# CODE COMPILER - MONITOR SCRIPT
# =============================================================================
# Real-time monitoring of all services and logs
# =============================================================================

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

clear
echo -e "${CYAN}"
echo "╔════════════════════════════════════════════════════════╗"
echo "║                                                        ║"
echo "║        CODE COMPILER - SERVICE MONITOR                 ║"
echo "║                                                        ║"
echo "╚════════════════════════════════════════════════════════╝"
echo -e "${NC}\n"

# Get latest log files
LATEST_BACKEND=$(ls -t ${LOG_DIR}/backend_*.log 2>/dev/null | head -1)
LATEST_FRONTEND=$(ls -t ${LOG_DIR}/frontend_*.log 2>/dev/null | head -1)
LATEST_ERROR=$(ls -t ${LOG_DIR}/error_*.log 2>/dev/null | head -1)

check_service() {
    local port=$1
    local name=$2
    if timeout 1 bash -c "cat < /dev/null > /dev/tcp/localhost/${port}" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $name is ${GREEN}RUNNING${NC} on port $port"
    else
        echo -e "${RED}✗${NC} $name is ${RED}DOWN${NC}"
    fi
}

echo -e "${CYAN}📊 Service Status:${NC}"
check_service 5432 "PostgreSQL"
check_service 6379 "Redis     "
check_service 4000 "Backend   "
check_service 5173 "Frontend  "

echo -e "\n${CYAN}📝 Recent Logs:${NC}"

if [ -f "$LATEST_ERROR" ] && [ -s "$LATEST_ERROR" ]; then
    echo -e "\n${RED}❌ Recent Errors:${NC}"
    tail -5 "$LATEST_ERROR"
fi

echo -e "\n${YELLOW}Choose logs to monitor:${NC}"
echo "1) Backend logs"
echo "2) Frontend logs"
echo "3) All logs (split view)"
echo "4) Error logs only"
echo "5) Exit"

read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo -e "\n${CYAN}Monitoring Backend logs... (Ctrl+C to exit)${NC}\n"
        tail -f "$LATEST_BACKEND"
        ;;
    2)
        echo -e "\n${CYAN}Monitoring Frontend logs... (Ctrl+C to exit)${NC}\n"
        tail -f "$LATEST_FRONTEND"
        ;;
    3)
        echo -e "\n${CYAN}Monitoring All logs... (Ctrl+C to exit)${NC}\n"
        tail -f "$LATEST_BACKEND" "$LATEST_FRONTEND" 2>/dev/null
        ;;
    4)
        echo -e "\n${CYAN}Monitoring Error logs... (Ctrl+C to exit)${NC}\n"
        tail -f "$LATEST_ERROR"
        ;;
    5)
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac
