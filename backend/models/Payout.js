const mongoose = require('mongoose');

const PayoutSchema = new mongoose.Schema({
  sellerId: { type: String, required: true, trim: true, index: true },
  sellerName: { type: String, default: '', trim: true },
  amount: { type: Number, required: true, min: 0 },
  commissionAmount: { type: Number, default: 0, min: 0 },
  grossAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected'], default: 'pending', index: true },
  note: { type: String, default: '', trim: true, maxlength: 500 },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Payout', PayoutSchema);
