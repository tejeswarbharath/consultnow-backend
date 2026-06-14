// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

// Add this to your .env file later: JWT_SECRET="your_secure_random_string"
const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

// 1. CLIENT REGISTRATION ROUTE
router.post('/register/client', async (req, res) => {
  const { name, email, password, timezone } = req.body;

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user in the database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        timezone
      }
    });

    res.status(201).json({ message: 'Client registered successfully', userId: newUser.id });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. LOGIN ROUTE (For both Clients and Experts)
router.post('/login', async (req, res) => {
  const { email, password, role } = req.body; // role should be 'client' or 'expert'

  try {
    let account = null;

    // Search the correct database table based on role
    if (role === 'expert') {
      account = await prisma.expert.findUnique({ where: { email } });
    } else {
      account = await prisma.user.findUnique({ where: { email } });
    }

    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare the provided password with the hashed password in DB
    const isPasswordValid = await bcrypt.compare(password, account.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate a secure JSON Web Token (JWT)
    const token = jwt.sign(
      { id: account.id, email: account.email, role: role },
      JWT_SECRET,
      { expiresIn: '24h' } // Token expires in 1 day
    );

    res.json({ message: 'Login successful', token, role });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;