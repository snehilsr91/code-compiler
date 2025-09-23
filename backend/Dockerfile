FROM node:20-slim

WORKDIR /app

COPY backend/package*.json ./
COPY db ./db

RUN npm install

COPY backend/. .

EXPOSE 3000

CMD ["npm", "run", "dev"]
