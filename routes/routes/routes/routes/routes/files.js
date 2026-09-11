const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FileModel = require('../models/FileModel');
const { protect } = require('../middleware/auth');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s/g, '_');
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

// @route   POST /api/files
router.post('/', protect, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    let category = 'document';
    if (req.file.mimetype.includes('presentation') || req.file.mimetype.includes('powerpoint')) {
      category = 'ppt';
    } else if (req.file.mimetype.includes('image')) {
      category = 'image';
    } else if (req.file.originalname.toLowerCase().includes('report')) {
      category = 'report';
    }

    const fileDoc = await FileModel.create({
      project: req.body.project,
      uploadedBy: req.user._id,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      category,
      url: `/uploads/${req.file.filename}`
    });

    await fileDoc.populate('uploadedBy', 'name email avatar');

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: fileDoc
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/files/:projectId
router.get('/:projectId', protect, async (req, res) => {
  try {
    const files = await FileModel.find({ project: req.params.projectId })
      .populate('uploadedBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: files.length, files });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/files/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const file = await FileModel.findById(req.params.id);

    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (file.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const filepath = path.join(uploadDir, file.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    await FileModel.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
