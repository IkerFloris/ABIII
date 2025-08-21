FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of the application
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p /usr/src/app/views
RUN mkdir -p /usr/src/app/public/css
RUN chown -R node:node /usr/src/app

# Switch to non-root user
USER node

EXPOSE 80

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80 || exit 1

CMD ["npm", "start"]