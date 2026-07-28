const express = require('express');
const prisma = require('../prisma');

const router = express.Router();

// GET /api/admin/experts
// Fetch all experts with optional filtering by status (e.g. ?status=PENDING)
router.get('/experts', async (req, res) => {
  const { status } = req.query;

  try {
    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const experts = await prisma.expert.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        photoUrl: true,
        yearsExperience: true,
        pricePerHour: true,
        currency: true,
        subjectExpertise: true,
        status: true,
        isAvailable: true,
        referralCode: true,
        totalReferrals: true,
        bio: true,
      },
      orderBy: {
        id: 'desc'
      }
    });

    res.json(experts);
  } catch (error) {
    console.error('Error fetching experts for admin review:', error);
    res.status(500).json({ error: 'Failed to fetch experts for admin.' });
  }
});

// PATCH /api/admin/experts/:id/status
// Update expert approval status (e.g. APPROVED, REJECTED, SUSPENDED, PENDING)
router.patch('/experts/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

  if (!status || !validStatuses.includes(status.toUpperCase())) {
    return res.status(400).json({ 
      error: `Invalid status provided. Must be one of: ${validStatuses.join(', ')}` 
    });
  }

  try {
    const updatedStatus = status.toUpperCase();

    const expert = await prisma.expert.update({
      where: { id },
      data: { status: updatedStatus },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        pricePerHour: true
      }
    });

    res.json({
      message: `Expert ${expert.name} status updated to ${expert.status}`,
      expert
    });
  } catch (error) {
    console.error('Error updating expert status:', error);
    res.status(500).json({ error: 'Failed to update expert status.' });
  }
});

module.exports = router;
