const mongoose = require('mongoose');

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.startsWith('/uploads/')) return true;
  if (raw.startsWith('/api/products/images/')) return true;
  if (/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(raw)) return true;
  if (raw.startsWith('../assets/') || raw.startsWith('/assets/') || raw.startsWith('assets/')) return true;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePagination(query, defaults = {}) {
  const page = Math.max(1, Number(query.page || defaults.page || 1));
  const rawLimit = Math.max(1, Number(query.limit || defaults.limit || 10));
  const maxLimit = defaults.maxLimit || 50;
  const limit = Math.min(rawLimit, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function sanitizeProductPayload(payload = {}) {
  const normalized = {
    sellerId: String(payload.sellerId || '').trim(),
    sellerName: String(payload.sellerName || '').trim(),
    sellerLogo: String(payload.sellerLogo || '').trim(),
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    gender: String(payload.gender || '').trim(),
    category: String(payload.category || '').trim(),
    subcategory: String(payload.subcategory || '').trim(),
    price: Number(payload.price),
    cost: Number(payload.cost || 0),
    images: Array.isArray(payload.images) ? payload.images.map((img) => String(img || '').trim()).filter(Boolean) : [],
    variants: Array.isArray(payload.variants) ? payload.variants : []
  };

  const errors = [];
  if (!normalized.sellerId || !mongoose.isValidObjectId(normalized.sellerId)) errors.push('Invalid sellerId');
  if (!normalized.sellerName) errors.push('Seller name is required');
  if (!normalized.name || normalized.name.length < 2) errors.push('Product name must be at least 2 characters');
  if (!['Men', 'Women', 'Unisex'].includes(normalized.gender)) errors.push('Invalid gender');
  if (!normalized.category) errors.push('Category is required');
  if (!normalized.subcategory) errors.push('Subcategory is required');
  if (!Number.isFinite(normalized.price) || normalized.price < 0) errors.push('Price must be a non-negative number');
  if (!Number.isFinite(normalized.cost) || normalized.cost < 0) errors.push('Cost must be a non-negative number');
  if (!normalized.images.length) errors.push('At least one product image is required');
  if (!normalized.images.every(isUrl)) errors.push('Product images must be valid HTTP(S) URLs or uploaded paths');
  if (!Array.isArray(normalized.variants) || !normalized.variants.length) errors.push('At least one variant is required');

  normalized.variants = normalized.variants.map((variant) => {
    const colorName = String(variant?.colorName || '').trim();
    const colorHex = String(variant?.colorHex || '#000000').trim();
    const sizes = Array.isArray(variant?.sizes) ? variant.sizes : [];
    return {
      colorName,
      colorHex: /^#[0-9A-Fa-f]{6}$/.test(colorHex) ? colorHex : '#000000',
      sizes: sizes.map((row) => ({
        size: String(row?.size || '').trim(),
        stock: Number(row?.stock)
      }))
    };
  });

  normalized.variants.forEach((variant, variantIndex) => {
    if (!variant.colorName) errors.push(`Variant ${variantIndex + 1}: color name is required`);
    if (!Array.isArray(variant.sizes) || !variant.sizes.length) {
      errors.push(`Variant ${variantIndex + 1}: at least one size is required`);
      return;
    }
    variant.sizes.forEach((sizeRow, sizeIndex) => {
      if (!sizeRow.size) errors.push(`Variant ${variantIndex + 1}, size ${sizeIndex + 1}: size is required`);
      if (!Number.isFinite(sizeRow.stock) || sizeRow.stock < 0) {
        errors.push(`Variant ${variantIndex + 1}, size ${sizeIndex + 1}: stock must be non-negative`);
      }
    });
  });

  return { normalized, errors };
}

module.exports = {
  isEmail,
  isUrl,
  parsePagination,
  sanitizeProductPayload
};
