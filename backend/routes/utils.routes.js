const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const PlatformSettings = require('../models/PlatformSettings');

const router = express.Router();

router.get('/public-settings', asyncHandler(async (req, res) => {
  const settings = await PlatformSettings.findOne({ key: 'default' }) || {};
  res.json({
    heroBackgroundType: settings.heroBackgroundType || 'default',
    heroBackgroundUrl: settings.heroBackgroundUrl || '',
    heroBackgroundOriginalName: settings.heroBackgroundOriginalName || ''
  });
}));

router.get('/currency', asyncHandler(async (req, res) => {
  const base = String(req.query.base || 'EGP').toUpperCase();
  const target = String(req.query.target || 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(target)) {
    return res.status(400).json({ message: 'base and target must be 3-letter currency codes' });
  }
  if (base === target) {
    return res.json({ base, target, rate: 1, provider: 'identity' });
  }
  if (typeof fetch !== 'function') {
    return res.status(501).json({ message: 'Server runtime does not support fetch' });
  }

  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(target)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    return res.status(502).json({ message: 'Currency service unavailable' });
  }
  const payload = await response.json();
  const rate = Number(payload?.rates?.[target]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return res.status(502).json({ message: 'Invalid currency response' });
  }
  return res.json({
    base,
    target,
    rate,
    provider: 'exchangerate.host',
    timestamp: payload?.date || null
  });
}));

module.exports = router;
