const express = require('express');
const router = express.Router();
const prisma = require('../prisma');

/**
 * GET /api/widgets/expert/:id
 * Get expert details formatted specifically for embeddable widgets
 */
router.get('/expert/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const expert = await prisma.expert.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        subjectExpertise: true,
        yearsExperience: true,
        pricePerHour: true,
        currency: true,
        isAvailable: true,
        seoSlug: true,
        referralCode: true
      }
    });

    if (!expert) {
      return res.status(404).json({ error: 'Expert not found.' });
    }

    const frontendUrl = 'https://consultnow.in';
    const bookingUrl = `${frontendUrl}/booking/${expert.id}?utm_source=embed_widget&utm_medium=expert_embed&utm_campaign=powered_by_loop`;

    // Standard HTML Embed snippet
    const iframeSnippet = `<iframe src="${frontendUrl}/widget/expert/${expert.id}?theme=dark" width="360" height="240" frameborder="0" scrolling="no" style="border-radius:12px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 8px 24px rgba(0,0,0,0.3);"></iframe>`;

    res.json({
      expert,
      bookingUrl,
      iframeSnippet
    });
  } catch (error) {
    console.error('Error serving widget payload:', error);
    res.status(500).json({ error: 'Failed to fetch widget details.' });
  }
});

module.exports = router;
