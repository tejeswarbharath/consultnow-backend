const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

// REGISTRATION ROUTE
router.post('/register', async (req, res) => {
  // Extract currency from the payload
  const { name, email, password, yearsExperience, pricePerHour, subjectExpertise, currency } = req.body;

  try {
    const existingExpert = await prisma.expert.findUnique({ where: { email } });
    if (existingExpert) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const expert = await prisma.expert.create({
      data: {
        name,
        email,
        password: hashedPassword,
        yearsExperience: Number(yearsExperience),
        pricePerHour: parseFloat(pricePerHour),
        subjectExpertise,
        currency: currency || 'INR' // Save specific currency or fallback to INR
      }
    });

    res.status(201).json({ message: 'Expert registered successfully', expertId: expert.id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// LOGIN ROUTE
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const expert = await prisma.expert.findUnique({ where: { email } });
    if (!expert) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, expert.password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { expertId: expert.id, email: expert.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, expert: { id: expert.id, name: expert.name, email: expert.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;