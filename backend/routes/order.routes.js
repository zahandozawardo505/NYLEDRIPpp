const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const User = require('../models/User');
const PlatformSettings = require('../models/PlatformSettings');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { generateOrderId } = require('../middleware/orderId');
const { parsePagination } = require('../utils/validation');
const { writeAudit } = require('../utils/audit');

const router = express.Router();

function computePromoDiscount(subtotal, promo) {
  if (!promo || !promo.active) return 0;
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) return 0;
  if (Number(promo.maxRedemptions || 0) > 0 && Number(promo.usageCount || 0) >= Number(promo.maxRedemptions || 0)) return 0;
  const minOrder = Number(promo.minOrderAmount || 0);
  if (Number(subtotal) < minOrder) return 0;
  if (promo.type === 'percentage') {
    return Math.max(0, Math.round((Number(subtotal) * Number(promo.value || 0)) / 100));
  }
  return Math.max(0, Math.round(Number(promo.value || 0)));
}

async function promoAllowedForUser(promo, userId, sellerId, session = null) {
  if (!promo || !userId || !sellerId) return false;
  if (promo.firstOrderOnly) {
    const existing = await Order.countDocuments({ userId: String(userId), sellerId: String(sellerId) }).session(session);
    if (existing > 0) return false;
  }
  const perUserLimit = Number(promo.perUserLimit || 0);
  if (perUserLimit > 0) {
    const used = await Order.countDocuments({
      userId: String(userId),
      sellerId: String(sellerId),
      promoCode: String(promo.code || '').toUpperCase()
    }).session(session);
    if (used >= perUserLimit) return false;
  }
  return true;
}

async function pushUserNotification(userId, payload, session = null) {
  if (!userId) return;
  await User.updateOne(
    { _id: userId, 'preferences.notifications.orderUpdates': { $ne: false } },
    {
      $push: {
        notifications: {
          $each: [payload],
          $position: 0,
          $slice: 50
        }
      }
    },
    { session }
  );
}

async function getCommissionRate() {
  const settings = await PlatformSettings.findOne({ key: 'default' }, { commissionRate: 1 });
  return Number(settings?.commissionRate ?? 10);
}

function sanitizeShippingAddress(raw = {}) {
  const address = raw && typeof raw === 'object' ? raw : {};
  const fullName = String(address.fullName || '').trim();
  const phone = String(address.phone || '').trim();
  const city = String(address.city || '').trim();
  const line1 = String(address.line1 || '').trim();
  const country = String(address.country || 'Egypt').trim() || 'Egypt';
  const note = String(address.note || '').trim().slice(0, 500);

  if (fullName.length < 3) throw new Error('Shipping full name is required');
  if (!/^[0-9+\-\s]{8,18}$/.test(phone)) throw new Error('Valid shipping phone is required');
  if (city.length < 2) throw new Error('Shipping city is required');
  if (line1.length < 8) throw new Error('Complete shipping address is required');

  return { fullName, phone, city, line1, country, note };
}

router.get('/', auth(['user', 'seller', 'admin']), asyncHandler(async (req, res) => {
  const { sellerId, userId } = req.query;
  const { page, limit, skip } = parsePagination(req.query, { limit: 20, maxLimit: 100 });
  const query = {};

  if (req.user.role === 'user') {
    query.userId = req.user.id;
  } else if (req.user.role === 'seller') {
    query.sellerId = req.user.id;
  } else {
    if (sellerId) query.sellerId = String(sellerId);
    if (userId) query.userId = String(userId);
  }

  const [items, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(query)
  ]);
  res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.get('/:id/tracking', auth(['user', 'seller', 'admin']), asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
      { id: String(req.params.id) }
    ]
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (req.user.role === 'user' && String(order.userId) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
  if (req.user.role === 'seller' && String(order.sellerId) !== String(req.user.id)) return res.status(403).json({ message: 'Not allowed' });
  const steps = ['pending', 'accepted', 'preparing', 'on_the_way', 'shipped', 'delivered', 'completed'];
  const currentIndex = steps.indexOf(order.status);
  return res.json({
    id: order.id,
    status: order.status,
    trackingNumber: order.trackingNumber || '',
    estimatedDeliveryAt: order.estimatedDeliveryAt || null,
    timeline: steps.map((step, index) => ({
      status: step,
      label: step.replace(/_/g, ' '),
      complete: currentIndex >= index,
      current: currentIndex === index
    }))
  });
}));

