const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Seller = require('../models/Seller');
const asyncHandler = require('../middleware/asyncHandler');
const { isEmail } = require('../utils/validation');
const { buildAppUrl, logDeliveryLink } = require('../utils/notifications');
const { sendEmail } = require('../utils/email');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validator');

const router = express.Router();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('nyledrip_token', token, {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/'
  });
}

function getPublicBaseUrl(req) {
  return String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function getGoogleRedirectUri(req) {
  return String(process.env.GOOGLE_REDIRECT_URI || `${getPublicBaseUrl(req)}/api/auth/google/callback`);
}

function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyState(rawState) {
  const [body, sig] = String(rawState || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  if (Buffer.byteLength(sig) !== Buffer.byteLength(expected)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.createdAt || Date.now() - Number(payload.createdAt) > 10 * 60 * 1000) return null;
  return payload;
}

function safeReturnTo(value) {
  const raw = String(value || '/shop').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/api/')) return '/shop';
  return raw;
}

function serializeAuthUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl || '',
    preferences: user.preferences || { language: 'en', notifications: { orderUpdates: true, marketingEmails: false } },
    lastLoginAt: user.lastLoginAt || null
  };
}

function getAttemptKey(req, email) {
  return `${req.ip || 'unknown'}:${String(email || '').toLowerCase().trim()}`;
}

function assertLoginAllowed(req, email) {
  const key = getAttemptKey(req, email);
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || now - row.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 0, firstAt: now });
    return;
  }
  if (row.count >= LOGIN_MAX_ATTEMPTS) {
    const err = new Error('Too many login attempts. Please try again later.');
    err.statusCode = 429;
    throw err;
  }
}

function recordLoginFailure(req, email) {
  const key = getAttemptKey(req, email);
  const now = Date.now();
  const row = loginAttempts.get(key);
  if (!row || now - row.firstAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAt: now });
    return;
  }
  row.count += 1;
  loginAttempts.set(key, row);
}

function clearLoginFailures(req, email) {
  loginAttempts.delete(getAttemptKey(req, email));
}

function issueToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return {
    raw,
    hash: crypto.createHash('sha256').update(raw).digest('hex')
  };
}

