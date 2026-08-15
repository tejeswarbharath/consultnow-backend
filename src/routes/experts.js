const express = require('express');
const prisma = require('../prisma');

// Placeholder for authentication middleware. You would need to implement this.
const { authMiddleware, isExpertOwner } = require('../middleware/auth'); // Assuming you create this

const router = express.Router();

// GET /api/experts
// Fetch experts with optional filtering by categoryId and search by name or subject
router.get('/', async (req, res) => {
  const { categoryId, search, subjectExpertise, groupBy } = req.query;

  try {
    // 1. Fetch all available experts (ordered by experience desc so top experienced experts appear first)
    const experts = await prisma.expert.findMany({
      where: {
        isAvailable: true,
        status: 'APPROVED'
      },
      orderBy: {
        yearsExperience: 'desc'
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
      }
    });

    // 2. Group the data for the frontend based on the new string field
    if (groupBy === 'subjectExpertise') {
      const groupedExperts = experts.reduce((acc, expert) => {
        // Group by the string value (e.g., "IT Career Guidance")
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
        status: true,
        isAvailable: true,
        bio: true,
        marketingSnippet: true,
      }
    });

    if (!expert) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    // Calculate completed/active sessions count (free & paid consultation session bookings)
    const completedSessions = await prisma.booking.count({
      where: {
        expertId: id,
        status: { in: ['ACCEPTED', 'PAID', 'COMPLETED', 'PENDING'] }
      }
    });

    // Calculate total verified earnings in INR
    const earningsResult = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        expertId: id,
        status: 'PAID'
      }
    });
    const totalEarnings = Math.round((earningsResult._sum.amount || 0) / 100);

    // Calculate average rating & total reviews from client feedbacks
    let rating = 0;
    let reviewCount = 0;
    if (prisma.feedback) {
      const feedbackAgg = await prisma.feedback.aggregate({
        _avg: { rating: true },
        _count: { id: true },
        where: { expertId: id }
      });
      rating = feedbackAgg._avg?.rating ? Math.round(feedbackAgg._avg.rating * 10) / 10 : 0;
      reviewCount = feedbackAgg._count?.id || 0;
    }

    res.json({
      ...expert,
      completedSessions,
      totalEarnings,
      rating,
      reviewCount
    });
  } catch (error) {
    console.error('Error fetching expert:', error);
    res.status(500).json({ error: 'Failed to fetch expert' });
  }
});

// PUT /api/experts/:id
// Update expert profile (bio and marketing snippet)
// This route should be protected to ensure only the authenticated expert can update their own profile.
router.put('/:id', authMiddleware, isExpertOwner, async (req, res) => {
  const { id } = req.params;
  const { bio, marketingSnippet, pricePerHour } = req.body;

  try {
    const updateData = {};
    if (typeof bio === 'string') updateData.bio = bio;
    if (typeof marketingSnippet === 'string') updateData.marketingSnippet = marketingSnippet;
    if (pricePerHour !== undefined && pricePerHour !== null) {
      const parsedPrice = parseFloat(pricePerHour);
      if (isNaN(parsedPrice) || parsedPrice < 100) {
        return res.status(400).json({ error: 'Minimum price per hour must be at least 100.' });
      }
      updateData.pricePerHour = parsedPrice;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    const expert = await prisma.expert.update({
      where: { id },
      data: updateData,
    });

    res.json({ message: 'Expert profile updated successfully', expert });
  } catch (error) {
    console.error('Error updating expert profile:', error);
    res.status(500).json({ error: 'Failed to update expert profile' });
  }
});

module.exports = router;
