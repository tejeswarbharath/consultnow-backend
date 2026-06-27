const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

// GET /api/experts
// Fetch experts with optional filtering by categoryId and search by name or subject
router.get('/', async (req, res) => {
  const { categoryId, search, subjectExpertise, groupBy } = req.query;

  try {
    // 1. Fetch all available experts (removed categoryId and category)
    const experts = await prisma.expert.findMany({
      where: {
        isAvailable: true
      },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        yearsExperience: true,
        pricePerHour: true,
        subjectExpertise: true, // We rely entirely on this now
        isAvailable: true,
        bio: true,
        marketingSnippet: true
        // ❌ categoryId: true (REMOVED)
        // ❌ category: true (REMOVED)
      }
    });

    // 2. Group the data for the frontend based on the new string field
    if (groupBy === 'subjectExpertise') {
      const groupedExperts = experts.reduce((acc, expert) => {
        // Group by the string value (e.g., "Medical Advice", "IT Career Guidance")
        const categoryName = expert.subjectExpertise; 
        
        if (!acc[categoryName]) {
          acc[categoryName] = [];
        }
        acc[categoryName].push(expert);
        return acc;
      }, {});

      return res.json(groupedExperts);
    }

    // 3. Return flat list if no grouping is requested
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
