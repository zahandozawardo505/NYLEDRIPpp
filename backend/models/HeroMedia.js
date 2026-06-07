const mongoose = require('mongoose');

const HeroMediaSchema = new mongoose.Schema({
  originalName: { type: String, default: '' },
  contentType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  data: { type: Buffer, required: true }
}, { timestamps: true });

module.exports = mongoose.model('HeroMedia', HeroMediaSchema);
