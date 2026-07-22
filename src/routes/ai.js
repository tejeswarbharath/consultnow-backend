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

// POST /api/ai/expert-twin-chat
router.post('/expert-twin-chat', async (req, res) => {
  try {
    const { message, history, expertId } = req.body;
    if (!message || !expertId) {
      return res.status(400).json({ error: 'Message and expertId are required.' });
    }

    const reply = await aiService.generateExpertTwinResponse(message, history, expertId);
    res.json({ reply });
  } catch (error) {
    console.error('Error in /expert-twin-chat:', error);
    res.status(500).json({ error: 'Failed to generate response from expert twin.' });
  }
});

// POST /api/ai/agenda
router.post('/agenda', async (req, res) => {
  try {
    const { problemDetails, expertSubject } = req.body;
    const result = await aiService.generateAgenda(problemDetails, expertSubject);
    res.json(result);
  } catch (error) {
    console.error('Error in /agenda:', error);
    res.status(500).json({ error: 'Failed to generate agenda.' });
  }
});

// POST /api/ai/briefing
router.post('/briefing', async (req, res) => {
  try {
    const { clientNotes, bookingType } = req.body;
    const result = await aiService.generateBriefing(clientNotes, bookingType);
    res.json(result);
  } catch (error) {
    console.error('Error in /briefing:', error);
    res.status(500).json({ error: 'Failed to generate briefing digest.' });
  }
});

// POST /api/ai/followup
router.post('/followup', async (req, res) => {
  try {
    const { clientName, topic, notes } = req.body;
    const result = await aiService.generateFollowUp(clientName, topic, notes);
    res.json(result);
  } catch (error) {
    console.error('Error in /followup:', error);
    res.status(500).json({ error: 'Failed to generate follow-up draft.' });
  }
});

// POST /api/ai/recommend-pricing
router.post('/recommend-pricing', async (req, res) => {
  try {
    const { yearsExperience, subjectExpertise, currentRate } = req.body;
    const result = await aiService.recommendPricing(yearsExperience, subjectExpertise, currentRate);
    res.json(result);
  } catch (error) {
    console.error('Error in /recommend-pricing:', error);
    res.status(500).json({ error: 'Failed to generate pricing recommendations.' });
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