// server.js
const express      = require('express');
const http         = require('http');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const { Server }   = require('socket.io');

const authRoutes        = require('./routes/auth');
const usersRoutes       = require('./routes/users');
const companiesRoutes   = require('./routes/companies');
const permissionsRoutes = require('./routes/permissions');
const productsRoutes    = require('./routes/products');   // ← Added

const limiter      = require('./middleware/rateLimit');
const errorHandler = require('./middleware/error');
const logger       = require('./utils/logger');

require('dotenv').config();

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:  process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  },
  path: '/socket.io',
});

app.set('socketio', io);
app.set('io', io);

async function initializeServer() {
  try {
    const pool  = require('./config/db');
    const dbRes = await pool.query('SELECT NOW()');
    logger.info(`Database connection successful: ${JSON.stringify(dbRes.rows[0], null, 2)}`);

    const redis = require('./config/redis');
    await redis.set('test', 'Redis works!');
    const redisReply = await redis.get('test');
    logger.info(`Redis connection successful: ${redisReply}`);
  } catch (err) {
    logger.error('Failed to initialize server:', err.stack);
    process.exit(1);
  }
}

// ==================== MIDDLEWARE ====================
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());
app.use(limiter);

app.use((req, res, next) => {
  req.io = io;
  next();
});

// ==================== SOCKET ====================
io.on('connection', (socket) => {
  logger.info(`Socket.IO client connected: ${socket.id}`);
  socket.on('disconnect', () => logger.info(`Socket.IO client disconnected: ${socket.id}`));
});

// ==================== HEALTH ====================
app.get('/', (req, res) => {
  res.json({ message: 'B2B Export Marketplace API', version: '1.0.0' });
});

// ==================== ROUTES ====================
app.use('/api/auth',        authRoutes);
app.use('/api/users',       usersRoutes);
app.use('/api/companies',   companiesRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/products',    productsRoutes);   // ← Added here

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

// ==================== START ====================
const PORT = process.env.PORT || 8000;

initializeServer().then(() => {
  server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
}).catch((err) => {
  logger.error('Server startup failed:', err.stack);
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => { logger.info('Server closed.'); process.exit(0); });
});

module.exports = app;