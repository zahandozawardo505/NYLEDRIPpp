const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const SellerApplication = require('../models/SellerApplication');
const SellerDocument = require('../models/SellerDocument');
const Seller = require('../models/Seller');
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const validateObjectId = require('../middleware/validateObjectId');
const { isEmail, isUrl, parsePagination } = require('../utils/validation');

const ALLOWED_DOC_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg'
]);

function docFilter(_req, file, cb) {
  if (!ALLOWED_DOC_TYPES.has(file.mimetype)) {
    const err = new Error('Only PDF, JPG, PNG, and WEBP files are allowed');
    err.status = 400;
    return cb(err);
  }
  return cb(null, true);
}

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  fileFilter: docFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const router = express.Router();

router.post('/', uploadDoc.single('businessLicense'), asyncHandler(async (req, res) => {
  const {
    brandName, brandDescription, brandCategory, ownerName, ownerPhone,
    sellerEmail, password, businessLicenseUrl = '', bankAccount = ''
  } = req.body;

  if (!brandName || !ownerName || !ownerPhone || !sellerEmail || !password) {
    return res.status(400).json({ message: 'Brand, owner, phone, email, and password are required' });
  }
  if (!isEmail(sellerEmail)) {
    return res.status(400).json({ message: 'Invalid seller email format' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }
  if (!/^\d{10,15}$/.test(String(ownerPhone || '').trim())) {
    return res.status(400).json({ message: 'Owner phone must be 10 to 15 digits' });
  }

  const email = String(sellerEmail).toLowerCase().trim();
  if (await Seller.findOne({ email })) {
    return res.status(409).json({ message: 'Seller account already exists' });
  }

  let application = await SellerApplication.findOne({ sellerEmail: email });
  if (application && application.status === 'waiting') {
    return res.status(409).json({ message: 'Application already submitted and waiting review' });
  }

  let normalizedLicenseUrl = String(businessLicenseUrl || '').trim();
  if (req.file && req.file.buffer && req.file.buffer.length) {
    const doc = await SellerDocument.create({
      originalName: String(req.file.originalname || '').trim(),
      contentType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer
    });
    normalizedLicenseUrl = `${req.protocol}://${req.get('host')}/api/seller-applications/documents/${doc._id}`;
  }
  if (normalizedLicenseUrl && !isUrl(normalizedLicenseUrl)) {
    return res.status(400).json({ message: 'Business license must be a valid HTTPS/HTTP URL or uploaded file' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const payload = {
    brandName: String(brandName).trim(),
    brandDescription: String(brandDescription || '').trim(),
    brandCategory: String(brandCategory || '').trim(),
    ownerName: String(ownerName).trim(),
    ownerPhone: String(ownerPhone).trim(),
    sellerEmail: email,
    passwordHash,
    businessLicenseUrl: normalizedLicenseUrl,
    bankAccount: String(bankAccount || '').trim(),
    status: 'waiting',
    reviewedAt: null,
    reviewedBy: ''
  };

  if (application) {
    Object.assign(application, payload);
    await application.save();
  } else {
    application = await SellerApplication.create(payload);
  }

  return res.status(201).json({
    _id: application._id,
    brandName: application.brandName,
    brandDescription: application.brandDescription,
    brandCategory: application.brandCategory,
    ownerName: application.ownerName,
    ownerPhone: application.ownerPhone,
    sellerEmail: application.sellerEmail,
    businessLicenseUrl: application.businessLicenseUrl,
    status: application.status,
    createdAt: application.createdAt
  });
}));

router.get('/documents/:docId', validateObjectId('docId'), asyncHandler(async (req, res) => {
  const doc = await SellerDocument.findById(req.params.docId);
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  res.set('Content-Type', doc.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Disposition', `inline; filename="${doc.originalName || 'document'}"`);
  return res.send(doc.data);
}));

router.post('/upload-document', uploadDoc.single('document'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Document file is required' });
  if (!req.file.buffer || !req.file.buffer.length) {
    return res.status(400).json({ message: 'Uploaded document was empty' });
  }
  const doc = await SellerDocument.create({
    originalName: String(req.file.originalname || '').trim(),
    contentType: req.file.mimetype,
    size: req.file.size,
    data: req.file.buffer
  });
  const url = `/api/seller-applications/documents/${doc._id}`;
  return res.status(201).json({
    url,
    publicUrl: `${req.protocol}://${req.get('host')}${url}`,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storage: 'mongodb'
  });
}));

router.get('/', auth(['admin']), asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 15, maxLimit: 100 });
  const [items, total] = await Promise.all([
    SellerApplication.find({}, { passwordHash: 0 }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    SellerApplication.countDocuments({})
  ]);
  res.json({
    items,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 }
  });
}));

router.patch('/:id/review', auth(['admin']), validateObjectId('id'), asyncHandler(async (req, res) => {
  const { action } = req.body; // accept | reject
  const app = await SellerApplication.findById(req.params.id);
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (!['accept', 'reject'].includes(action)) return res.status(400).json({ message: 'Invalid action' });
  if (app.status !== 'waiting') return res.status(400).json({ message: 'Application already reviewed' });

  if (action === 'accept') {
    const exists = await Seller.findOne({ email: app.sellerEmail });
    if (!exists) {
      await Seller.create({
        name: app.brandName,
        email: app.sellerEmail,
        password: app.passwordHash,
        logo: '',
        description: app.brandDescription || '',
        socials: { instagram: '', facebook: '', tiktok: '', website: '' },
        status: 'accepted'
      });
    }
    app.status = 'accepted';
  } else {
    app.status = 'rejected';
  }
  app.reviewedAt = new Date();
  app.reviewedBy = req.user.id;
  await app.save();
  return res.json({
    _id: app._id,
    status: app.status,
    reviewedAt: app.reviewedAt,
    reviewedBy: app.reviewedBy
  });
}));

module.exports = router;
