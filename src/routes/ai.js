const express = require('express');
const router = express.Router();
const aiService = require('../service/ai.service');
const { authenticateToken } = require('../middleware/auth');

// POST /api/ai/triage
router.post('/triage', async (req, res) => {
  try {
    const { problemDescription } = req.body;
    
    if (!problemDescription) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    const category = await aiService.triageProblem(problemDescription);
    res.json({ recommendedCategory: category });
  } catch (error) {
    console.error('Error in /triage:', error);
    res.status(500).json({ error: 'Failed to triage problem.' });
  }
});

// POST /api/ai/generate-marketing
router.post('/generate-marketing', authenticateToken, async (req, res) => {
  try {
    const { skills } = req.body;
    const expertId = req.user.id;
    
    if (!skills) {
      return res.status(400).json({ error: 'Skills details are required.' });
    }

    const marketingMaterial = await aiService.generateMarketing(skills, expertId);
    res.json(marketingMaterial);
  } catch (error) {
    console.error('Error in /generate-marketing:', error);
    res.status(500).json({ error: 'Failed to generate marketing material.' });
  }
});

module.exports = router;