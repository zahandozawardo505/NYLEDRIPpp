const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home', trim: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  line1: { type: String, required: true, trim: true },
  line2: { type: String, default: '', trim: true },
  city: { type: String, required: true, trim: true },
  state: { type: String, default: '', trim: true },
  postalCode: { type: String, required: true, trim: true },
  country: { type: String, default: 'Egypt', trim: true },
  isDefault: { type: Boolean, default: false }
}, { _id: true });

const WishlistItemSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  sellerId: { type: String, default: '', trim: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, default: 0, min: 0 },
  image: { type: String, default: '' }
}, { _id: false });

const CartItemSchema = new mongoose.Schema({
  productId: { type: String, required: true, trim: true },
  sellerId: { type: String, default: '', trim: true },
  name: { type: String, required: true, trim: true },
  price: { type: Number, default: 0, min: 0 },
  image: { type: String, default: '' },
  selectedColor: { type: String, default: 'Default', trim: true },
  selectedSize: { type: String, default: 'M', trim: true },
  quantity: { type: Number, min: 1, default: 1 }
}, { _id: false });

const NotificationSchema = new mongoose.Schema({
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  message: { type: String, default: '', trim: true, maxlength: 500 },
  entityType: { type: String, default: '', trim: true },
  entityId: { type: String, default: '', trim: true },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  googleId: { type: String, trim: true },
  authProviders: { type: [String], default: ['password'] },
  emailVerifiedAt: { type: Date, default: null },
  emailVerificationTokenHash: { type: String, default: '', trim: true },
  emailVerificationExpiresAt: { type: Date, default: null },
  role: { type: String, enum: ['user', 'seller', 'admin'], default: 'user' },
  status: { type: String, enum: ['ACTIVE', 'BANNED'], default: 'ACTIVE' },
  avatarUrl: { type: String, default: '' },
  phone: { type: String, default: '', trim: true },
  addresses: { type: [AddressSchema], default: [] },
  wishlist: { type: [WishlistItemSchema], default: [] },
  cart: { type: [CartItemSchema], default: [] },
  notifications: { type: [NotificationSchema], default: [] },
  backInStockSubscriptions: { type: [String], default: [] },
  preferences: {
    language: { type: String, enum: ['en', 'ar'], default: 'en' },
    notifications: {
      orderUpdates: { type: Boolean, default: true },
      marketingEmails: { type: Boolean, default: false }
    }
  },
  tokenVersion: { type: Number, default: 0, min: 0 },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('User', UserSchema);
