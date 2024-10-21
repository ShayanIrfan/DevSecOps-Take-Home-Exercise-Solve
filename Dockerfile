# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /src

# Copying the environment file into /src
COPY .env ./

# Copy package.json and package-lock.json
COPY src/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app's source code
COPY src ./

# Install MySQL client
RUN apk add --no-cache mysql-client

# Expose the app's port (3000 by default)
EXPOSE 3000

# Run the application
CMD ["node", "main.js"]
