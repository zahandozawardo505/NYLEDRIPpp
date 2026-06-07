const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const asyncHandler = require('./middleware/asyncHandler');
const { uploadsRoot } = require('./middleware/upload');
const rateLimit = require('./middleware/rateLimit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
const envCorsRaw = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '';
const defaultDevOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];
const allowedOrigins = String(envCorsRaw)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const effectiveAllowedOrigins = Array.from(new Set([
  ...allowedOrigins,
  ...(!isProduction ? defaultDevOrigins : [])
]));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "frame-src": [
        "'self'",
        "https://www.instagram.com",
        "https://instagram.com",
        "https://*.instagram.com",
        "https://www.tiktok.com",
        "https://tiktok.com",
        "https://*.tiktok.com"
      ],
      "img-src": [
        "'self'",
        "data:",
        "blob:",
        "https://images.unsplash.com",
        "https://res.cloudinary.com",
        "https://www.instagram.com",
        "https://instagram.com",
        "https://*.instagram.com",
        "https://*.cdninstagram.com",
        "https://www.tiktok.com",
        "https://tiktok.com",
        "https://*.tiktok.com",
        "https://*.tiktokcdn.com",
        "https://*.fbcdn.net"
      ]
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!effectiveAllowedOrigins.length) {
      return callback(null, !isProduction);
    }
    return callback(null, effectiveAllowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 80, keyPrefix: 'auth' }));
app.use('/api/orders', rateLimit({ windowMs: 60 * 1000, max: 40, keyPrefix: 'orders' }));
app.use('/api/reviews', rateLimit({ windowMs: 60 * 1000, max: 40, keyPrefix: 'reviews' }));
app.use('/uploads', express.static(uploadsRoot));
app.use('/uploads', (_req, res) => {
  res.status(404).json({ success: false, message: 'File not found' });
});
app.use('/api/uploads', express.static(uploadsRoot));
app.use('/api/uploads', (_req, res) => {
  res.status(404).json({ success: false, message: 'File not found' });
});

app.get('/api/health', (_req, res) => {
  const readyState = Number(mongoose.connection?.readyState || 0);
  const dbStatus = readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    success: true,
    message: 'Service healthy',
    data: {
      ok: true,
      service: 'nyledrip-backend',
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus
    }
  });
});

function hasValidJwtSecret() {
  return Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16);
}

app.use('/api', asyncHandler(async (req, res, next) => {
  if (req.path === '/health') return next();
  if (!hasValidJwtSecret()) {
    return res.status(500).json({ success: false, message: 'Server configuration error. JWT_SECRET is missing or too short.' });
  }
  if (Number(mongoose.connection?.readyState || 0) !== 1) {
    await connectMongo();
  }
  if (Number(mongoose.connection?.readyState || 0) !== 1) {
    return res.status(503).json({ success: false, message: 'Database unavailable. Check MongoDB connection and Atlas IP whitelist.' });
  }
  return next();
}));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/products', require('./routes/product.routes'));
app.use('/api/orders', require('./routes/order.routes'));
app.use('/api/sellers', require('./routes/seller.routes'));
app.use('/api/seller-applications', require('./routes/seller-application.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/utils', require('./routes/utils.routes'));
app.use('/api/reviews', require('./routes/review.routes'));

const projectRoot = path.join(__dirname, '..');
app.set('views', projectRoot);
app.set('view engine', 'ejs');

const frontendRoutes = {
  '/shop': 'HTML/shop',
  '/product': 'HTML/Product',
  '/cart': 'HTML/cart',
  '/wishlist': 'HTML/wishlist',
  '/login': 'HTML/login',
  '/signup': 'HTML/signup',
  '/auth-callback': 'HTML/auth-callback',
  '/profile': 'HTML/profile',
  '/seller': 'HTML/seller',
  '/seller-dashboard': 'HTML/seller-dashboard',
  '/seller-signup': 'HTML/seller-signup',
  '/admin': 'HTML/admin',
  '/checkout': 'HTML/checkout'
};

Object.entries(frontendRoutes).forEach(([route, file]) => {
  app.get(route, (_req, res) => res.render(file));
});

const legacyPageRoutes = {
  '/index.html': '/',
  '/HTML/shop.html': '/shop',
  '/HTML/Product.html': '/product',
  '/HTML/product.html': '/product',
  '/HTML/cart.html': '/cart',
  '/HTML/wishlist.html': '/wishlist',
  '/HTML/login.html': '/login',
  '/HTML/signup.html': '/signup',
  '/HTML/auth-callback.html': '/auth-callback',
  '/HTML/profile.html': '/profile',
  '/HTML/seller.html': '/seller',
  '/HTML/seller-dashboard.html': '/seller-dashboard',
  '/HTML/seller-signup.html': '/seller-signup',
  '/HTML/admin.html': '/admin'
};

Object.entries(legacyPageRoutes).forEach(([legacyRoute, route]) => {
  app.get(legacyRoute, (req, res) => {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, `${route}${query}`);
  });
});

