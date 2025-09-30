FROM node:20-slim

WORKDIR /app

# Copy package.json and package-lock.json first for caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all backend files
COPY . .

# Expose the port your app listens on
EXPOSE 3000

# Start the app
CMD ["npm", "run", "dev"]
