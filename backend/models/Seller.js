const mongoose = require('mongoose');

const SellerReelSchema = new mongoose.Schema({
  reelId: { type: String, required: true, trim: true },
  platform: { type: String, enum: ['instagram', 'tiktok'], required: true },
  reelUrl: { type: String, required: true, trim: true },
  productId: { type: String, required: true, trim: true },
  title: { type: String, default: '', trim: true, maxlength: 80 },
  views: { type: Number, default: 0, min: 0 },
  clicks: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['active', 'private_or_removed', 'unreachable', 'restricted', 'unknown'],
    default: 'unknown'
  },
  statusMessage: { type: String, default: '', trim: true, maxlength: 180 },
  lastCheckedAt: { type: Date, default: null }
}, { _id: false });

const SellerPromoCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true, maxlength: 24 },
  type: { type: String, enum: ['percentage', 'fixed'], required: true },
  value: { type: Number, required: true, min: 0 },
  minOrderAmount: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: null },
  maxRedemptions: { type: Number, default: 0, min: 0 },
  firstOrderOnly: { type: Boolean, default: false },
  perUserLimit: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
  usageCount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const SellerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  logo: { type: String, default: '' },
  description: { type: String, default: '' },
  socials: {
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    tiktok: { type: String, default: '' },
    website: { type: String, default: '' }
  },
  reels: { type: [SellerReelSchema], default: [] },
  promoCodes: { type: [SellerPromoCodeSchema], default: [] },
  status: { type: String, enum: ['accepted', 'suspended'], default: 'accepted' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

module.exports = mongoose.model('Seller', SellerSchema);
