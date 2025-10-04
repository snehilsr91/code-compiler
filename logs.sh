#!/bin/zsh

# =============================================================================
# CODE COMPILER - LOG VIEWER
# =============================================================================
# Quick access to different log files
# =============================================================================

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs"

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ ! -d "$LOG_DIR" ]; then
    echo "No logs directory found. Start the project first with ./start.sh"
    exit 1
fi

# Count log files
LOG_COUNT=$(ls -1 "${LOG_DIR}"/*.log 2>/dev/null | wc -l)

if [ "$LOG_COUNT" -eq 0 ]; then
    echo "No log files found. Start the project first with ./start.sh"
    exit 1
fi

echo -e "${CYAN}Available log files:${NC}\n"

# List all log files with numbers
i=1
declare -a files
for file in "${LOG_DIR}"/*.log; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        size=$(du -h "$file" | cut -f1)
        modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$file" 2>/dev/null || stat -c "%y" "$file" | cut -d' ' -f1-2)
        printf "${GREEN}%2d)${NC} %-35s ${YELLOW}%8s${NC}  %s\n" "$i" "$filename" "$size" "$modified"
        files[$i]="$file"
        ((i++))
    fi
done

echo -e "\n${CYAN}Options:${NC}"
echo "  Enter number to view log"
echo "  'a' to view all logs"
echo "  'e' to view errors only"
echo "  'q' to quit"

read -p $'\nChoice: ' choice

case $choice in
    [0-9]*)
        if [ -n "${files[$choice]}" ]; then
            echo -e "\n${CYAN}Viewing: ${files[$choice]}${NC}\n"
            less +G "${files[$choice]}"
        else
            echo "Invalid selection"
        fi
        ;;
    a)
        echo -e "\n${CYAN}Viewing all logs...${NC}\n"
        tail -n 50 "${LOG_DIR}"/*.log | less
        ;;
    e)
        echo -e "\n${CYAN}Viewing errors only...${NC}\n"
        grep -i "error\|fail\|exception" "${LOG_DIR}"/*.log | tail -n 100 | less
        ;;
    q)
        exit 0
        ;;
    *)
        echo "Invalid option"
        ;;
esac
