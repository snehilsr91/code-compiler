FROM node:20-slim

# Install required compilers and interpreters
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gcc \
    g++ \
    openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create tmp directory for code execution
RUN mkdir -p /app/tmp && chmod 777 /app/tmp

# Expose port
EXPOSE 4000

# Start the application
CMD ["node", "dist/index.js"]