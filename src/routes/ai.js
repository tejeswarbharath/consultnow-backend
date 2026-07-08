const express = require('express');
const router = express.Router();
const aiService = require('../service/ai.service');
const { authMiddleware } = require('../middleware/auth');

// POST /api/ai/triage
router.post('/triage', async (req, res) => {
  try {
    const { problemDescription } = req.body;
    
    if (!problemDescription) {
      return res.status(400).json({ error: 'Problem description is required.' });
    }

    const triageResult = await aiService.triageProblem(problemDescription);
    res.json({
      recommendedCategory: triageResult.category,
      reason: triageResult.reason,
      isEmergency: triageResult.isEmergency,
      disclaimer: triageResult.disclaimer
    });
  } catch (error) {
    console.error('Error in /triage:', error);
    res.status(500).json({ error: 'Failed to triage problem.' });
  }
});

// POST /api/ai/expert-summaries
router.post('/expert-summaries', async (req, res) => {
  try {
    const { query, experts } = req.body;
    
    if (!query || !experts || !Array.isArray(experts)) {
      return res.status(400).json({ error: 'Query and experts array are required.' });
    }

    const summaries = await aiService.generateExpertSummaries(query, experts);
    res.json({ summaries });
  } catch (error) {
    console.error('Error in /expert-summaries:', error);
    res.status(500).json({ error: 'Failed to generate expert summaries.' });
  }
});

// POST /api/ai/generate-marketing
router.post('/generate-marketing', authMiddleware, async (req, res) => {
  try {
    const { skills } = req.body;
    
    // FIX: Extract 'expertId' exactly as it was signed in the JWT during login
    const expertId = req.user.expertId; 
    
    if (!expertId) {
      return res.status(401).json({ error: 'Unauthorized: Missing expertId in token' });
    }

    // Call the service, which updates the DB and returns the JSON
    const marketingMaterial = await aiService.generateMarketing(skills, expertId);
    
    res.json(marketingMaterial);
  } catch (error) {
    console.error('Error generating marketing:', error);
    res.status(500).json({ error: 'Failed to generate marketing content' });
  }
});

const { verifySmtpConnection } = require('../service/email.service');

// GET /api/ai/verify-email
router.get('/verify-email', async (req, res) => {
  const isConnected = await verifySmtpConnection();
  if (isConnected) {
    res.status(200).send('SMTP connection is verified.');
  } else {
    res.status(500).send('SMTP connection verification failed.');
  }
});

module.exports = router;