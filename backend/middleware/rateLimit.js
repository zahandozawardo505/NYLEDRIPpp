const buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 60, keyPrefix = 'global' } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || 'unknown'}`;
    const now = Date.now();
    const row = buckets.get(key);
    if (!row || now - row.firstAt > windowMs) {
      buckets.set(key, { firstAt: now, count: 1 });
      return next();
    }
    row.count += 1;
    buckets.set(key, row);
    if (row.count > max) {
      return res.status(429).json({ message: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}

module.exports = rateLimit;
