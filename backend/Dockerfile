FROM node:20-slim

WORKDIR /app

# Install OpenSSL (needed for Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy backend code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Expose port and start server
EXPOSE 3000
CMD ["npm", "start"]
