const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  sellerId: { type: String, required: true },
  productId: { type: String, required: true },
  userId: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  selectedColor: { type: String, required: true },
  selectedSize: { type: String, required: true },
  unitPrice: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, required: true, min: 0, default: 0 },
  promoCode: { type: String, default: '', trim: true, uppercase: true },
  totalPrice: { type: Number, required: true, min: 0 },
  profit: { type: Number, required: true },
  commissionAmount: { type: Number, default: 0, min: 0 },
  sellerPayoutAmount: { type: Number, default: 0, min: 0 },
  paymentMethod: { type: String, enum: ['cash_on_delivery', 'card', 'wallet', 'paymob', 'fawry', 'stripe'], default: 'cash_on_delivery' },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded'], default: 'unpaid' },
  paymentProvider: { type: String, default: '', trim: true },
  paymentReference: { type: String, default: '', trim: true },
  fulfillmentNote: { type: String, default: '', trim: true, maxlength: 500 },
  trackingNumber: { type: String, default: '', trim: true, maxlength: 120 },
  estimatedDeliveryAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: '', trim: true, maxlength: 300 },
  returnRequestedAt: { type: Date, default: null },
  returnReason: { type: String, default: '', trim: true, maxlength: 500 },
  returnImageUrls: { type: [String], default: [] },
  shippingAddress: {
    fullName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    city: { type: String, default: '', trim: true },
    line1: { type: String, default: '', trim: true },
    country: { type: String, default: 'Egypt', trim: true },
    note: { type: String, default: '', trim: true, maxlength: 500 }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'ignored', 'preparing', 'on_the_way', 'shipped', 'delivered', 'completed', 'cancelled', 'return_requested', 'returned', 'refunded'],
    default: 'pending'
  }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

OrderSchema.index({ sellerId: 1, createdAt: -1 });
OrderSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', OrderSchema);
