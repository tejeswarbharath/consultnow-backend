const { Server } = require('socket.io');
const redisClient = require('./redis');

let io;
const activeTimers = new Map(); // Track intervals to avoid duplicates

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for dev
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);
    
    // 1. Join Room & Handle Timer
    socket.on('join_room', async ({ roomId, expertId }) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room ${roomId}`);

      // Emit expert availability status on join
      if (expertId) {
         const status = await redisClient.get(`expert_status:${expertId}`) || 'available';
         socket.emit('status_update', { expertId, status });
      }

      // Initialize or resume 1-hour countdown timer
      const timerKey = `timer:${roomId}`;
      const exists = await redisClient.exists(timerKey);
      
      if (!exists) {
        await redisClient.set(timerKey, 3600); // 1 hour in seconds
      }

      // Start broadcasting timer if not already active for this room
      if (!activeTimers.has(roomId)) {
        const intervalId = setInterval(async () => {
          const remaining = await redisClient.decr(timerKey);
          
          if (remaining <= 0) {
            clearInterval(intervalId);
            activeTimers.delete(roomId);
            io.to(roomId).emit('timer_ended', { message: 'Consultation time is up!' });
          } else {
            io.to(roomId).emit('timer_update', { remainingSeconds: remaining });
          }
        }, 1000);
        activeTimers.set(roomId, intervalId);
      }
    });

    // 2. Sending & Receiving Messages
    socket.on('send_message', (data) => {
      const { roomId, message, senderId, senderName } = data;
      // Broadcast message to everyone in the room
      io.to(roomId).emit('receive_message', {
        senderId,
        senderName,
        message,
        timestamp: new Date()
      });
    });

    // 3. Set Expert Status manually
    socket.on('set_expert_status', async ({ expertId, status }) => {
      await redisClient.set(`expert_status:${expertId}`, status);
      // Broadcast to all clients that the expert status changed
      io.emit('status_update', { expertId, status });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIo };
