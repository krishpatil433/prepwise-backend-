const express = require('express');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/chat/:projectId
router.get('/:projectId', protect, async (req, res) => {
  try {
    const messages = await Message.find({ project: req.params.projectId })
      .populate('sender', 'name email avatar')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/chat
router.post('/', protect, async (req, res) => {
  try {
    const { project, text } = req.body;

    if (!project || !text) {
      return res.status(400).json({ success: false, message: 'Missing fields' });
    }

    const message = await Message.create({
      project,
      sender: req.user._id,
      text
    });

    await message.populate('sender', 'name email avatar');

    req.io.to(project).emit('receive-message', message);

    res.json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
