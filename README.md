# CODE - COMPILER

## Project Overview

This is a **code compiler for coding competitions** with a microservices architecture built for online judge functionality. The system allows users to submit code solutions that are executed in isolated Docker containers and evaluated against test cases.

## Architecture

### High-Level Structure
- **Frontend**: React + TypeScript + Vite application with Monaco Code Editor
- **Backend**: Express.js + TypeScript API server with job queue system
- **Database**: PostgreSQL with Prisma ORM for data persistence
- **Queue System**: Redis + BullMQ for asynchronous code execution
- **Execution Environment**: Docker containers for secure code execution

### Key Components

#### Frontend (`/frontend`)
- **React + TypeScript** with Vite build system
- **Monaco Editor** integration for code editing
- **Tailwind CSS** for styling
- **Axios** for API communication

#### Backend (`/backend`)
- **Express.js** REST API server
- **Queue-based job processing** using BullMQ and Redis
- **Prisma Client** for database operations
- **TypeScript** with ES modules

#### Database (`/db`)
- **PostgreSQL** database with Prisma schema
- **Models**: User, Problem, Submission with Language and Status enums
- **Migrations** managed through Prisma

#### Docker (`/docker`)
- **Execution containers** for Node.js and Python runtimes
- **Docker Compose** setup for Redis and PostgreSQL services

## 🚀 Quick Start (Automated)

### One-Command Startup

The easiest way to start the entire project:

```bash
./start.sh
```

This will automatically:
- ✅ Start Docker services (PostgreSQL, Redis)
- ✅ Install dependencies for backend and frontend
- ✅ Run database migrations
- ✅ Start backend server with worker
- ✅ Start frontend development server
- ✅ Create comprehensive log files
- ✅ Monitor all services

### Quick Commands

```bash
# Start all services
./start.sh

# Stop all services
./stop.sh

# Monitor services and view logs
./monitor.sh
```

### Log Files

All logs are stored in the `logs/` directory with timestamps:
- `logs/main_YYYYMMDD_HHMMSS.log` - Main startup log
- `logs/backend_YYYYMMDD_HHMMSS.log` - Backend server logs
- `logs/frontend_YYYYMMDD_HHMMSS.log` - Frontend dev server logs
- `logs/docker_YYYYMMDD_HHMMSS.log` - Docker services logs
- `logs/error_YYYYMMDD_HHMMSS.log` - Error logs only

View logs in real-time:
```bash
# View latest backend logs
tail -f logs/backend_*.log

# View latest error logs
tail -f logs/error_*.log

# Use the monitor script for interactive log viewing
./monitor.sh
```

---

## 🛠️ Manual Setup (Advanced)

### Environment Setup

1. **Create environment files:**

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials

# Frontend
cp frontend/.env.example frontend/.env
# Edit frontend/.env if needed
```

2. **Configure environment variables:**

Backend `.env` file:
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/code_compiler"
REDIS_URL="redis://localhost:6379"
PORT=4000
FRONTEND_ORIGIN="http://localhost:5173"
```

Frontend `.env` file:
```env
VITE_BASE_URL="http://localhost:4000"
```

### Database Operations
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Generate Prisma client after schema changes
npx prisma generate

# Apply database migrations
npx prisma migrate deploy

# Reset database and run migrations
npx prisma migrate reset

# View database in browser
npx prisma studio

# Create new migration
npx prisma migrate dev --name migration_name
```

### Backend Development
```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Build TypeScript (if needed)
npx tsc
```

### Frontend Development
```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Docker Services
```bash
# Navigate to backend directory
cd backend

# Start all services (Redis, PostgreSQL)
docker-compose up -d

# Stop all services
docker-compose down

# View service logs
docker-compose logs

# Rebuild and start services
docker-compose up -d --build
```

### Manual Full Application Setup
```bash
# 1. Start Docker services
cd backend
docker-compose up -d

# 2. Setup database
npm install
npx prisma migrate deploy
npx prisma generate

# 3. Start backend (in first terminal)
npm run dev

# 4. Start worker (in second terminal)
cd backend
node --loader ts-node/esm src/workers/submissionWorker.ts

# 5. Start frontend (in third terminal)
cd frontend
npm install
npm run dev
```

## Code Architecture Details

### Database Schema
- **Users**: Store user information and link to submissions
- **Problems**: Contest problems with test cases stored as JSON
- **Submissions**: User code submissions with status tracking
- **Supported Languages**: JavaScript, Python, C++, Java

### API Endpoints
- `POST /api/submit` - Submit code for execution
  - Creates database record
  - Adds job to Redis queue for async processing

### Queue System
- **BullMQ** integration with Redis
- **Submission Queue**: `submissions` queue for code execution jobs
- Jobs contain: `submissionId`, `code`, `language`

### Execution Flow
1. User submits code via frontend
2. Backend creates submission record in database
3. Job added to Redis queue with submission details
4. Worker processes job in isolated Docker container
5. Results updated in database with execution status

### Current Implementation Status
- ✅ Basic frontend with Monaco editor
- ✅ Backend API with submission endpoint  
- ✅ Database schema and migrations
- ✅ Queue setup with Redis
- ✅ Worker implementation for code execution
- ✅ Automated startup and logging system
- ⚠️ **Missing**: Docker container execution logic (currently runs on host)
- ⚠️ **Missing**: Test case evaluation system
- ⚠️ **Security**: Code execution needs sandboxing

## 📝 Service URLs

After starting the project with `./start.sh`:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4000
- **Health Check**: http://localhost:4000/api/health
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379
- **Prisma Studio**: Run `npx prisma studio` in backend folder

## 🔧 Troubleshooting

### Script won't run
```bash
# Make scripts executable
chmod +x start.sh stop.sh monitor.sh
```

### Port already in use
```bash
# Check what's using the port
lsof -i :5173  # Frontend
lsof -i :4000  # Backend
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill the process
kill -9 <PID>

# Or use stop script
./stop.sh
```

### Docker services not starting
```bash
# Check Docker status
docker ps

# Check Docker logs
cd backend
docker-compose logs

# Restart Docker services
docker-compose down
docker-compose up -d
```

### Database connection errors
```bash
# Check if PostgreSQL is running
nc -z localhost 5432

# Reset database
cd backend
npx prisma migrate reset

# Regenerate Prisma client
npx prisma generate
```

### Dependencies issues
```bash
# Clean install backend
cd backend
rm -rf node_modules package-lock.json
npm install

# Clean install frontend
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### View specific error logs
```bash
# Latest error log
cat logs/error_*.log | tail -50

# Backend errors
cat logs/backend_*.log | grep ERROR

# Use monitor script
./monitor.sh
```

### Worker not processing jobs
```bash
# Check Redis connection
redis-cli ping

# Check worker logs in backend log file
tail -f logs/backend_*.log | grep -i worker

# Manually restart worker
cd backend
node --loader ts-node/esm src/workers/submissionWorker.ts
```

## 🎯 Project Management Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `start.sh` | Start all services with logging | `./start.sh` |
| `stop.sh` | Stop all services gracefully | `./stop.sh` |
| `monitor.sh` | Monitor services and view logs | `./monitor.sh` |

### Script Features

**start.sh**:
- Automatic dependency installation
- Database migration
- Service health checks
- Process monitoring
- Comprehensive logging
- Auto-restart for worker

**stop.sh**:
- Graceful process termination
- Docker service cleanup
- PID file management

**monitor.sh**:
- Real-time service status
- Interactive log viewing
- Error log filtering
