{
  "name": "chatternet-backend",
  "version": "1.1.0",
  "private": true,
  "type": "commonjs",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "NODE_ENV=development nodemon server.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "connect-pg-simple": "^9.0.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "express-session": "^1.17.3",
    "pg": "^8.11.5",
    "uuid": "^9.0.1"
  }
}
