const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const validateObjectId = require('../middleware/validateObjectId');
const { parsePagination } = require('../utils/validation');

const router = express.Router();
const MAX_REELS_PER_SELLER = 20;
const MAX_PROMOS_PER_SELLER = 20;

function inferReelPlatformFromUrl(rawUrl) {
  const u = new URL(rawUrl);
  const host = String(u.hostname || '').toLowerCase();
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('tiktok.com')) return 'tiktok';
  return '';
}

function normalizeSellerReel(platformInput, reelUrlInput) {
  const reelUrl = String(reelUrlInput || '').trim();
  if (!reelUrl) return { error: 'Reel URL is required' };

  let platform = String(platformInput || '').trim().toLowerCase();
  let parsed;
  try {
    parsed = new URL(reelUrl);
  } catch (_) {
    return { error: 'Reel URL must be a valid URL' };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { error: 'Reel URL must start with http:// or https://' };
  }

  if (!platform) platform = inferReelPlatformFromUrl(reelUrl);
  if (!['instagram', 'tiktok'].includes(platform)) {
    return { error: 'Reel platform must be either instagram or tiktok' };
  }

  const host = String(parsed.hostname || '').toLowerCase();
  const path = String(parsed.pathname || '');
  if (platform === 'instagram') {
    if (!host.includes('instagram.com')) return { error: 'Instagram reel URL must be on instagram.com' };
    const match = path.match(/\/reel\/([A-Za-z0-9_-]+)/i);
    if (!match) return { error: 'Instagram reel URL must contain /reel/{id}' };
    const reelId = match[1];
    return { value: { platform: 'instagram', reelUrl: `https://www.instagram.com/reel/${reelId}/` } };
  }

  if (!host.includes('tiktok.com')) return { error: 'TikTok reel URL must be on tiktok.com' };
  const idMatch = path.match(/\/video\/(\d+)/i);
  if (!idMatch) return { error: 'TikTok URL must contain /video/{id}' };
  const videoId = idMatch[1];
  const userMatch = path.match(/^\/@([^/]+)\/video\/\d+/i);
  const canonicalUrl = userMatch
    ? `https://www.tiktok.com/@${userMatch[1]}/video/${videoId}`
    : `https://www.tiktok.com/video/${videoId}`;

  return { value: { platform: 'tiktok', reelUrl: canonicalUrl } };
}

