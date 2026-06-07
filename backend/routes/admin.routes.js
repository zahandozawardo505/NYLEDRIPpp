const express = require('express');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Order = require('../models/Order');
const SellerApplication = require('../models/SellerApplication');
const AuditLog = require('../models/AuditLog');
const PlatformSettings = require('../models/PlatformSettings');
const Payout = require('../models/Payout');
const { parsePagination } = require('../utils/validation');
const { writeAudit } = require('../utils/audit');
const { uploadHeroMediaMemory } = require('../middleware/upload');
const HeroMedia = require('../models/HeroMedia');

const router = express.Router();

router.get('/overview', auth(['admin']), asyncHandler(async (_req, res) => {
  const [users, sellers, products, orders, applications] = await Promise.all([
    User.countDocuments({}),
    Seller.countDocuments({}),
    Product.countDocuments({}),
    Order.countDocuments({}),
    SellerApplication.countDocuments({})
  ]);
  res.json({ users, sellers, products, orders, applications });
}));

async function getSettings() {
  return PlatformSettings.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { new: true, upsert: true }
  );
}

router.get('/settings', auth(['admin']), asyncHandler(async (_req, res) => {
  res.json(await getSettings());
}));

router.patch('/settings', auth(['admin']), asyncHandler(async (req, res) => {
  const settings = await getSettings();
  ['commissionRate', 'payoutHoldDays', 'freeShippingThreshold'].forEach((key) => {
    if (req.body?.[key] !== undefined) settings[key] = Number(req.body[key]);
  });
  if (req.body?.supportEmail !== undefined) settings.supportEmail = String(req.body.supportEmail || '').trim();
  if (req.body?.heroBackgroundType !== undefined) {
    const nextType = String(req.body.heroBackgroundType);
    if (nextType === 'default') {
      settings.heroBackgroundType = 'default';
      settings.heroBackgroundUrl = '';
      settings.heroBackgroundOriginalName = '';
    }
  }
  
  await settings.save();
  await writeAudit(req, 'platform_settings_updated', { entityType: 'settings', entityId: 'default', metadata: req.body || {} });
  res.json(settings);
}));

router.post('/settings/hero-background', auth(['admin']), uploadHeroMediaMemory.single('heroBackgroundMedia'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Hero background media file is required' });
  if (!req.file.buffer || !req.file.buffer.length) {
    return res.status(400).json({ message: 'Uploaded hero media was empty' });
  }
  // Store the media binary in MongoDB
  const heroMedia = await HeroMedia.create({
    originalName: String(req.file.originalname || '').trim(),
    contentType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer
  });
  const settings = await getSettings();
  const mediaType = String(req.file.mimetype || '').startsWith('video/') ? 'video' : 'image';
  settings.heroBackgroundType = mediaType;
  settings.heroBackgroundUrl = `/api/admin/hero-media/${heroMedia._id}`;
  settings.heroBackgroundOriginalName = String(req.file.originalname || '').trim();
  await settings.save();
  await writeAudit(req, 'hero_background_uploaded', {
    entityType: 'settings',
    entityId: 'default',
    metadata: {
      heroBackgroundType: settings.heroBackgroundType,
      heroBackgroundUrl: settings.heroBackgroundUrl,
      heroBackgroundOriginalName: settings.heroBackgroundOriginalName
    }
  });
  res.json(settings);
}));

router.get('/hero-media/:id', asyncHandler(async (req, res) => {
  const media = await HeroMedia.findById(req.params.id);
  if (!media) return res.status(404).json({ message: 'Hero media not found' });
  res.set('Content-Type', media.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(media.data);
}));

router.get('/audit-logs', auth(['admin']), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
  const [items, total] = await Promise.all([
    AuditLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments({})
  ]);
  res.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

router.get('/payouts', auth(['admin']), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 25, maxLimit: 100 });
  const [items, total] = await Promise.all([
    Payout.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payout.countDocuments({})
  ]);
  res.json({ items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
}));

router.post('/payouts', auth(['admin']), asyncHandler(async (req, res) => {
  const sellerId = String(req.body?.sellerId || '').trim();
  const amount = Number(req.body?.amount || 0);
  if (!sellerId || amount <= 0) return res.status(400).json({ message: 'sellerId and amount are required' });
  const seller = await Seller.findById(sellerId, { name: 1 });
  if (!seller) return res.status(404).json({ message: 'Seller not found' });
  const settings = await getSettings();
  const commissionAmount = Math.round(amount * (Number(settings.commissionRate || 0) / 100));
  const payout = await Payout.create({
    sellerId,
    sellerName: seller.name,
    grossAmount: amount,
    commissionAmount,
    amount: Math.max(0, amount - commissionAmount),
    note: String(req.body?.note || '').trim()
  });
  await writeAudit(req, 'payout_created', { entityType: 'payout', entityId: String(payout._id), metadata: payout.toObject() });
  res.status(201).json(payout);
}));

router.patch('/payouts/:id/status', auth(['admin']), asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!['pending', 'approved', 'paid', 'rejected'].includes(status)) return res.status(400).json({ message: 'Invalid payout status' });
  const update = { status };
  if (status === 'paid') update.paidAt = new Date();
  const payout = await Payout.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!payout) return res.status(404).json({ message: 'Payout not found' });
  await writeAudit(req, 'payout_status_updated', { entityType: 'payout', entityId: String(payout._id), metadata: { status } });
  res.json(payout);
}));

module.exports = router;
