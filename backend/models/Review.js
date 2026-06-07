const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  userId: { type: String, required: true, trim: true },
  orderId: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', trim: true, maxlength: 1200 },
  status: { type: String, enum: ['visible', 'hidden', 'reported'], default: 'visible' }
}, { timestamps: true });

ReviewSchema.index({ productId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('Review', ReviewSchema);