router.post('/promo-quote', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const promoCode = String(req.body?.promoCode || '').trim().toUpperCase();
  if (!promoCode) return res.status(400).json({ message: 'promoCode is required' });
  if (!items.length) return res.status(400).json({ message: 'items are required' });

  const productIds = items
    .map((item) => String(item?.productId || '').trim())
    .filter((id) => mongoose.isValidObjectId(id));
  if (!productIds.length) return res.status(400).json({ message: 'No valid product IDs in cart' });

  const products = await Product.find({ _id: { $in: productIds } }, { _id: 1, sellerId: 1, price: 1 });
  const byId = new Map(products.map((p) => [String(p._id), p]));
  let subtotal = 0;
  const sellerSubtotal = new Map();
  for (const item of items) {
    const product = byId.get(String(item?.productId || ''));
    if (!product) continue;
    const qty = Math.max(0, Number(item?.quantity || 0));
    const line = Math.round(Number(product.price || 0) * qty);
    subtotal += line;
    sellerSubtotal.set(String(product.sellerId), (sellerSubtotal.get(String(product.sellerId)) || 0) + line);
  }
  if (subtotal <= 0) return res.status(400).json({ message: 'Cart subtotal must be greater than zero' });

  const sellerIds = [...sellerSubtotal.keys()];
  const sellers = await Seller.find({ _id: { $in: sellerIds } }, { promoCodes: 1, name: 1 });
  let best = { discountAmount: 0, sellerId: '', sellerName: '', promoType: '', promoValue: 0 };
  for (const seller of sellers) {
    const promo = (seller.promoCodes || []).find((row) => row.code === promoCode && row.active);
    if (!promo) continue;
    const allowed = await promoAllowedForUser(promo, req.user.id, seller._id);
    if (!allowed) continue;
    const sellerSub = sellerSubtotal.get(String(seller._id)) || 0;
    const discount = Math.min(sellerSub, computePromoDiscount(sellerSub, promo));
    if (discount > best.discountAmount) {
      best = {
        discountAmount: discount,
        sellerId: String(seller._id),
        sellerName: seller.name || '',
        promoType: promo.type,
        promoValue: promo.value
      };
    }
  }

  if (best.discountAmount <= 0) {
    return res.status(404).json({ message: 'Promo code not applicable to current cart' });
  }

  res.json({
    ok: true,
    promoCode,
    subtotal,
    discountAmount: best.discountAmount,
    sellerId: best.sellerId,
    sellerName: best.sellerName,
    promoType: best.promoType,
    promoValue: best.promoValue
  });
}));

