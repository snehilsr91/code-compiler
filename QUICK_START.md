# 🚀 Quick Reference Guide

## Essential Commands

### Starting the Project
```bash
./start.sh          # Start everything (recommended)
./stop.sh           # Stop everything
./monitor.sh        # Monitor services and logs
```

### Individual Services
```bash
# Backend only
cd backend && npm run dev

# Frontend only
cd frontend && npm run dev

# Worker only
cd backend && node --loader ts-node/esm src/workers/submissionWorker.ts

# Docker services only
cd backend && docker-compose up -d
```

### Database Management
```bash
cd backend

# Apply migrations
npx prisma migrate deploy

# Create new migration
npx prisma migrate dev --name your_migration_name

# Reset database
npx prisma migrate reset

# View database
npx prisma studio

# Generate Prisma client
npx prisma generate
```

### Logs
```bash
# View all logs
ls -lh logs/

# Real-time backend logs
tail -f logs/backend_*.log

# Real-time error logs
tail -f logs/error_*.log

# Interactive monitor
./monitor.sh
```

### Troubleshooting
```bash
# Check if services are running
curl -s http://localhost:5173 > /dev/null && echo "Frontend: UP" || echo "Frontend: DOWN"
curl -s http://localhost:4000/api/health > /dev/null && echo "Backend: UP" || echo "Backend: DOWN"
# Or use the monitor script
./monitor.sh

# View Docker logs
cd backend && docker-compose logs

# Check running processes
ps aux | grep node
ps aux | grep docker

# Kill stuck processes
./stop.sh

# Clean reinstall
cd backend && rm -rf node_modules && npm install
cd frontend && rm -rf node_modules && npm install
```

## Service URLs

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Health Check | http://localhost:4000/api/health |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## File Structure

```
code-compiler/
├── start.sh              # Main startup script
├── stop.sh               # Shutdown script
├── monitor.sh            # Monitoring script
├── logs/                 # All log files
│   ├── main_*.log
│   ├── backend_*.log
│   ├── frontend_*.log
│   ├── docker_*.log
│   └── error_*.log
├── backend/
│   ├── .env              # Backend environment (create from .env.example)
│   ├── docker-compose.yml
│   ├── src/
│   │   ├── index.ts      # Express server
│   │   ├── routes/       # API routes
│   │   ├── services/     # Code executor
│   │   ├── workers/      # Background worker
│   │   └── queues/       # BullMQ setup
│   └── prisma/
│       └── schema.prisma # Database schema
└── frontend/
    ├── .env              # Frontend environment (create from .env.example)
    └── src/
        ├── App.tsx       # Main component
        └── components/   # React components
```

## Common Tasks

### Add a new language
1. Update Prisma schema enum
2. Add executor function in `backend/src/services/codeExecutor.ts`
3. Add starter code in `frontend/src/App.tsx`
4. Run migrations

### Debug backend
```bash
# View backend logs
tail -f logs/backend_*.log

# Check database
cd backend && npx prisma studio

# Check Redis
redis-cli
> PING
> KEYS *
> LLEN submissions
```

### Debug frontend
```bash
# View frontend logs
tail -f logs/frontend_*.log

# Check browser console
# Open http://localhost:5173 and check DevTools
```

### Update dependencies
```bash
# Backend
cd backend
npm update
npm audit fix

# Frontend
cd frontend
npm update
npm audit fix
```

## Environment Variables

### Backend (.env)
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/code_compiler"
REDIS_URL="redis://localhost:6379"
PORT=4000
FRONTEND_ORIGIN="http://localhost:5173"
NODE_ENV="development"
```

### Frontend (.env)
```env
VITE_BASE_URL="http://localhost:4000"
```

## Development Workflow

1. **Start Development**
   ```bash
   ./start.sh
   ```

2. **Make Changes**
   - Backend: Edit files in `backend/src/` (auto-reloads with nodemon)
   - Frontend: Edit files in `frontend/src/` (hot module reload)
   - Database: Edit `backend/prisma/schema.prisma` then run migrations

3. **Test Changes**
   - Frontend automatically reloads
   - Backend automatically reloads
   - Check logs: `./monitor.sh`

4. **Stop Development**
   ```bash
   ./stop.sh
   ```

## Git Workflow

```bash
# Check status
git status

# Stage changes
git add .

# Commit
git commit -m "Your commit message"

# Push
git push origin your-branch

# Note: logs/ and .pids are ignored by .gitignore
```

## Production Deployment

```bash
# Build frontend
cd frontend
npm run build

# Build backend
cd backend
npm run build

# Run production
cd backend
npm start
```

## Need Help?

- Check logs: `./monitor.sh`
- View errors: `cat logs/error_*.log`
- Check README.md for detailed documentation
- Check service status in monitor script
