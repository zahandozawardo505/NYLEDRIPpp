const mongoose = require('mongoose');

const ProductImageSchema = new mongoose.Schema({
  sellerId: { type: String, required: true, index: true },
  originalName: { type: String, default: '' },
  contentType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('ProductImage', ProductImageSchema);