app.get(['/', '/index.ejs'], (_req, res) => res.render('index'));
app.use('/CSS', express.static(path.join(projectRoot, 'CSS')));
app.use('/JS', express.static(path.join(projectRoot, 'JS')));
app.use('/assets', express.static(path.join(projectRoot, 'assets')));

app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).render('HTML/404');
  }
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, _next) => {
  const multerFileTooLarge = err?.code === 'LIMIT_FILE_SIZE';
  const isDbConnectivityIssue =
    err?.name === 'MongooseServerSelectionError' ||
    err?.name === 'MongoServerSelectionError' ||
    /server selection|buffering timed out|topology is closed|not connected/i.test(String(err?.message || ''));
  const status = multerFileTooLarge
    ? 400
    : (isDbConnectivityIssue ? 503 : Number(err?.status || err?.statusCode || 500));
  const message = isDbConnectivityIssue
    ? 'Database unavailable. Check MongoDB connection and Atlas IP whitelist.'
    : (status >= 500
    ? 'Internal server error'
    : (multerFileTooLarge ? 'Uploaded file exceeds the allowed size' : (err?.message || 'Request failed')));
  if (status >= 500) {
    console.error(err);
  }
  if (req.accepts('html') && !req.originalUrl.startsWith('/api/')) {
    return res.status(status >= 500 ? 500 : status).render('HTML/500');
  }
  res.status(status).json({ success: false, message });
});

async function seedDefaultAdminIfEnabled() {
  const allowAdminSeed = String(process.env.ENABLE_DEFAULT_ADMIN_SEED || '').toLowerCase() === 'true';
  if (!allowAdminSeed) return;
  const adminEmail = String(process.env.DEFAULT_ADMIN_EMAIL || '').toLowerCase().trim();
  const adminPassword = String(process.env.DEFAULT_ADMIN_PASSWORD || '');
  if (!adminEmail || adminPassword.length < 8) return;
  const exists = await User.findOne({ email: adminEmail });
  if (exists) return;
  const password = await bcrypt.hash(adminPassword, 10);
  await User.create({ name: 'Admin', email: adminEmail, password, role: 'admin' });
  console.log('Seeded admin user');
}

let mongoConnectionPromise = null;
async function connectMongo() {
  const readyState = Number(mongoose.connection?.readyState || 0);
  if (readyState === 1) return mongoose.connection;
  if (!process.env.MONGODB_URI) {
    console.error('Mongo connect skipped: MONGODB_URI is missing');
    return null;
  }

  if (readyState === 2 && mongoConnectionPromise) {
    return mongoConnectionPromise;
  }

  if (readyState === 0 || readyState === 3) {
    mongoConnectionPromise = null;
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    }).then(async (connection) => {
      console.log('Mongo connected');
      await seedDefaultAdminIfEnabled();
      return connection;
    }).catch((err) => {
      mongoConnectionPromise = null;
      console.error(`Mongo connection failed: ${err.message}`);
      throw err;
    });
  }

  return mongoConnectionPromise;
}

function connectMongoWithRetry() {
  return connectMongo().catch(() => {
    setTimeout(() => {
      connectMongoWithRetry().catch(() => {});
    }, 10000);
  });
}

function start() {
  if (!hasValidJwtSecret()) {
    console.error('Failed to start: JWT_SECRET must be at least 16 characters');
    process.exit(1);
  }

  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
    connectMongoWithRetry().catch(() => {});
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('Mongo disconnected');
    mongoConnectionPromise = null;
    setTimeout(() => {
      connectMongoWithRetry();
    }, 5000);
  });

  mongoose.connection.on('error', (err) => {
    console.error(`Mongo error: ${err.message}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;
module.exports.connectMongo = connectMongo;