router.post('/payments/webhook', asyncHandler(async (req, res) => {
  const provider = String(req.body?.provider || req.query.provider || 'manual').toLowerCase();
  const reference = String(req.body?.paymentReference || req.body?.reference || '').trim();
  const orderId = String(req.body?.orderId || '').trim();
  const status = String(req.body?.paymentStatus || req.body?.status || '').toLowerCase();
  const allowed = ['pending', 'paid', 'failed', 'refunded'];
  if (!orderId || !allowed.includes(status)) {
    return res.status(400).json({ message: 'orderId and valid paymentStatus are required' });
  }
  const order = await Order.findOne({
    $or: [
      { id: orderId },
      ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : [])
    ]
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  order.paymentProvider = provider;
  order.paymentReference = reference || order.paymentReference;
  order.paymentStatus = status;
  await order.save();
  await pushUserNotification(order.userId, {
    type: 'payment_status',
    title: 'Payment status updated',
    message: `Payment for order ${order.id} is now ${status}.`,
    entityType: 'order',
    entityId: order.id
  });
  return res.json({ ok: true });
}));

router.post('/', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { productId, quantity, selectedColor, selectedSize, promoCode: promoCodeRaw } = req.body;
      const qty = Number(quantity || 1);
      const promoCode = String(promoCodeRaw || '').trim().toUpperCase();
      const paymentMethod = String(req.body?.paymentMethod || 'cash_on_delivery').trim().toLowerCase();
      const allowedPaymentMethods = ['cash_on_delivery', 'card', 'wallet', 'paymob', 'fawry', 'stripe'];
      if (!allowedPaymentMethods.includes(paymentMethod)) throw new Error('Invalid payment method');
      const shippingAddress = sanitizeShippingAddress(req.body?.shippingAddress);
      if (!mongoose.isValidObjectId(productId)) throw new Error('Invalid productId');
      if (!Number.isFinite(qty) || qty < 1) throw new Error('Quantity must be at least 1');
      if (!String(selectedColor || '').trim()) throw new Error('Color is required');
      if (!String(selectedSize || '').trim()) throw new Error('Size is required');

      const product = await Product.findById(productId).session(session);
      if (!product) throw new Error('Product not found');

      const variant = product.variants.find(v => v.colorName === selectedColor);
      if (!variant) throw new Error('Color not found');

      const sizeRow = variant.sizes.find(s => s.size === selectedSize);
      if (!sizeRow) throw new Error('Size not found');
      if (sizeRow.stock < qty) throw new Error('Insufficient stock');

      sizeRow.stock -= qty;
      await product.save({ session });
      product.orderCount = Number(product.orderCount || 0) + 1;
      await product.save({ session });

      const unitPrice = Number(product.price || 0);
      const cost = Number(product.cost || 0);
      let discountAmount = 0;
      if (promoCode) {
        const seller = await Seller.findById(product.sellerId, { promoCodes: 1 }).session(session);
        const promo = seller?.promoCodes?.find((row) => row.code === promoCode && row.active);
        if (promo) {
          const allowed = await promoAllowedForUser(promo, req.user.id, product.sellerId, session);
          discountAmount = allowed ? computePromoDiscount(unitPrice * qty, promo) : 0;
          if (discountAmount > unitPrice * qty) discountAmount = unitPrice * qty;
          if (discountAmount > 0) {
            promo.usageCount = Number(promo.usageCount || 0) + 1;
            await seller.save({ session });
          }
        }
      }
      const totalPrice = Math.max(0, (unitPrice * qty) - discountAmount);
      const commissionRate = await getCommissionRate();
      const commissionAmount = Math.round(totalPrice * (commissionRate / 100));
      const orderDoc = {
        id: await generateOrderId(product.sellerId, product._id),
        sellerId: product.sellerId,
        productId: String(product._id),
        userId: req.user.id,
        quantity: qty,
        selectedColor,
        selectedSize,
        unitPrice,
        discountAmount,
        promoCode: discountAmount > 0 ? promoCode : '',
        totalPrice,
        profit: totalPrice - (cost * qty),
        commissionAmount,
        sellerPayoutAmount: Math.max(0, totalPrice - commissionAmount),
        paymentMethod,
        paymentStatus: paymentMethod === 'cash_on_delivery' ? 'unpaid' : 'pending',
        paymentProvider: paymentMethod === 'cash_on_delivery' ? '' : paymentMethod,
        estimatedDeliveryAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        shippingAddress,
        status: 'pending'
      };

      const [created] = await Order.create([orderDoc], { session });
      await writeAudit(req, 'order_created', { entityType: 'order', entityId: created.id, metadata: { totalPrice, paymentMethod } });
      await pushUserNotification(req.user.id, {
        type: 'order_created',
        title: 'Order received',
        message: `Your order ${created.id} was placed successfully.`,
        entityType: 'order',
        entityId: created.id
      }, session);
      await session.commitTransaction();
      return res.status(201).json(created);
    } catch (err) {
      lastError = err;
      await session.abortTransaction();

      const message = String(err?.message || '');
      const isWriteConflict = message.toLowerCase().includes('write conflict');
      const isTransient = Boolean(err?.errorLabels?.includes?.('TransientTransactionError'));
      const shouldRetry = attempt < maxAttempts && (isWriteConflict || isTransient);
      if (!shouldRetry) break;
    } finally {
      session.endSession();
    }
  }

  const message = String(lastError?.message || 'Order creation failed');
  const status = message.toLowerCase().includes('not found') ? 404 : 400;
  return res.status(status).json({
    message: lastError?.message || 'Order creation failed'
  });
}));

