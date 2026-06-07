const AuditLog = require('../models/AuditLog');

async function writeAudit(req, action, details = {}) {
  try {
    await AuditLog.create({
      actorId: String(req?.user?.id || ''),
      actorRole: String(req?.user?.role || ''),
      action,
      entityType: String(details.entityType || ''),
      entityId: String(details.entityId || ''),
      message: String(details.message || '').slice(0, 500),
      metadata: details.metadata || {},
      ip: String(req?.ip || '')
    });
  } catch (err) {
    console.warn(`Audit log skipped: ${err.message}`);
  }
}

module.exports = { writeAudit };
