const express = require('express');
const Project = require('../models/Project');
const User = require('../models/User');
const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/projects
// @desc    Create new project
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const {
      title, description, techStack, category,
      deadline, teamSize, duration
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Project title is required' });
    }

    const credits = (teamSize || 1) * (duration || 30);

    const project = await Project.create({
      title,
      description: description || '',
      techStack: techStack || [],
      category: category || 'General',
      deadline: deadline || new Date(Date.now() + (duration || 30) * 24 * 60 * 60 * 1000),
      duration: duration || 30,
      owner: req.user._id,
      members: [req.user._id],
      creditsTotal: credits,
      creditsLeft: credits
    });

    const notif = await Notification.create({
      user: req.user._id,
      type: 'project_created',
      title: 'Project Created',
      message: `Your project "${title}" has been created successfully.`,
      link: `/projects/${project._id}`
    });

    req.io.to(req.user._id.toString()).emit('notification', notif);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project,
      creditsRequired: credits,
      totalPrice: credits
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/projects
// @desc    Get all my projects
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { owner: req.user._id },
        { members: req.user._id },
        { mentors: req.user._id }
      ]
    })
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar')
      .populate('mentors', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: projects.length, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/projects/:id
// @desc    Get single project
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('owner', 'name email avatar')
      .populate('members', 'name email avatar')
      .populate('mentors', 'name email avatar');

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/projects/:id
// @desc    Update project
// @access  Private (owner only)
router.put('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only owner can update project' });
    }

    const { title, description, techStack, category, deadline, duration, progress, status } = req.body;

    if (title) project.title = title;
    if (description !== undefined) project.description = description;
    if (techStack) project.techStack = techStack;
    if (category) project.category = category;
    if (deadline) project.deadline = deadline;
    if (duration) project.duration = duration;
    if (progress !== undefined) project.progress = progress;
    if (status) project.status = status;

    await project.save();

    res.json({
      success: true,
      message: 'Project updated successfully',
      project
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/projects/:id
// @desc    Delete project + tasks
// @access  Private (owner only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    if (project.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only owner can delete project' });
    }

    await Task.deleteMany({ project: project._id });
    await project.deleteOne();

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/projects/:id/invite
// @desc    Invite member
// @access  Private
router.post('/:id/invite', protect, async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const invitedUser = await User.findOne({ email: email.toLowerCase() });
    if (!invitedUser) {
      return res.status(404).json({ success: false, message: 'User not found with this email' });
    }

    if (project.members.includes(invitedUser._id)) {
      return res.status(400).json({ success: false, message: 'User is already a team member' });
    }

    project.members.push(invitedUser._id);
    await project.save();

    const notif = await Notification.create({
      user: invitedUser._id,
      from: req.user._id,
      type: 'team_invite',
      title: 'Team Invitation',
      message: `${req.user.name} invited you to join "${project.title}"`,
      link: `/projects/${project._id}`
    });

    req.io.to(invitedUser._id.toString()).emit('notification', notif);

    res.json({ success: true, message: `${invitedUser.name} added to team`, project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/projects/:id/mentor
// @desc    Add mentor
// @access  Private
router.post('/:id/mentor', protect, async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ success: false, message: 'Project not found' });
    }

    const mentor = await User.findOne({ email: email.toLowerCase(), role: 'mentor' });
    if (!mentor) {
      return res.status(404).json({ success: false, message: 'Mentor not found with this email' });
    }

    if (project.mentors.includes(mentor._id)) {
      return res.status(400).json({ success: false, message: 'Mentor already assigned' });
    }

    project.mentors.push(mentor._id);
    await project.save();

    res.json({ success: true, message: `${mentor.name} added as mentor`, project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
