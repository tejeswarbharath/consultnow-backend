const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { sendExpertRegistrationNotification } = require('../service/email.service');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

// REGISTRATION ROUTE
router.post('/register', async (req, res) => {
  // Extract currency from the payload
  const { name, email, password, yearsExperience, pricePerHour, subjectExpertise, currency } = req.body;

  try {
    const parsedPrice = parseFloat(pricePerHour);
    if (isNaN(parsedPrice) || parsedPrice < 100) {
      return res.status(400).json({ error: 'Minimum price per hour must be at least 100.' });
    }

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
        pricePerHour: parsedPrice,
        subjectExpertise,
        currency: currency || 'INR', // Save specific currency or fallback to INR
        status: 'PENDING'
      }
    });

    // Send notification email to no-reply@consultnow.in with expert registration details
    try {
      await sendExpertRegistrationNotification(expert);
    } catch (emailErr) {
      console.error('[Registration] Failed to send expert registration notification email:', emailErr);
    }

    res.status(201).json({ 
      message: 'Expert registered successfully. Your account is currently pending review by our team.', 
      expertId: expert.id,
      status: expert.status
    });
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

    res.json({ 
      token, 
      expert: { 
        id: expert.id, 
        name: expert.name, 
        email: expert.email, 
        status: expert.status || 'APPROVED' 
      } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// RESET PASSWORD ROUTE
router.post('/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Email and new password are required' });
  }

  try {
    const expert = await prisma.expert.findUnique({ where: { email } });
    if (!expert) {
      return res.status(404).json({ error: 'Expert with this email was not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.expert.update({
      where: { email },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;