router.patch('/:id/status', auth(['seller', 'admin']), asyncHandler(async (req, res) => {
  const allowed = ['pending', 'accepted', 'ignored', 'preparing', 'on_the_way', 'shipped', 'delivered', 'completed', 'cancelled', 'return_requested', 'returned', 'refunded'];
  const status = String(req.body?.status || '').trim().toLowerCase();
  if (!allowed.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const order = await Order.findOne({
    $or: [
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
      { id: String(req.params.id) }
    ]
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });

  if (req.user.role === 'seller' && String(order.sellerId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'Not allowed' });
  }

  order.status = status;
  if (req.body?.fulfillmentNote !== undefined) order.fulfillmentNote = String(req.body.fulfillmentNote || '').trim().slice(0, 500);
  if (req.body?.trackingNumber !== undefined) order.trackingNumber = String(req.body.trackingNumber || '').trim().slice(0, 120);
  if (status === 'refunded') order.paymentStatus = 'refunded';
  if (status === 'cancelled' && !order.cancelledAt) order.cancelledAt = new Date();
  await order.save();
  await writeAudit(req, 'order_status_updated', { entityType: 'order', entityId: order.id, metadata: { status } });
  await pushUserNotification(order.userId, {
    type: 'order_status',
    title: 'Order status updated',
    message: `Order ${order.id} is now ${status.replace(/_/g, ' ')}.`,
    entityType: 'order',
    entityId: order.id
  });
  return res.json(order);
}));

router.post('/:id/cancel', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
      { id: String(req.params.id) }
    ]
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (req.user.role !== 'admin' && String(order.userId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'Not allowed' });
  }
  if (!['pending', 'accepted'].includes(order.status)) {
    return res.status(400).json({ message: 'Only pending or accepted orders can be cancelled' });
  }
  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = String(req.body?.reason || '').trim().slice(0, 300);
  await order.save();
  await writeAudit(req, 'order_cancelled', { entityType: 'order', entityId: order.id, metadata: { reason: order.cancellationReason } });
  await pushUserNotification(order.userId, {
    type: 'order_cancelled',
    title: 'Order cancelled',
    message: `Order ${order.id} was cancelled.`,
    entityType: 'order',
    entityId: order.id
  });
  return res.json(order);
}));

router.post('/:id/return-request', auth(['user', 'admin']), asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    $or: [
      ...(mongoose.isValidObjectId(req.params.id) ? [{ _id: req.params.id }] : []),
      { id: String(req.params.id) }
    ]
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (req.user.role !== 'admin' && String(order.userId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'Not allowed' });
  }
  if (!['delivered', 'completed'].includes(order.status)) {
    return res.status(400).json({ message: 'Returns can be requested after delivery' });
  }
  order.status = 'return_requested';
  order.returnRequestedAt = new Date();
  order.returnReason = String(req.body?.reason || '').trim().slice(0, 500);
  order.returnImageUrls = Array.isArray(req.body?.imageUrls) ? req.body.imageUrls.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5) : [];
  await order.save();
  await writeAudit(req, 'return_requested', { entityType: 'order', entityId: order.id, metadata: { reason: order.returnReason } });
  await pushUserNotification(order.userId, {
    type: 'return_requested',
    title: 'Return request received',
    message: `Return request for order ${order.id} was submitted.`,
    entityType: 'order',
    entityId: order.id
  });
  return res.json(order);
}));

module.exports = router;
