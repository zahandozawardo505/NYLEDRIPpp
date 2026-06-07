const Product = require('../models/Product');
const Review = require('../models/Review');
const User = require('../models/User');
const Order = require('../models/Order');

async function recomputeProductMetrics(productId) {
  const pid = String(productId || '').trim();
  if (!pid) return null;

  const visibleReviews = await Review.find({ productId: pid, status: 'visible' }, { rating: 1 });
  const reviewCount = visibleReviews.length;
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const row of visibleReviews) {
    const rating = Math.max(1, Math.min(5, Number(row.rating || 0)));
    breakdown[rating] += 1;
    sum += rating;
  }
  const averageRating = reviewCount ? Number((sum / reviewCount).toFixed(2)) : 0;

  const [wishlistCount, orderCount] = await Promise.all([
    User.countDocuments({ 'wishlist.productId': pid }),
    Order.countDocuments({ productId: pid })
  ]);

  await Product.updateOne(
    { _id: pid },
    {
      $set: {
        averageRating,
        reviewCount,
        ratingBreakdown: breakdown,
        wishlistCount,
        orderCount
      }
    }
  );

  return { averageRating, reviewCount, ratingBreakdown: breakdown, wishlistCount, orderCount };
}

module.exports = { recomputeProductMetrics };
