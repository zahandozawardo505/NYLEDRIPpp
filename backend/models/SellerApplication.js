const mongoose = require('mongoose');

const SellerApplicationSchema = new mongoose.Schema({
  brandName: { type: String, required: true, trim: true },
  brandDescription: { type: String, default: '' },
  brandCategory: { type: String, default: '' },
  ownerName: { type: String, required: true, trim: true },
  ownerPhone: { type: String, required: true, trim: true },
  sellerEmail: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true },
  businessLicenseUrl: { type: String, default: '' },
  bankAccount: { type: String, default: '' },
  status: { type: String, enum: ['waiting', 'accepted', 'rejected'], default: 'waiting' },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: String, default: '' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: true } });

module.exports = mongoose.model('SellerApplication', SellerApplicationSchema);
