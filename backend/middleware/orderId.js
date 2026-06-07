const Order = require('../models/Order');

async function generateOrderId(sellerId, productId) {
  const sellerCode = String(sellerId || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  const productCode = String(productId || '').replace(/\D/g, '').slice(-3).padStart(3, '0');

  while (true) {
    const seq = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    const id = `${sellerCode}${productCode}${seq}`;
    const exists = await Order.exists({ id });
    if (!exists) return id;
  }
}

module.exports = { generateOrderId };
