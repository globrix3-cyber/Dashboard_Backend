// server.js
require('dotenv').config();

// Sentry must initialise before express/http are required so it can instrument them.
// Inert unless SENTRY_DSN is set. Default integrations capture uncaught exceptions
// and unhandled rejections.
const Sentry = require('@sentry/node');
// Applied to errors and performance traces alike: drop bodies, cookies, query strings and credentials.
function scrubSentryEvent(event) {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (/^(authorization|cookie|set-cookie|x-api-key|x-refresh-token)$/i.test(h)) delete event.request.headers[h];
      }
    }
  }
  return event;
}
// Performance spans carry request details as attributes: drop credentials and query strings.
function scrubSentrySpan(span) {
  const data = span.data || span.attributes;
  if (data) {
    for (const key of Object.keys(data)) {
      if (/header\.(authorization|cookie|set-cookie|x-api-key|x-refresh-token)|query|body/i.test(key)) delete data[key];
      else if (typeof data[key] === 'string' && /^(url\.full|http\.url|http\.target|url\.path)$/.test(key)) data[key] = data[key].split('?')[0];
    }
  }
  if (typeof span.description === 'string') span.description = span.description.split('?')[0];
  return span;
}
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
    sendDefaultPii:   false,
    // Never capture request bodies (passwords, OTPs, tokens).
    integrations:     [Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })],
    beforeSend:     scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
  });
}

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
const cartRoutes          = require('./routes/cart');
const uploadsRoutes       = require('./routes/uploads');
const wishlistRoutes      = require('./routes/wishlist');
const newsletterRoutes    = require('./routes/newsletter');

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
  } catch (err) {
    logger.error('Failed to initialize server', { message: err.message, stack: err.stack });
    process.exit(1);
  }

  // Redis only backs OTP / password-reset codes, so start without it if it's unreachable
  try {
    const redis = require('./config/redis');
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Redis check timed out')), 5000));
    await Promise.race([redis.set('test', 'Redis works!'), timeout]);
    const redisReply = await Promise.race([redis.get('test'), timeout]);
    logger.info(`Redis connection successful: ${redisReply}`);
  } catch (err) {
    logger.warn('Redis unavailable; starting without it (email verification and password reset will fail)', { message: err.message });
  }
}

// ==================== MIDDLEWARE ====================
app.use(helmet());
app.use(cors({
  origin:      ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(cookieParser());
// Railway sits in front of the app; trust one proxy hop so rate limits see real client IPs.
app.set('trust proxy', 1);
app.use(express.json());
// Uptime checks and crawlers: registered before the rate limiter.
app.use('/health',      require('./routes/health'));
app.use('/sitemap.xml', require('./routes/sitemap'));
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
app.use('/api/cart',          cartRoutes);
app.use('/api/uploads',       uploadsRoutes);
app.use('/api/wishlist',      wishlistRoutes);
app.use('/api/newsletter',    newsletterRoutes);

// ==================== ERROR HANDLER ====================
if (process.env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

// ==================== START ====================
const PORT = process.env.PORT || 8000;

initializeServer().then(() => {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    require('./services/imageCleanup').startImageCleanup();
  });
}).catch((err) => {
  logger.error('Server startup failed', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => { logger.info('Server closed.'); process.exit(0); });
});

module.exports = app;