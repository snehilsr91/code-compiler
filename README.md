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

## Development Commands

### Database Operations
```powershell
# Navigate to db directory
cd db

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
```powershell
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
```powershell
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
```powershell
# Navigate to docker directory
cd docker

# Start all services (Redis, PostgreSQL)
docker-compose up -d

# Stop all services
docker-compose down

# View service logs
docker-compose logs

# Rebuild and start services
docker-compose up -d --build
```

### Full Application Setup
```powershell
# 1. Start Docker services
cd docker
docker-compose up -d

# 2. Setup database
cd ../db
npm install
npx prisma migrate deploy
npx prisma generate

# 3. Start backend
cd ../backend
npm install
npm run dev

# 4. Start frontend (in new terminal)
cd ../frontend
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
- ⚠️ **Missing**: Worker implementation for code execution
- ⚠️ **Missing**: Docker container execution logic
- ⚠️ **Missing**: Test case evaluation system
