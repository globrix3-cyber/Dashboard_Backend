// server.js
const express      = require('express');
const http         = require('http');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const { Server }   = require('socket.io');

const authRoutes          = require('./routes/auth');
const usersRoutes         = require('./routes/users');
const companiesRoutes     = require('./routes/companies');
const permissionsRoutes   = require('./routes/permissions');
const productsRoutes      = require('./routes/products');
const rfqsRoutes          = require('./routes/rfqs');
const quotesRoutes        = require('./routes/quotes');
const ordersRoutes        = require('./routes/orders');
const statsRoutes         = require('./routes/stats');
const notificationsRoutes = require('./routes/notifications');
const adminRoutes         = require('./routes/admin');
const messagesRoutes      = require('./routes/messages');
const contractsRoutes     = require('./routes/contracts');

const limiter      = require('./middleware/rateLimit');
const errorHandler = require('./middleware/error');
const logger       = require('./utils/logger');

require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// Support comma-separated origins: e.g. "https://globrixa.com,https://www.globrixa.com"
const ALLOWED_ORIGINS = [
  ...(process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean),
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin:      ALLOWED_ORIGINS,
    methods:     ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
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
    logger.error('Failed to initialize server', { message: err.message, stack: err.stack });
    process.exit(1);
  }
}

// ==================== MIDDLEWARE ====================
app.use(helmet());
app.use(cors({
  origin:      ALLOWED_ORIGINS,
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
app.use('/api/auth',          authRoutes);
app.use('/api/users',         usersRoutes);
app.use('/api/companies',     companiesRoutes);
app.use('/api/permissions',   permissionsRoutes);
app.use('/api/products',      productsRoutes);
app.use('/api/rfqs',          rfqsRoutes);
app.use('/api/quotes',        quotesRoutes);
app.use('/api/orders',        ordersRoutes);
app.use('/api/stats',         statsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api',               messagesRoutes);
app.use('/api/contracts',     contractsRoutes);

// ==================== ERROR HANDLER ====================
app.use(errorHandler);

// ==================== START ====================
const PORT = process.env.PORT || 8000;

initializeServer().then(() => {
  server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
}).catch((err) => {
  logger.error('Server startup failed', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => { logger.info('Server closed.'); process.exit(0); });
});

module.exports = app;