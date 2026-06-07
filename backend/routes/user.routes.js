const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const validateObjectId = require('../middleware/validateObjectId');
const { uploadUserAvatar, toPublicPath } = require('../middleware/upload');
const { isEmail, parsePagination } = require('../utils/validation');
const { recomputeProductMetrics } = require('../utils/product-metrics');

const router = express.Router();

function publicAssetUrl(req, rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  const path = value.startsWith('/') ? value : `/${value}`;
  return `${req.protocol}://${req.get('host')}${path}`;
}

function sanitizeUserProfile(user, req) {
  return {
    _id: user._id,
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: req ? publicAssetUrl(req, user.avatarUrl) : (user.avatarUrl || ''),
    phone: user.phone || '',
    addresses: user.addresses || [],
    preferences: user.preferences || { language: 'en', notifications: { orderUpdates: true, marketingEmails: false } },
    wishlist: user.wishlist || [],
    cart: user.cart || [],
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null
  };
}

function sanitizeWishlistItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    productId: String(item?.productId || '').trim(),
    sellerId: String(item?.sellerId || '').trim(),
    name: String(item?.name || '').trim(),
    price: Number(item?.price || 0),
    image: String(item?.image || '').trim()
  })).filter((item) => item.productId && item.name);
}

function sanitizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    productId: String(item?.productId || '').trim(),
    sellerId: String(item?.sellerId || '').trim(),
    name: String(item?.name || '').trim(),
    price: Number(item?.price || 0),
    image: String(item?.image || '').trim(),
    selectedColor: String(item?.selectedColor || 'Default').trim(),
    selectedSize: String(item?.selectedSize || 'M').trim(),
    quantity: Math.max(1, Number(item?.quantity || 1))
  })).filter((item) => item.productId && item.name);
}

router.get('/me', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(sanitizeUserProfile(user, req));
}));

router.patch('/me', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const payload = {};
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const phone = String(req.body?.phone || '').trim();

  if (name && name.length < 2) return res.status(400).json({ message: 'Name must be at least 2 characters' });
  if (email && !isEmail(email)) return res.status(400).json({ message: 'Invalid email format' });
  if (phone && !/^\d{8,15}$/.test(phone)) return res.status(400).json({ message: 'Phone must be 8 to 15 digits' });

  if (name) payload.name = name;
  if (phone) payload.phone = phone;
  if (email) {
    const exists = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (exists) return res.status(409).json({ message: 'Email already exists' });
    payload.email = email;
  }

  if (!Object.keys(payload).length) return res.status(400).json({ message: 'No valid fields provided' });
  const user = await User.findByIdAndUpdate(req.user.id, payload, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(sanitizeUserProfile(user, req));
}));

router.post('/me/avatar', auth(['user', 'admin']), uploadUserAvatar.single('avatar'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Avatar image is required' });
  const avatarPath = toPublicPath(req.file.path);
  const avatarUrl = publicAssetUrl(req, avatarPath);
  const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl: avatarPath }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.status(201).json({ avatarUrl, user: sanitizeUserProfile(user, req) });
}));

router.post('/me/change-password', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'Current password, new password, and confirm password are required' });
  }
  if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters' });
  if (newPassword !== confirmPassword) return res.status(400).json({ message: 'Password confirmation does not match' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });
  user.password = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  return res.json({ ok: true, message: 'Password updated. Please login again.' });
}));

router.post('/me/logout-all', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  return res.json({ ok: true, message: 'All sessions logged out. Please login again.' });
}));

router.get('/me/addresses', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id, { addresses: 1 });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ items: user.addresses || [] });
}));

router.post('/me/addresses', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const payload = {
    label: String(body.label || 'Home').trim() || 'Home',
    fullName: String(body.fullName || '').trim(),
    phone: String(body.phone || '').trim(),
    line1: String(body.line1 || '').trim(),
    line2: String(body.line2 || '').trim(),
    city: String(body.city || '').trim(),
    state: String(body.state || '').trim(),
    postalCode: String(body.postalCode || '').trim(),
    country: String(body.country || 'Egypt').trim(),
    isDefault: Boolean(body.isDefault)
  };
  if (!payload.fullName || !payload.phone || !payload.line1 || !payload.city || !payload.postalCode) {
    return res.status(400).json({ message: 'Address fullName, phone, line1, city, and postalCode are required' });
  }
  if (!/^\d{8,15}$/.test(payload.phone)) return res.status(400).json({ message: 'Address phone must be 8 to 15 digits' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  if (payload.isDefault) {
    user.addresses = (user.addresses || []).map((addr) => ({ ...addr.toObject(), isDefault: false }));
  } else if (!(user.addresses || []).length) {
    payload.isDefault = true;
  }
  user.addresses.push(payload);
  await user.save();
  return res.status(201).json({ items: user.addresses });
}));

router.put('/me/addresses/:addressId', auth(['user', 'admin']), validateObjectId('addressId'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const target = user.addresses.id(req.params.addressId);
  if (!target) return res.status(404).json({ message: 'Address not found' });

  const fields = ['label', 'fullName', 'phone', 'line1', 'line2', 'city', 'state', 'postalCode', 'country'];
  fields.forEach((field) => {
    if (body[field] !== undefined) target[field] = String(body[field] || '').trim();
  });
  if (!target.fullName || !target.phone || !target.line1 || !target.city || !target.postalCode) {
    return res.status(400).json({ message: 'Address fullName, phone, line1, city, and postalCode are required' });
  }
  if (!/^\d{8,15}$/.test(String(target.phone || ''))) return res.status(400).json({ message: 'Address phone must be 8 to 15 digits' });

  await user.save();
  return res.json({ items: user.addresses });
}));

