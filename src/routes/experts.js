const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

const router = express.Router();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// GET /api/experts
// Fetch experts with optional filtering by categoryId and search by name or subject
router.get('/', async (req, res) => {
  const { categoryId, search } = req.query;

  try {
    const whereClause = {
      isAvailable: true, // Only show available experts in the discovery by default
    };

    if (categoryId) {
      whereClause.categoryId = categoryId;
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { subjectExpertise: { has: search } }
      ];
    }

    const experts = await prisma.expert.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        photoUrl: true,
        yearsExperience: true,
        pricePerHour: true,
        subjectExpertise: true,
        isAvailable: true,
        categoryId: true,
        category: true,
        // email and password are omitted for security
      }
    });

    res.json(experts);
  } catch (error) {
    console.error('Error fetching experts:', error);
    res.status(500).json({ error: 'Failed to fetch experts' });
  }
});

// GET /api/experts/categories
// Fetch all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/experts/:id
// Fetch a single expert by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const expert = await prisma.expert.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        yearsExperience: true,
        pricePerHour: true,
        subjectExpertise: true,
        isAvailable: true,
        categoryId: true,
        category: true,
        bio: true,
        marketingSnippet: true,
      }
    });

    if (!expert) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    res.json(expert);
  } catch (error) {
    console.error('Error fetching expert:', error);
    res.status(500).json({ error: 'Failed to fetch expert' });
  }
});

// PUT /api/experts/:id
// Update expert profile (bio and marketing snippet)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { bio, marketingSnippet } = req.body;

  try {
    const expert = await prisma.expert.update({
      where: { id },
      data: {
        bio,
        marketingSnippet,
      },
    });

    res.json({ message: 'Expert profile updated successfully', expert });
  } catch (error) {
    console.error('Error updating expert profile:', error);
    res.status(500).json({ error: 'Failed to update expert profile' });
  }
});

module.exports = router;
