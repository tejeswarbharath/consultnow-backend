// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const router = express.Router();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Add this to your .env file later: JWT_SECRET="your_secure_random_string"
const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

// 1. REGISTRATION ROUTE
router.post('/register', async (req, res) => {
  const { name, email, password, yearsExperience, pricePerHour, subjectExpertise, categoryId } = req.body;

  try {
    // Check if expert already exists
    const existingExpert = await prisma.expert.findUnique({ where: { email } });
    if (existingExpert) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the expert in the database
    const newExpert = await prisma.expert.create({
      data: {
        name,
        email,
        password: hashedPassword,
        yearsExperience: parseInt(yearsExperience),
        pricePerHour: parseFloat(pricePerHour),
        subjectExpertise,
        categoryId
      }
    });

    res.status(201).json({ message: 'Expert registered successfully', expertId: newExpert.id });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// 2. LOGIN ROUTE (For Experts)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const account = await prisma.expert.findUnique({ where: { email } });

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
      { id: account.id, email: account.email, role: 'expert' },
      JWT_SECRET,
      { expiresIn: '24h' } // Token expires in 1 day
    );

    res.json({ message: 'Login successful', token, role: 'expert' });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;