# 🎉 Automated Startup System - Complete!

## ✅ What Has Been Created

### 1. **Main Startup Script** (`start.sh`)
A comprehensive script that:
- ✅ Checks all prerequisites (Docker, Node.js, npm)
- ✅ Starts Docker services (PostgreSQL & Redis)
- ✅ Installs dependencies automatically
- ✅ Runs database migrations
- ✅ Starts backend server
- ✅ Starts frontend server
- ✅ Starts background worker
- ✅ Monitors all processes
- ✅ Creates timestamped log files
- ✅ Auto-restarts worker if it crashes
- ✅ Provides colored console output
- ✅ Shows service URLs and status

### 2. **Stop Script** (`stop.sh`)
Gracefully shuts down:
- ✅ All Node.js processes (backend, frontend, worker)
- ✅ Docker services
- ✅ Cleans up PID files
- ✅ Provides clean shutdown confirmation

### 3. **Monitor Script** (`monitor.sh`)
Interactive monitoring tool:
- ✅ Shows service status (up/down)
- ✅ Real-time log viewing
- ✅ Separate views for backend/frontend/errors
- ✅ Combined log view option

### 4. **Log Viewer** (`logs.sh`)
Quick log file browser:
- ✅ Lists all log files with sizes and timestamps
- ✅ Quick view by number selection
- ✅ Error-only filter
- ✅ Combined view option

### 5. **Log Directory** (`logs/`)
Organized logging system:
- ✅ `main_*.log` - Startup script logs
- ✅ `backend_*.log` - Backend server logs
- ✅ `frontend_*.log` - Frontend dev server logs
- ✅ `docker_*.log` - Docker service logs
- ✅ `error_*.log` - Error-only logs
- ✅ `.gitignore` - Prevents logs from being committed

### 6. **Environment Templates**
- ✅ `backend/.env.example` - Backend environment variables template
- ✅ `frontend/.env.example` - Frontend environment variables template

### 7. **Documentation**
- ✅ Updated `README.md` with comprehensive instructions
- ✅ Created `QUICK_START.md` for quick reference
- ✅ Added troubleshooting guide
- ✅ Added service URLs and management commands

### 8. **Git Configuration**
- ✅ Root `.gitignore` to exclude logs, PIDs, and temp files

## 🚀 How to Use

### First Time Setup
```bash
# 1. Clone the repository (if not already done)
git clone <your-repo-url>
cd code-compiler

# 2. Create environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Edit environment files if needed (optional)
nano backend/.env

# 4. Start everything!
./start.sh
```

### Daily Development
```bash
# Start work
./start.sh

# Monitor logs (in another terminal)
./monitor.sh

# View specific logs
./logs.sh

# When done
./stop.sh
```

## 📊 What Happens When You Run `./start.sh`

1. **Prerequisites Check** - Verifies Docker, Node, npm are installed
2. **Docker Services** - Starts PostgreSQL and Redis containers
3. **Health Checks** - Waits for services to be ready
4. **Backend Setup** - Installs deps, runs migrations, generates Prisma client
5. **Backend Start** - Launches Express server on port 4000
6. **Frontend Setup** - Installs dependencies
7. **Frontend Start** - Launches Vite dev server on port 5173
8. **Worker Start** - Launches background job processor
9. **Monitoring** - Continuously monitors all processes
10. **Auto-Recovery** - Restarts worker if it crashes

All output is logged to timestamped files in `logs/`

## 📝 Log Files Explained

### Main Log (`main_*.log`)
Contains:
- Startup sequence
- Service status checks
- Health check results
- Process management info

### Backend Log (`backend_*.log`)
Contains:
- Express server output
- API request/response logs
- Database queries
- Worker job processing
- Backend errors

### Frontend Log (`frontend_*.log`)
Contains:
- Vite dev server output
- Hot module reload events
- Frontend build info
- Client-side compilation errors

### Docker Log (`docker_*.log`)
Contains:
- Docker Compose output
- Container startup logs
- PostgreSQL initialization
- Redis startup

### Error Log (`error_*.log`)
Contains:
- Only error messages from all services
- Quick way to debug issues
- Filtered from all other logs

