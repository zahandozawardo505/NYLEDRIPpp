const User = require('../models/User');

async function pushUserNotification(userId, payload, session = null) {
  if (!userId) return;
  await User.updateOne(
    { _id: userId, 'preferences.notifications.orderUpdates': { $ne: false } },
    {
      $push: {
        notifications: {
          $each: [payload],
          $position: 0,
          $slice: 50
        }
      }
    },
    { session }
  );
}

function buildAppUrl(path) {
  const base = String(process.env.PUBLIC_APP_URL || 'http://localhost:5000').replace(/\/+$/, '');
  return `${base}${path}`;
}

function logDeliveryLink(label, email, url) {
  console.log(`${label} for ${email}: ${url}`);
}

module.exports = { pushUserNotification, buildAppUrl, logDeliveryLink };
