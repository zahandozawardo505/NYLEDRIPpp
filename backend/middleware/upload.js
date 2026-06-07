const fs = require('fs');
const path = require('path');
const multer = require('multer');

const isVercel = Boolean(process.env.VERCEL);
const uploadsRoot = isVercel ? path.join('/tmp', 'nyledrip-uploads') : path.join(__dirname, '..', 'uploads');
const imageDir = path.join(uploadsRoot, 'images');
const documentDir = path.join(uploadsRoot, 'documents');
const avatarDir = path.join(uploadsRoot, 'avatars');
const heroMediaDir = path.join(uploadsRoot, 'hero');

for (const dir of [uploadsRoot, imageDir, documentDir, avatarDir, heroMediaDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function buildStorage(targetFolder) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, targetFolder),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ext.replace(/[^a-z0-9.]/g, '') || '.bin';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
  });
}

function imageFilter(_req, file, cb) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
  if (!allowed.has(file.mimetype)) {
    const err = new Error('Only JPG, PNG, and WEBP image uploads are allowed');
    err.status = 400;
    return cb(err);
  }
  return cb(null, true);
}

function documentFilter(_req, file, cb) {
  const allowed = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg'
  ]);
  if (!allowed.has(file.mimetype)) {
    const err = new Error('Only PDF, JPG, PNG, and WEBP files are allowed');
    err.status = 400;
    return cb(err);
  }
  return cb(null, true);
}

function heroMediaFilter(_req, file, cb) {
  const allowed = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'video/mp4',
    'video/webm'
  ]);
  if (!allowed.has(file.mimetype)) {
    const err = new Error('Only JPG, PNG, WEBP, MP4, and WEBM hero media uploads are allowed');
    err.status = 400;
    return cb(err);
  }
  return cb(null, true);
}

const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadSellerDocument = multer({
  storage: buildStorage(documentDir),
  fileFilter: documentFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const uploadUserAvatar = multer({
  storage: buildStorage(avatarDir),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 }
});

const uploadHeroMedia = multer({
  storage: buildStorage(heroMediaDir),
  fileFilter: heroMediaFilter,
  limits: { fileSize: 30 * 1024 * 1024 }
});

const uploadHeroMediaMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: heroMediaFilter,
  limits: { fileSize: 30 * 1024 * 1024 }
});

function toPublicPath(filePath) {
  const relative = path.relative(uploadsRoot, filePath).replace(/\\/g, '/');
  const basePath = isVercel ? '/api/uploads' : '/uploads';
  return `${basePath}/${relative}`;
}

module.exports = {
  uploadsRoot,
  uploadProductImage,
  uploadSellerDocument,
  uploadUserAvatar,
  uploadHeroMedia,
  uploadHeroMediaMemory,
  toPublicPath
};
