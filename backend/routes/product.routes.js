const express = require('express');
const Product = require('../models/Product');
const ProductImage = require('../models/ProductImage');
const Seller = require('../models/Seller');
const User = require('../models/User');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const validateObjectId = require('../middleware/validateObjectId');
const { uploadProductImage } = require('../middleware/upload');
const { parsePagination, sanitizeProductPayload } = require('../utils/validation');
const { body } = require('express-validator');
const { validateRequest } = require('../middleware/validator');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 12, maxLimit: 100 });
  const search = String(req.query.search || '').trim();
  const sellerId = String(req.query.sellerId || '').trim();
  const category = String(req.query.category || '').trim();
  const subcategory = String(req.query.subcategory || '').trim();
  const gender = String(req.query.gender || '').trim();
  const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : null;
  const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : null;

  const filter = {};
  let projection = null;
  if (search) {
    filter.$text = { $search: search };
    projection = { score: { $meta: 'textScore' } };
  }
  if (sellerId) filter.sellerId = sellerId;
  if (category) filter.category = category;
  if (subcategory) filter.subcategory = subcategory;
  if (gender) filter.gender = gender;
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    filter.price = {};
    if (Number.isFinite(minPrice)) filter.price.$gte = Math.max(0, minPrice);
    if (Number.isFinite(maxPrice)) filter.price.$lte = Math.max(0, maxPrice);
  }

  const sortBy = String(req.query.sortBy || 'newest');
  const sortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_low: { price: 1 },
    price_high: { price: -1 },
    rating_high: { averageRating: -1, reviewCount: -1 },
    bestseller: { orderCount: -1, viewCount: -1 },
    trending: { viewCount: -1, orderCount: -1 }
  };
  const sort = search ? { score: { $meta: 'textScore' }, createdAt: -1 } : (sortMap[sortBy] || sortMap.newest);

  const [items, total] = await Promise.all([
    Product.find(filter, projection).sort(sort).skip(skip).limit(limit),
    Product.countDocuments(filter)
  ]);
  res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.get('/images/:imageId', validateObjectId('imageId'), asyncHandler(async (req, res) => {
  const image = await ProductImage.findById(req.params.imageId);
  if (!image) return res.status(404).json({ message: 'Image not found' });
  res.set('Content-Type', image.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  return res.send(image.data);
}));

router.get('/:id', validateObjectId('id'), asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }, { new: true });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
}));

router.post('/:id/back-in-stock', auth(['user', 'admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id, { _id: 1, name: 1 });
  if (!product) return res.status(404).json({ message: 'Product not found' });
  await User.updateOne(
    { _id: req.user.id },
    { $addToSet: { backInStockSubscriptions: String(product._id) } }
  );
  const count = await User.countDocuments({ backInStockSubscriptions: String(product._id) });
  product.backInStockCount = count;
  await product.save();
  res.json({ ok: true, productId: String(product._id), subscribers: count });
}));

router.post('/upload-image', auth(['seller', 'admin']), uploadProductImage.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Image file is required' });
  if (!req.file.buffer || !req.file.buffer.length) {
    return res.status(400).json({ message: 'Uploaded image was empty' });
  }
  const image = await ProductImage.create({
    sellerId: String(req.user.id),
    originalName: String(req.file.originalname || '').trim(),
    contentType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer
  });
  const url = `/api/products/images/${image._id}`;
  return res.status(201).json({
    url,
    publicUrl: `${req.protocol}://${req.get('host')}${url}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storage: 'mongodb'
  });
}));

router.post('/', auth(['seller', 'admin']), [
  body('name').trim().notEmpty().withMessage('Product name is required').escape(),
  body('category').trim().notEmpty().withMessage('Category is required').escape(),
  body('description').trim().escape()
], validateRequest, asyncHandler(async (req, res) => {
  const { normalized, errors } = sanitizeProductPayload(req.body);
  if (errors.length) return res.status(400).json({ message: errors[0], errors });

  if (req.user.role === 'seller' && String(normalized.sellerId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only create products for your own seller account' });
  }

  if (req.user.role === 'seller') {
    const seller = await Seller.findById(req.user.id, { name: 1, logo: 1 });
    if (!seller) return res.status(404).json({ message: 'Seller account not found' });
    normalized.sellerName = seller.name;
    normalized.sellerLogo = seller.logo || '';
  }

  const product = await Product.create(normalized);
  res.status(201).json(product);
}));

router.put('/:id', auth(['seller', 'admin']), validateObjectId('id'), [
  body('name').optional().trim().escape(),
  body('category').optional().trim().escape(),
  body('description').optional().trim().escape()
], validateRequest, asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Product not found' });
  if (req.user.role === 'seller' && String(existing.sellerId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only edit your own products' });
  }

  const mergedPayload = {
    ...existing.toObject(),
    ...req.body,
    sellerId: existing.sellerId
  };
  const { normalized, errors } = sanitizeProductPayload(mergedPayload);
  if (errors.length) return res.status(400).json({ message: errors[0], errors });

  if (req.user.role === 'seller') {
    const seller = await Seller.findById(req.user.id, { name: 1, logo: 1 });
    if (seller) {
      normalized.sellerName = seller.name;
      normalized.sellerLogo = seller.logo || '';
    }
  }

  const product = await Product.findByIdAndUpdate(req.params.id, normalized, { new: true, runValidators: true });
  res.json(product);
}));

router.delete('/:id', auth(['seller', 'admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Product not found' });
  if (req.user.role === 'seller' && String(existing.sellerId) !== String(req.user.id)) {
    return res.status(403).json({ message: 'You can only delete your own products' });
  }
  await Product.deleteOne({ _id: existing._id });
  const imageIds = (existing.images || [])
    .map((url) => String(url || '').match(/\/api\/products\/images\/([a-f\d]{24})/i)?.[1])
    .filter(Boolean);
  if (imageIds.length) {
    await ProductImage.deleteMany({ _id: { $in: imageIds } });
  }
  res.json({ ok: true, deletedImages: imageIds.length });
}));

module.exports = router;
