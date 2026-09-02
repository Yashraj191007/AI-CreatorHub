FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma client
RUN npm install

# Copy application source code
COPY . .

# Build both frontend and backend
RUN npm run build

# Use a smaller production image
FROM node:22-alpine

WORKDIR /app

# Copy built assets and dependencies from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/uploads ./uploads

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Start the application
CMD ["npm", "start"]
