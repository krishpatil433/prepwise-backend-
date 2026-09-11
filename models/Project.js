const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: 'General'
  },
  techStack: [{
    type: String
  }],
  deadline: {
    type: Date
  },
  duration: {
    type: Number,
    default: 30
  },
  projectId: {
    type: String,
    unique: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  mentors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  creditsTotal: {
    type: Number,
    default: 0
  },
  creditsLeft: {
    type: Number,
    default: 0
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'archived'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate unique projectId before saving
projectSchema.pre('save', async function (next) {
  if (!this.projectId) {
    this.projectId = 'PRJ-' + Date.now().toString().slice(-8);
  }
  next();
});

module.exports = mongoose.model('Project', projectSchema);
