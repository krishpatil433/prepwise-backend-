const express = require('express');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/tasks
// @desc    Create task
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { title, description, project, assignedTo, priority, deadline } = req.body;

    if (!title || !project) {
      return res.status(400).json({ success: false, message: 'Title and project are required' });
    }

    const task = await Task.create({
      title,
      description: description || '',
      project,
      assignedTo: assignedTo || null,
      assignedBy: req.user._id,
      priority: priority || 'medium',
      deadline: deadline || null
    });

    if (assignedTo) {
      const notif = await Notification.create({
        user: assignedTo,
        from: req.user._id,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: `${req.user.name} assigned you: "${title}"`,
        link: `/tasks/${task._id}`
      });
      req.io.to(assignedTo.toString()).emit('notification', notif);
    }

    await task.populate('assignedTo', 'name email avatar');
    await task.populate('assignedBy', 'name email avatar');

    res.status(201).json({ success: true, message: 'Task created', task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/tasks/project/:projectId
// @desc    Get tasks by project
// @access  Private
router.get('/project/:projectId', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ project: req.params.projectId })
      .populate('assignedTo', 'name email avatar')
      .populate('assignedBy', 'name email avatar')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: tasks.length, tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   GET /api/tasks/my
// @desc    Get my assigned tasks
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ assignedTo: req.user._id })
      .populate('project', 'title projectId')
      .populate('assignedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: tasks.length, tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const { title, description, priority, deadline, assignedTo } = req.body;

    if (title) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority) task.priority = priority;
    if (deadline) task.deadline = deadline;
    if (assignedTo) task.assignedTo = assignedTo;

    await task.save();
    await task.populate('assignedTo', 'name email avatar');

    res.json({ success: true, message: 'Task updated', task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/tasks/:id/status
// @desc    Update status (Kanban drag)
// @access  Private
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    const oldStatus = task.status;
    task.status = status;
    if (status === 'completed') task.completedAt = new Date();
    await task.save();

    if (status === 'completed' && oldStatus !== 'completed' && task.assignedBy) {
      const notif = await Notification.create({
        user: task.assignedBy,
        from: req.user._id,
        type: 'task_completed',
        title: 'Task Completed',
        message: `${req.user.name} completed: "${task.title}"`,
        link: `/tasks/${task._id}`
      });
      req.io.to(task.assignedBy.toString()).emit('notification', notif);
    }

    const allTasks = await Task.find({ project: task.project });
    if (allTasks.length > 0) {
      const completed = allTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completed / allTasks.length) * 100);
      await Project.findByIdAndUpdate(task.project, { progress });
    }

    res.json({ success: true, message: `Task moved to ${status}`, task });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   POST /api/tasks/:id/comment
// @desc    Add mentor comment
// @access  Private
router.post('/:id/comment', protect, async (req, res) => {
  try {
    const { comment } = req.body;
    const task = await Task.findById(req.params.id).populate('project');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.assignedTo) {
      const notif = await Notification.create({
        user: task.assignedTo,
        from: req.user._id,
        type: 'mentor_comment',
        title: 'New Mentor Comment',
        message: `${req.user.name}: "${comment}"`,
        link: `/tasks/${task._id}`
      });
      req.io.to(task.assignedTo.toString()).emit('notification', notif);
    }

    res.json({ success: true, message: 'Comment added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await task.deleteOne();

    const allTasks = await Task.find({ project: task.project });
    if (allTasks.length > 0) {
      const completed = allTasks.filter(t => t.status === 'completed').length;
      const progress = Math.round((completed / allTasks.length) * 100);
      await Project.findByIdAndUpdate(task.project, { progress });
    }

    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
