const mongoose = require('mongoose');

const SizeSchema = new mongoose.Schema({
  size: { type: String, required: true },
  stock: { type: Number, required: true, min: 0, default: 0 }
}, { _id: false });

const VariantSchema = new mongoose.Schema({
  colorName: { type: String, required: true },
  colorHex: { type: String, default: '#000000' },
  sizes: { type: [SizeSchema], default: [] }
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  sellerId: { type: String, required: true },
  sellerName: { type: String, required: true },
  sellerLogo: { type: String, default: '' },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  gender: { type: String, enum: ['Men', 'Women', 'Unisex'], required: true },
  category: { type: String, required: true },
  subcategory: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  cost: { type: Number, default: 0, min: 0 },
  images: { type: [String], default: [] },
  variants: { type: [VariantSchema], default: [] },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0, min: 0 },
  ratingBreakdown: {
    1: { type: Number, default: 0, min: 0 },
    2: { type: Number, default: 0, min: 0 },
    3: { type: Number, default: 0, min: 0 },
    4: { type: Number, default: 0, min: 0 },
    5: { type: Number, default: 0, min: 0 }
  },
  wishlistCount: { type: Number, default: 0, min: 0 },
  backInStockCount: { type: Number, default: 0, min: 0 },
  viewCount: { type: Number, default: 0, min: 0 },
  orderCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

ProductSchema.index({ sellerId: 1, createdAt: -1 });
ProductSchema.index({ category: 1, subcategory: 1, gender: 1 });
ProductSchema.index({ name: 'text', description: 'text', category: 'text', subcategory: 'text', sellerName: 'text' });
ProductSchema.index({ averageRating: -1, reviewCount: -1 });
ProductSchema.index({ orderCount: -1, viewCount: -1 });

module.exports = mongoose.model('Product', ProductSchema);
