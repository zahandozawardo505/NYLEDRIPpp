const mongoose = require('mongoose');

function validateObjectId(paramName = 'id') {
  return (req, _res, next) => {
    const value = req.params[paramName];
    if (!mongoose.isValidObjectId(value)) {
      const err = new Error(`Invalid ${paramName}`);
      err.status = 400;
      throw err;
    }
    next();
  };
}

module.exports = validateObjectId;
