const mongoose = require('mongoose');

const PlatformSettingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  commissionRate: { type: Number, default: 10, min: 0, max: 50 },
  payoutHoldDays: { type: Number, default: 7, min: 0, max: 90 },
  freeShippingThreshold: { type: Number, default: 300, min: 0 },
  supportEmail: { type: String, default: 'hello@niledrip.com', trim: true },
  heroBackgroundType: { type: String, enum: ['default', 'image', 'video'], default: 'default' },
  heroBackgroundUrl: { type: String, default: '', trim: true },
  heroBackgroundOriginalName: { type: String, default: '', trim: true }
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', PlatformSettingsSchema);
