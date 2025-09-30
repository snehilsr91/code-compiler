FROM node:20-slim

WORKDIR /app

# Copy package.json & install deps
COPY package*.json ./
RUN npm install

# Copy all backend files
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

EXPOSE 3000

# Start app
CMD ["npm", "start"]
