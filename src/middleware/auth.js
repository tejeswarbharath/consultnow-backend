// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT Verification Error:', err.message);
      return res.sendStatus(403); // Forbidden
    }
    req.user = user;
    next();
  });
};

/**
 * Middleware to check if the authenticated user is the owner of the expert profile.
 * This should run *after* authMiddleware.
 */
const isExpertOwner = (req, res, next) => {
  const { id: expertIdFromParams } = req.params;
  const { expertId: expertIdFromToken } = req.user; // Assumes JWT payload has `expertId`

  if (!expertIdFromToken || expertIdFromParams !== expertIdFromToken) {
    return res.status(403).json({ error: 'Forbidden: You can only update your own profile.' });
  }

  next();
};

module.exports = { authMiddleware, isExpertOwner };
