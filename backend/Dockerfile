FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

RUN npm install

# Copy source code
COPY . .

# Build TypeScript into dist/
RUN npm run build

EXPOSE 3000

# Start production server (not nodemon)
CMD ["npm", "start"]
