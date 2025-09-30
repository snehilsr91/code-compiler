FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy Prisma schema BEFORE generating
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy rest of the application
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

CMD ["node", "dist/index.js"]