async function checkReelAvailability(reelUrl) {
  const timeoutMs = 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(reelUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'NYLEDRIP-ReelValidator/1.0' }
    });
    const status = Number(response.status || 0);
    if (status === 404) {
      return { status: 'private_or_removed', message: 'Reel page returned 404' };
    }
    if (status >= 500 || status === 0) {
      return { status: 'unreachable', message: `Reel host returned ${status || 'no status'}` };
    }
    if (status === 401 || status === 403) {
      return { status: 'restricted', message: `Reel host returned ${status}` };
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const maybeHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');
    if (!maybeHtml) return { status: 'active', message: '' };

    const text = String(await response.text()).slice(0, 40000).toLowerCase();
    const removalHints = [
      "sorry, this page isn't available",
      'video unavailable',
      "couldn't find this page",
      'page not found'
    ];
    if (removalHints.some((token) => text.includes(token))) {
      return { status: 'private_or_removed', message: 'Reel may be private or removed' };
    }
    return { status: 'active', message: '' };
  } catch (err) {
    const name = String(err?.name || '').toLowerCase();
    if (name.includes('abort')) {
      return { status: 'unreachable', message: `Validation timeout after ${timeoutMs}ms` };
    }
    return { status: 'unreachable', message: 'Unable to reach reel URL' };
  } finally {
    clearTimeout(timer);
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20, maxLimit: 100 });
  const search = String(req.query.search || '').trim();
  const filter = search
    ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }
    : {};
  const [items, total] = await Promise.all([
    Seller.find(filter, { password: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Seller.countDocuments(filter)
  ]);
  res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.get('/:id', validateObjectId('id'), asyncHandler(async (req, res) => {
  const seller = await Seller.findById(req.params.id, { password: 0 });
  if (!seller) return res.status(404).json({ message: 'Not found' });
  res.json(seller);
}));

router.get('/:id/reels/analytics', auth(['seller', 'admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  if (req.user.role === 'seller' && String(req.user.id) !== String(req.params.id)) {
    return res.status(403).json({ message: 'You can only access your own analytics' });
  }
  const seller = await Seller.findById(req.params.id, { reels: 1, name: 1 });
  if (!seller) return res.status(404).json({ message: 'Not found' });

  const items = (seller.reels || []).map((reel) => ({
    reelId: reel.reelId,
    platform: reel.platform,
    reelUrl: reel.reelUrl,
    productId: reel.productId,
    title: reel.title || '',
    views: Number(reel.views || 0),
    clicks: Number(reel.clicks || 0),
    ctr: Number(reel.views || 0) > 0 ? Number(((Number(reel.clicks || 0) / Number(reel.views || 0)) * 100).toFixed(2)) : 0,
    status: reel.status || 'unknown',
    statusMessage: reel.statusMessage || '',
    lastCheckedAt: reel.lastCheckedAt || null
  }));
  const totals = items.reduce((acc, item) => {
    acc.views += Number(item.views || 0);
    acc.clicks += Number(item.clicks || 0);
    return acc;
  }, { views: 0, clicks: 0 });
  totals.ctr = totals.views > 0 ? Number(((totals.clicks / totals.views) * 100).toFixed(2)) : 0;

  res.json({ sellerId: String(seller._id), sellerName: seller.name, totals, items });
}));

router.post('/:id/reels/:reelId/view', validateObjectId('id'), asyncHandler(async (req, res) => {
  const seller = await Seller.findById(req.params.id, { reels: 1 });
  if (!seller) return res.status(404).json({ message: 'Not found' });
  const reel = seller.reels.find((item) => String(item.reelId) === String(req.params.reelId));
  if (!reel) return res.status(404).json({ message: 'Reel not found' });
  reel.views = Number(reel.views || 0) + 1;
  await seller.save();
  res.json({ ok: true, reelId: reel.reelId, views: reel.views });
}));

router.post('/:id/reels/:reelId/click', validateObjectId('id'), asyncHandler(async (req, res) => {
  const seller = await Seller.findById(req.params.id, { reels: 1 });
  if (!seller) return res.status(404).json({ message: 'Not found' });
  const reel = seller.reels.find((item) => String(item.reelId) === String(req.params.reelId));
  if (!reel) return res.status(404).json({ message: 'Reel not found' });
  reel.clicks = Number(reel.clicks || 0) + 1;
  await seller.save();
  res.json({ ok: true, reelId: reel.reelId, clicks: reel.clicks });
}));

router.put('/:id', auth(['seller', 'admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  if (req.user.role === 'seller' && String(req.user.id) !== String(req.params.id)) {
    return res.status(403).json({ message: 'You can only update your own seller account' });
  }

  const payload = { ...req.body };
  const safeStatusValues = ['accepted', 'suspended', 'active'];

  if (payload.status && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only admins can update seller status' });
  }
  if (payload.status && !safeStatusValues.includes(String(payload.status).toLowerCase())) {
    return res.status(400).json({ message: 'Invalid seller status' });
  }
  if (payload.status) {
    payload.status = String(payload.status).toLowerCase() === 'active' ? 'accepted' : String(payload.status).toLowerCase();
  }

  if (payload.passwordChange) {
    const { currentPassword, newPassword } = payload.passwordChange;
    if (!currentPassword || !newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ message: 'Valid current/new password are required' });
    }
    const seller = await Seller.findById(req.params.id);
    if (!seller) return res.status(404).json({ message: 'Not found' });

    const ok = await bcrypt.compare(currentPassword, seller.password);
    if (!ok) return res.status(400).json({ message: 'Current password invalid' });
    seller.password = await bcrypt.hash(newPassword, 10);
    await seller.save();
  }

  if (payload.socials && typeof payload.socials === 'object') {
    const urlKeys = ['instagram', 'facebook', 'tiktok', 'website'];
    for (const key of urlKeys) {
      const value = String(payload.socials[key] || '').trim();
      if (!value) continue;
      if (!/^https?:\/\//i.test(value)) {
        return res.status(400).json({ message: `${key} must be a valid URL starting with http:// or https://` });
      }
      payload.socials[key] = value;
    }
  }

  if (payload.reels !== undefined) {
    if (!Array.isArray(payload.reels)) {
      return res.status(400).json({ message: 'Seller reels must be an array' });
    }
    if (payload.reels.length > MAX_REELS_PER_SELLER) {
      return res.status(400).json({ message: `Maximum ${MAX_REELS_PER_SELLER} reels per seller are allowed` });
    }

    const currentSeller = await Seller.findById(req.params.id, { reels: 1 });
    if (!currentSeller) return res.status(404).json({ message: 'Not found' });
    const previousByReelId = new Map((currentSeller.reels || []).map((reel) => [String(reel.reelId), reel]));

    const normalizedReels = [];
    for (let i = 0; i < payload.reels.length; i += 1) {
      const reel = payload.reels[i] || {};
      const productId = String(reel.productId || '').trim();
      const title = String(reel.title || '').trim().slice(0, 80);
      const reelIdRaw = String(reel.reelId || '').trim();
      if (!productId) {
        return res.status(400).json({ message: `Reel item ${i + 1} is missing productId` });
      }
      if (!/^[a-f\d]{24}$/i.test(productId)) {
        return res.status(400).json({ message: `Reel item ${i + 1} has invalid productId` });
      }

      const normalized = normalizeSellerReel(reel.platform, reel.reelUrl || reel.url || '');
      if (normalized.error) {
        return res.status(400).json({ message: `Reel item ${i + 1}: ${normalized.error}` });
      }

      const reelId = /^[a-f\d]{24}$/i.test(reelIdRaw) ? reelIdRaw : new mongoose.Types.ObjectId().toString();
      const previous = previousByReelId.get(reelId);
      const availability = await checkReelAvailability(normalized.value.reelUrl);

      normalizedReels.push({
        reelId,
        platform: normalized.value.platform,
        reelUrl: normalized.value.reelUrl,
        productId,
        title,
        views: Number(previous?.views || 0),
        clicks: Number(previous?.clicks || 0),
        status: availability.status || 'unknown',
        statusMessage: availability.message || '',
        lastCheckedAt: new Date()
      });
    }

    const uniqueProductIds = [...new Set(normalizedReels.map((item) => item.productId))];
    if (uniqueProductIds.length) {
      const linkedProducts = await Product.find(
        { _id: { $in: uniqueProductIds }, sellerId: String(req.params.id) },
        { _id: 1 }
      );
      if (linkedProducts.length !== uniqueProductIds.length) {
        return res.status(400).json({ message: 'Each reel must be linked to one of this seller products' });
      }
    }
    payload.reels = normalizedReels;
  }

  if (payload.promoCodes !== undefined) {
    if (!Array.isArray(payload.promoCodes)) {
      return res.status(400).json({ message: 'Seller promoCodes must be an array' });
    }
    if (payload.promoCodes.length > MAX_PROMOS_PER_SELLER) {
      return res.status(400).json({ message: `Maximum ${MAX_PROMOS_PER_SELLER} promo codes are allowed` });
    }
    const normalizedPromoCodes = [];
    for (let i = 0; i < payload.promoCodes.length; i += 1) {
      const row = payload.promoCodes[i] || {};
      const code = String(row.code || '').trim().toUpperCase();
      const type = String(row.type || '').trim().toLowerCase();
      const value = Number(row.value);
      const minOrderAmount = Number(row.minOrderAmount || 0);
      const maxRedemptions = Number(row.maxRedemptions || 0);
      const perUserLimit = Number(row.perUserLimit || 0);
      const expiresAtRaw = String(row.expiresAt || '').trim();
      const active = row.active === undefined ? true : Boolean(row.active);

      if (!code || !/^[A-Z0-9_-]{3,24}$/.test(code)) {
        return res.status(400).json({ message: `Promo code at row ${i + 1} is invalid` });
      }
      if (!['percentage', 'fixed'].includes(type)) {
        return res.status(400).json({ message: `Promo code ${code} has invalid type` });
      }
      if (!Number.isFinite(value) || value <= 0) {
        return res.status(400).json({ message: `Promo code ${code} has invalid value` });
      }
      if (type === 'percentage' && value > 90) {
        return res.status(400).json({ message: `Promo code ${code} percentage must be <= 90` });
      }
      if (!Number.isFinite(minOrderAmount) || minOrderAmount < 0) {
        return res.status(400).json({ message: `Promo code ${code} has invalid minOrderAmount` });
      }
      if (!Number.isFinite(maxRedemptions) || maxRedemptions < 0) {
        return res.status(400).json({ message: `Promo code ${code} has invalid maxRedemptions` });
      }
      if (!Number.isFinite(perUserLimit) || perUserLimit < 0) {
        return res.status(400).json({ message: `Promo code ${code} has invalid perUserLimit` });
      }
      const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
      if (expiresAtRaw && Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ message: `Promo code ${code} has invalid expiresAt` });
      }
      normalizedPromoCodes.push({
        code,
        type,
        value: type === 'percentage' ? Math.round(value * 100) / 100 : Math.round(value),
        minOrderAmount: Math.round(minOrderAmount),
        expiresAt,
        maxRedemptions: Math.round(maxRedemptions),
        firstOrderOnly: Boolean(row.firstOrderOnly),
        perUserLimit: Math.round(perUserLimit),
        active,
        usageCount: Number(row.usageCount || 0)
      });
    }
    const uniqueCodes = new Set(normalizedPromoCodes.map((x) => x.code));
    if (uniqueCodes.size !== normalizedPromoCodes.length) {
      return res.status(400).json({ message: 'Promo codes must be unique per seller' });
    }
    payload.promoCodes = normalizedPromoCodes;
  }

  if (payload.name && String(payload.name).trim().length < 2) {
    return res.status(400).json({ message: 'Seller name must be at least 2 characters' });
  }

  delete payload.password;
  delete payload.passwordChange;
  delete payload._id;
  delete payload.email;

  const seller = await Seller.findByIdAndUpdate(req.params.id, payload, { new: true, projection: { password: 0 } });
  if (!seller) return res.status(404).json({ message: 'Not found' });

  const productPatch = {};
  if (typeof payload.logo === 'string') productPatch.sellerLogo = payload.logo;
  if (typeof payload.name === 'string' && payload.name.trim()) productPatch.sellerName = payload.name.trim();
  if (Object.keys(productPatch).length) {
    await Product.updateMany({ sellerId: String(seller._id) }, { $set: productPatch });
  }

  res.json(seller);
}));

module.exports = router;
