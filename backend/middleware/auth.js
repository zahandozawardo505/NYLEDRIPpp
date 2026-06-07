const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Seller = require('../models/Seller');

function auth(requiredRoles = []) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const cookieToken = String(req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('nyledrip_token='))
      ?.slice('nyledrip_token='.length);
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (cookieToken ? decodeURIComponent(cookieToken) : null);
    if (!token) return res.status(401).json({ message: 'Missing token' });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);

      if (payload.role === 'user' || payload.role === 'admin') {
        const user = await User.findById(payload.id, { status: 1, tokenVersion: 1, role: 1, email: 1, name: 1 });
        if (!user) return res.status(401).json({ message: 'Invalid token' });
        if (user.status === 'BANNED') return res.status(403).json({ message: 'Account is banned' });
        if (Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
          return res.status(401).json({ message: 'Session expired. Please login again.' });
        }
        req.user = {
          id: String(user._id),
          role: user.role,
          email: user.email,
          name: user.name,
          tokenVersion: user.tokenVersion
        };
      } else if (payload.role === 'seller') {
        const seller = await Seller.findById(payload.id, { status: 1, email: 1, name: 1 });
        if (!seller) return res.status(401).json({ message: 'Invalid token' });
        if (String(seller.status).toLowerCase() === 'suspended') {
          return res.status(403).json({ message: 'Seller account is suspended' });
        }
        req.user = {
          id: String(seller._id),
          role: 'seller',
          email: seller.email,
          name: seller.name
        };
      } else {
        return res.status(401).json({ message: 'Invalid token' });
      }

      if (requiredRoles.length && !requiredRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      return next();
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

module.exports = auth;
