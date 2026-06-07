const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actorId: { type: String, default: '', trim: true, index: true },
  actorRole: { type: String, default: '', trim: true },
  action: { type: String, required: true, trim: true, index: true },
  entityType: { type: String, default: '', trim: true, index: true },
  entityId: { type: String, default: '', trim: true, index: true },
  message: { type: String, default: '', trim: true, maxlength: 500 },
  metadata: { type: Object, default: {} },
  ip: { type: String, default: '', trim: true }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
