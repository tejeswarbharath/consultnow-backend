const Redis = require('ioredis');

let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Ensure TLS is enabled for Upstash by replacing redis:// with rediss://
if (redisUrl.includes('upstash.io') && redisUrl.startsWith('redis://')) {
  redisUrl = redisUrl.replace('redis://', 'rediss://');
}

const redisClient = new Redis(redisUrl);

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

module.exports = redisClient;
