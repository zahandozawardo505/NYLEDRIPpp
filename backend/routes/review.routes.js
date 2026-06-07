const express = require('express');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { parsePagination } = require('../utils/validation');
const { recomputeProductMetrics } = require('../utils/product-metrics');

const router = express.Router();
const DELIVERED_STATUSES = new Set(['shipped', 'delivered', 'completed']);

router.get('/', auth(['admin']), asyncHandler(async (req, res) => {
  const status = String(req.query.status || '').trim().toLowerCase();
  const productId = String(req.query.productId || '').trim();
  const { page, limit, skip } = parsePagination(req.query, { limit: 20, maxLimit: 100 });
  const filter = {};
  if (status && ['visible', 'hidden', 'reported'].includes(status)) filter.status = status;
  if (productId) {
    if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Invalid productId' });
    filter.productId = productId;
  }

  const [items, total] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Review.countDocuments(filter)
  ]);
  const productIds = [...new Set(items.map((x) => String(x.productId)))].filter((id) => mongoose.isValidObjectId(id));
  const userIds = [...new Set(items.map((x) => String(x.userId)))].filter((id) => mongoose.isValidObjectId(id));
  const [products, users] = await Promise.all([
    Product.find({ _id: { $in: productIds } }, { name: 1 }),
    User.find({ _id: { $in: userIds } }, { name: 1, email: 1 })
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p.name || 'Unknown product']));
  const userById = new Map(users.map((u) => [String(u._id), { name: u.name, email: u.email }]));

  return res.json({
    items: items.map((review) => {
      const user = userById.get(String(review.userId)) || {};
      return {
        _id: review._id,
        productId: review.productId,
        productName: productById.get(String(review.productId)) || 'Unknown product',
        userId: review.userId,
        userName: user.name || 'Customer',
        userEmail: user.email || '',
        orderId: review.orderId,
        rating: review.rating,
        comment: review.comment || '',
        status: review.status,
        createdAt: review.createdAt
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.get('/product/:productId', asyncHandler(async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Invalid productId' });

  const { page, limit, skip } = parsePagination(req.query, { limit: 10, maxLimit: 50 });
  const [items, total, product] = await Promise.all([
    Review.find({ productId, status: 'visible' }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Review.countDocuments({ productId, status: 'visible' }),
    Product.findById(productId, { averageRating: 1, reviewCount: 1, ratingBreakdown: 1, name: 1 })
  ]);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const userIds = [...new Set(items.map((x) => String(x.userId)))].filter((id) => mongoose.isValidObjectId(id));
  const users = await User.find({ _id: { $in: userIds } }, { name: 1 });
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  return res.json({
    product: {
      averageRating: Number(product.averageRating || 0),
      reviewCount: Number(product.reviewCount || 0),
      ratingBreakdown: product.ratingBreakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    },
    items: items.map((r) => ({
      _id: r._id,
      productId: r.productId,
      userId: r.userId,
      userName: nameById.get(String(r.userId)) || 'Customer',
      orderId: r.orderId,
      rating: r.rating,
      comment: r.comment || '',
      createdAt: r.createdAt
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.get('/eligibility/:productId', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const productId = String(req.params.productId || '').trim();
  if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Invalid productId' });
  const existing = await Review.findOne({ userId: req.user.id, productId });
  if (existing) return res.json({ eligible: false, reason: 'already_reviewed' });

  const deliveredOrder = await Order.findOne({
    userId: req.user.id,
    productId,
    status: { $in: [...DELIVERED_STATUSES] }
  }).sort({ createdAt: 1 });
  if (!deliveredOrder) return res.json({ eligible: false, reason: 'order_not_delivered' });
  return res.json({ eligible: true, orderId: deliveredOrder.id || String(deliveredOrder._id) });
}));

router.post('/', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const productId = String(req.body?.productId || '').trim();
  const rating = Number(req.body?.rating || 0);
  const comment = String(req.body?.comment || '').trim();

  if (!mongoose.isValidObjectId(productId)) return res.status(400).json({ message: 'Invalid productId' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be an integer from 1 to 5' });

  const product = await Product.findById(productId, { _id: 1 });
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const duplicate = await Review.findOne({ userId: req.user.id, productId });
  if (duplicate) return res.status(409).json({ message: 'You already reviewed this product' });

  const deliveredOrder = await Order.findOne({
    userId: req.user.id,
    productId,
    status: { $in: [...DELIVERED_STATUSES] }
  }).sort({ createdAt: 1 });
  if (!deliveredOrder) {
    return res.status(403).json({ message: 'You can review this item after your order is delivered.' });
  }

  const review = await Review.create({
    productId,
    userId: req.user.id,
    orderId: deliveredOrder.id || String(deliveredOrder._id),
    rating,
    comment,
    status: 'visible'
  });
  await recomputeProductMetrics(productId);

  return res.status(201).json(review);
}));

router.post('/:id/report', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid review id' });
  const review = await Review.findById(id);
  if (!review) return res.status(404).json({ message: 'Review not found' });
  review.status = 'reported';
  await review.save();
  return res.json({ ok: true });
}));

router.patch('/:id/status', auth(['admin']), asyncHandler(async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid review id' });
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!['visible', 'hidden', 'reported'].includes(status)) return res.status(400).json({ message: 'Invalid status' });

  const review = await Review.findById(id);
  if (!review) return res.status(404).json({ message: 'Review not found' });
  review.status = status;
  await review.save();
  await recomputeProductMetrics(review.productId);
  return res.json(review);
}));

module.exports = router;
