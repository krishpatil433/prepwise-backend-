const express = require('express');
const Project = require('../models/Project');
const Task = require('../models/Task');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/analytics/user
router.get('/user', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const projects = await Project.find({
      $or: [{ owner: userId }, { members: userId }]
    });
    const projectIds = projects.map(p => p._id);

    const totalTasks = await Task.countDocuments({ project: { $in: projectIds } });
    const completed = await Task.countDocuments({ project: { $in: projectIds }, status: 'completed' });
    const pending = await Task.countDocuments({ project: { $in: projectIds }, status: 'pending' });
    const inProgress = await Task.countDocuments({ project: { $in: projectIds }, status: 'inProgress' });
    const review = await Task.countDocuments({ project: { $in: projectIds }, status: 'review' });

    const upcoming = await Task.find({
      project: { $in: projectIds },
      status: { $ne: 'completed' },
      deadline: { $gte: new Date() }
    })
      .sort({ deadline: 1 })
      .limit(5)
      .populate('project', 'title');

    const deadlines = await Task.countDocuments({
      project: { $in: projectIds },
      status: { $ne: 'completed' },
      deadline: {
        $gte: new Date(),
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    res.json({
      success: true,
      analytics: {
        totalProjects: projects.length,
        totalTasks,
        completed,
        pending,
        inProgress,
        review,
        deadlines,
        overallProgress: totalTasks ? Math.round((completed / totalTasks) * 100) : 0,
        upcomingTasks: upcoming
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/analytics/admin
router.get('/admin', protect, adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalMentors = await User.countDocuments({ role: 'mentor' });
    const totalProjects = await Project.countDocuments();
    const activeProjects = await Project.countDocuments({ status: 'active' });
    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: 'completed' });

    const projects = await Project.find();
    const totalRevenue = projects.reduce((sum, p) => sum + (p.creditsTotal || 0), 0);

    const topProjects = await Project.find()
      .sort({ creditsTotal: -1 })
      .limit(5)
      .select('title creditsTotal progress');

    res.json({
      success: true,
      analytics: {
        totalUsers,
        totalStudents,
        totalMentors,
        totalProjects,
        activeProjects,
        totalTasks,
        completedTasks,
        totalRevenue,
        topProjects
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