## 🎯 Service Status

After running `./start.sh`, you'll see:

```
╔════════════════════════════════════════════════════════╗
║              🚀 ALL SERVICES RUNNING! 🚀              ║
╚════════════════════════════════════════════════════════╝

📍 Service URLs:
   Frontend:  http://localhost:5173
   Backend:   http://localhost:4000
   API Docs:  http://localhost:4000/api/health

📝 Log Files:
   Main:      logs/main_20250104_143022.log
   Backend:   logs/backend_20250104_143022.log
   Frontend:  logs/frontend_20250104_143022.log
   Docker:    logs/docker_20250104_143022.log
   Errors:    logs/error_20250104_143022.log

🔧 Management:
   Stop all:  ./stop.sh
   View logs: tail -f logs/backend_20250104_143022.log
   Monitor:   ./monitor.sh

⚠  Press Ctrl+C to stop all services
```

## 🛠️ Available Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `start.sh` | Start all services | `./start.sh` |
| `stop.sh` | Stop all services | `./stop.sh` |
| `monitor.sh` | Interactive monitoring | `./monitor.sh` |
| `logs.sh` | Browse log files | `./logs.sh` |

## 🔍 Monitoring Examples

### View Live Backend Logs
```bash
tail -f logs/backend_*.log
```

### View Only Errors
```bash
tail -f logs/error_*.log
```

### Search for Specific Term
```bash
grep -i "submission" logs/backend_*.log
```

### Interactive Monitor
```bash
./monitor.sh
# Then select option 1-5
```

## 🐛 Troubleshooting

### Script won't start
```bash
chmod +x start.sh stop.sh monitor.sh logs.sh
```

### Port already in use
```bash
./stop.sh
# Wait 5 seconds
./start.sh
```

### See what went wrong
```bash
# Check error log
cat logs/error_*.log

# Or use interactive viewer
./logs.sh
# Select 'e' for errors only
```

### Clean restart
```bash
./stop.sh
cd backend && docker-compose down
rm -rf backend/node_modules frontend/node_modules
./start.sh
```

## 🎨 Features

### Color-Coded Output
- 🔵 Info messages (blue)
- ✓ Success messages (green)
- ⚠ Warnings (yellow)
- ✗ Errors (red)
- ▶ Step indicators (cyan/magenta)

### Smart Features
- **Auto-restart**: Worker automatically restarts if it crashes
- **Health checks**: Waits for services to be ready before proceeding
- **Process tracking**: All PIDs stored in `.pids` file
- **Clean shutdown**: Graceful SIGTERM, then SIGKILL if needed
- **Timestamped logs**: Never overwrite old logs
- **Error aggregation**: All errors in one place

## 📦 What's Logged

Every service logs:
- ✅ Startup messages
- ✅ Configuration details
- ✅ Request/response data
- ✅ Error messages with stack traces
- ✅ Performance metrics
- ✅ Database queries (in dev mode)
- ✅ Job processing status

## 🔐 Security Notes

- ❌ Log files contain sensitive data (never commit to git)
- ✅ `.gitignore` configured to exclude logs
- ✅ `.env` files excluded from git
- ✅ `.env.example` files provided as templates

## 📚 Related Documentation

- See `README.md` for full project documentation
- See `QUICK_START.md` for command reference
- Check `logs/` for runtime information

## ✨ Benefits

1. **One Command Start** - No more opening multiple terminals
2. **Automatic Setup** - Dependencies and migrations handled
3. **Comprehensive Logging** - Debug issues easily
4. **Process Monitoring** - Know when something breaks
5. **Easy Troubleshooting** - All errors in one place
6. **Professional Workflow** - Like production environments

## 🎓 Next Steps

1. **Start developing**: `./start.sh`
2. **Make changes**: Edit files (auto-reload works)
3. **Monitor**: Use `./monitor.sh` to watch logs
4. **Debug**: Check `./logs.sh` for errors
5. **Stop**: Use `./stop.sh` when done

---

**Happy Coding! 🚀**

*All logs are in the `logs/` directory with timestamps.*
*Use `./monitor.sh` for interactive monitoring.*
*Use `./logs.sh` for quick log browsing.*
