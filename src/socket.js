const { Server } = require('socket.io');
const redisClient = require('./redis');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Allow all origins for dev
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);
    
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
