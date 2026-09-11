const Message = require('../models/Message');
const Notification = require('../models/Notification');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Join user's personal room
    socket.on('join-user', (userId) => {
      socket.join(userId);
      console.log(`👤 User ${userId} joined personal room`);
    });

    // Join project room
    socket.on('join-project', (projectId) => {
      socket.join(projectId);
      console.log(`📁 Joined project: ${projectId}`);
    });

    // Leave project room
    socket.on('leave-project', (projectId) => {
      socket.leave(projectId);
      console.log(`👋 Left project: ${projectId}`);
    });

    // Send message
    socket.on('send-message', async (data) => {
      try {
        const { projectId, senderId, text } = data;

        const message = await Message.create({
          project: projectId,
          sender: senderId,
          text
        });

        await message.populate('sender', 'name email avatar');

        io.to(projectId).emit('receive-message', message);
      } catch (err) {
        console.error('Message error:', err.message);
        socket.emit('error', { message: err.message });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      socket.to(data.projectId).emit('user-typing', {
        userId: data.userId,
        name: data.name
      });
    });

    socket.on('stop-typing', (data) => {
      socket.to(data.projectId).emit('user-stop-typing', {
        userId: data.userId
      });
    });

    socket.on('disconnect', () => {
      console.log('🔌 User disconnected:', socket.id);
    });
  });
};