router.patch('/me/addresses/:addressId/default', auth(['user', 'admin']), validateObjectId('addressId'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const exists = user.addresses.id(req.params.addressId);
  if (!exists) return res.status(404).json({ message: 'Address not found' });
  user.addresses.forEach((addr) => { addr.isDefault = String(addr._id) === String(req.params.addressId); });
  await user.save();
  return res.json({ items: user.addresses });
}));

router.delete('/me/addresses/:addressId', auth(['user', 'admin']), validateObjectId('addressId'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const target = user.addresses.id(req.params.addressId);
  if (!target) return res.status(404).json({ message: 'Address not found' });
  const wasDefault = Boolean(target.isDefault);
  target.deleteOne();
  if (wasDefault && user.addresses.length) {
    user.addresses[0].isDefault = true;
  }
  await user.save();
  return res.json({ items: user.addresses });
}));

router.get('/me/wishlist', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id, { wishlist: 1 });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ items: user.wishlist || [] });
}));

router.put('/me/wishlist', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const before = await User.findById(req.user.id, { wishlist: 1 });
  const items = sanitizeWishlistItems(req.body?.items || []);
  const user = await User.findByIdAndUpdate(req.user.id, { wishlist: items }, { new: true, projection: { wishlist: 1 } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const changedIds = new Set([
    ...((before?.wishlist || []).map((x) => String(x.productId || ''))),
    ...((user.wishlist || []).map((x) => String(x.productId || '')))
  ]);
  await Promise.all([...changedIds].filter((id) => /^[a-f\d]{24}$/i.test(id)).map((id) => recomputeProductMetrics(id)));
  return res.json({ items: user.wishlist || [] });
}));

router.get('/me/cart', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id, { cart: 1 });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ items: user.cart || [] });
}));

router.put('/me/cart', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const items = sanitizeCartItems(req.body?.items || []);
  const productIds = [...new Set(items.map((x) => String(x.productId || '')).filter((id) => /^[a-f\d]{24}$/i.test(id)))];
  const products = await Product.find({ _id: { $in: productIds } }, { _id: 1, variants: 1 });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const validated = [];
  for (const item of items) {
    const product = byId.get(String(item.productId));
    if (!product) continue;
    const variant = (product.variants || []).find((v) => String(v.colorName) === String(item.selectedColor));
    const sizeRow = (variant?.sizes || []).find((s) => String(s.size) === String(item.selectedSize));
    const stock = Math.max(0, Number(sizeRow?.stock || 0));
    if (stock <= 0) continue;
    validated.push({ ...item, quantity: Math.min(Number(item.quantity || 1), stock) });
  }
  const user = await User.findByIdAndUpdate(req.user.id, { cart: validated }, { new: true, projection: { cart: 1 } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ items: user.cart || [] });
}));

router.get('/me/notifications', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id, { notifications: 1 });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ items: user.notifications || [] });
}));

router.patch('/me/notifications/:notificationId/read', auth(['user', 'admin']), validateObjectId('notificationId'), asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id, { notifications: 1 });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const notification = user.notifications.id(req.params.notificationId);
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  notification.readAt = new Date();
  await user.save();
  return res.json({ items: user.notifications || [] });
}));

router.patch('/me/preferences', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const language = String(req.body?.language || '').trim().toLowerCase();
  const notifications = req.body?.notifications || {};
  const payload = {};
  if (language) {
    if (!['en', 'ar'].includes(language)) return res.status(400).json({ message: 'language must be en or ar' });
    payload['preferences.language'] = language;
  }
  if (notifications.orderUpdates !== undefined) payload['preferences.notifications.orderUpdates'] = Boolean(notifications.orderUpdates);
  if (notifications.marketingEmails !== undefined) payload['preferences.notifications.marketingEmails'] = Boolean(notifications.marketingEmails);
  if (!Object.keys(payload).length) return res.status(400).json({ message: 'No preference fields provided' });

  const user = await User.findByIdAndUpdate(req.user.id, { $set: payload }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json({ preferences: user.preferences });
}));

router.get('/', auth(['admin']), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 15, maxLimit: 100 });
  const search = String(req.query.search || '').trim();
  const filter = search
    ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { role: { $regex: search, $options: 'i' } }
      ]
    }
    : {};
  const [items, total] = await Promise.all([
    User.find(filter, { password: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter)
  ]);
  return res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.patch('/:id/status', auth(['admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ['ACTIVE', 'BANNED'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true, projection: { password: 0 } });
  if (!user) return res.status(404).json({ message: 'User not found' });
  return res.json(user);
}));

router.post('/promote', auth(['admin']), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ message: 'Email is required' });
  
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'No user found with that email' });
  
  if (user.role === 'admin') {
    return res.status(400).json({ message: 'User is already an admin' });
  }
  
  user.role = 'admin';
  await user.save();
  
  return res.json({ 
    message: `Successfully promoted ${user.name} to Admin!`, 
    user: { _id: user._id, email: user.email, role: user.role } 
  });
}));

module.exports = router;