async function sendVerificationLink(user) {
  const token = issueToken();
  user.emailVerificationTokenHash = token.hash;
  user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const verifyUrl = buildAppUrl(`/api/auth/verify-email?token=${token.raw}`);
  
  // Try sending the email via Resend
  await sendEmail({
    to: user.email,
    subject: 'Verify your NYLEDRIP email address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333; text-align: center;">Welcome to NYLEDRIP!</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Thank you for signing up with NYLEDRIP. Please verify your email address to activate your account and start shopping.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="color: #666; font-size: 0.9em;">If you cannot click the button above, copy and paste the link below into your browser:</p>
        <p style="word-break: break-all; color: #0066cc;"><a href="${verifyUrl}">${verifyUrl}</a></p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 0.8em; text-align: center;">&copy; 2026 NYLEDRIP. All rights reserved.</p>
      </div>
    `
  }).catch((err) => console.error('Verification email promise error:', err));
}

router.post('/signup', [
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('email').isEmail().withMessage('Invalid email address').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
], validateRequest, asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const exists = await User.findOne({ email: normalizedEmail });
  if (exists) return res.status(409).json({ message: 'Email already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: String(name).trim(),
    email: normalizedEmail,
    password: passwordHash,
    role: 'user'
  });
  user.lastLoginAt = new Date();
  await sendVerificationLink(user);
  const token = signToken({ id: String(user._id), role: user.role, email: user.email, tokenVersion: user.tokenVersion || 0 });
  setAuthCookie(res, token);
  return res.status(201).json({
    token,
    user: serializeAuthUser(user)
  });
}));

router.post('/resend-verification', asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  if (!isEmail(email)) return res.status(400).json({ message: 'Valid email is required' });
  const user = await User.findOne({ email });
  if (user && !user.emailVerifiedAt) await sendVerificationLink(user);
  return res.json({ ok: true, message: 'If the account exists, a verification link was sent.' });
}));

router.get('/verify-email', asyncHandler(async (req, res) => {
  const token = String(req.query.token || '').trim();
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    emailVerificationTokenHash: hash,
    emailVerificationExpiresAt: { $gt: new Date() }
  });
  if (!user) return res.status(400).send('Verification link is invalid or expired');
  user.emailVerifiedAt = new Date();
  user.emailVerificationTokenHash = '';
  user.emailVerificationExpiresAt = null;
  await user.save();
  return res.redirect('/login?verified=1');
}));

router.get('/google', asyncHandler(async (req, res) => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) return res.status(500).json({ message: 'Google login is not configured' });
  const state = signState({
    nonce: crypto.randomBytes(16).toString('hex'),
    returnTo: safeReturnTo(req.query.returnTo),
    createdAt: Date.now()
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}));

router.get('/google/callback', asyncHandler(async (req, res) => {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) return res.status(500).send('Google login is not configured');
  const code = String(req.query.code || '').trim();
  const state = verifyState(req.query.state);
  if (!code || !state) return res.status(400).send('Invalid Google login response');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(req),
      grant_type: 'authorization_code'
    })
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload.access_token) {
    return res.status(400).send('Google token exchange failed');
  }

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
  });
  const profile = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified === false) {
    return res.status(400).send('Google account email must be verified');
  }

  const email = String(profile.email || '').toLowerCase().trim();
  const seller = await Seller.findOne({ email }, { _id: 1 });
  if (seller) return res.status(409).send('This email belongs to a seller account. Use seller login.');

  let user = await User.findOne({ $or: [{ googleId: String(profile.sub) }, { email }] });
  if (!user) {
    const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    user = await User.create({
      name: String(profile.name || email.split('@')[0] || 'Google User').trim(),
      email,
      password: randomPassword,
      googleId: String(profile.sub),
      authProviders: ['google'],
      emailVerifiedAt: new Date(),
      avatarUrl: String(profile.picture || '').trim(),
      role: 'user',
      lastLoginAt: new Date()
    });
  } else {
    user.googleId = user.googleId || String(profile.sub);
    user.authProviders = Array.from(new Set([...(user.authProviders || []), 'google']));
    if (!user.avatarUrl && profile.picture) user.avatarUrl = String(profile.picture).trim();
    user.lastLoginAt = new Date();
    await user.save();
  }

  if (user.status === 'BANNED') return res.status(403).send('This account has been banned');
  const token = signToken({ id: String(user._id), role: user.role, email: user.email, tokenVersion: user.tokenVersion || 0 });
  setAuthCookie(res, token);
  const callbackUrl = new URL(`${getPublicBaseUrl(req)}/auth-callback`);
  callbackUrl.searchParams.set('token', token);
  callbackUrl.searchParams.set('next', safeReturnTo(state.returnTo));
  return res.redirect(callbackUrl.toString());
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!isEmail(email)) {
    return res.status(400).json({ message: 'Valid email is required' });
  }
  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }

  const normalizedEmail = String(email || '').toLowerCase().trim();
  assertLoginAllowed(req, normalizedEmail);

  const user = await User.findOne({ email: normalizedEmail });
  if (user && await bcrypt.compare(password, user.password)) {
    if (user.status === 'BANNED') {
      return res.status(403).json({ message: 'This account has been banned' });
    }
    user.lastLoginAt = new Date();
    await user.save();
    const token = signToken({ id: String(user._id), role: user.role, email: user.email, tokenVersion: user.tokenVersion || 0 });
    setAuthCookie(res, token);
    clearLoginFailures(req, normalizedEmail);
    return res.json({
      token,
      user: serializeAuthUser(user)
    });
  }

  const seller = await Seller.findOne({ email: normalizedEmail });
  if (seller && await bcrypt.compare(password, seller.password)) {
    if (String(seller.status).toLowerCase() === 'suspended') {
      return res.status(403).json({ message: 'Seller account is suspended' });
    }
    const token = signToken({ id: String(seller._id), role: 'seller', email: seller.email });
    setAuthCookie(res, token);
    clearLoginFailures(req, normalizedEmail);
    return res.json({
      token,
      user: { id: String(seller._id), name: seller.name, email: seller.email, role: 'seller', status: seller.status }
    });
  }

  recordLoginFailure(req, normalizedEmail);
  return res.status(401).json({ message: 'Invalid credentials' });
}));

module.exports = router;
