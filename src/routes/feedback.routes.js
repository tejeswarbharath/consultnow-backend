const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { analyzeFeedbackStatement } = require('../service/ai.service');

/**
 * GET /api/feedback/experts-list
 * Returns list of expert consultants for dropdown selection in the user feedback form
 */
router.get('/experts-list', async (req, res) => {
  try {
    const experts = await prisma.expert.findMany({
      select: {
        id: true,
        name: true,
        subjectExpertise: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    res.json(experts);
  } catch (error) {
    console.error('Error fetching experts list for feedback dropdown:', error);
    res.status(500).json({ error: 'Failed to fetch experts list' });
  }
});

/**
 * POST /api/feedback
 * Submit client feedback, analyze feedback statement with AI/NLP for keyword bubbles, and save to DB
 */
router.post('/', async (req, res) => {
  try {
    const { expertId, clientName, rating, comment } = req.body;

    if (!expertId) {
      return res.status(400).json({ error: 'Please select an expert consultant.' });
    }
    if (!clientName || !clientName.trim()) {
      return res.status(400).json({ error: 'Please provide your name.' });
    }
    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    }
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Please enter your feedback in the text box.' });
    }

    // Verify expert exists
    const expert = await prisma.expert.findUnique({
      where: { id: expertId }
    });
    if (!expert) {
      return res.status(404).json({ error: 'Selected expert consultant not found.' });
    }

    // Extract word bubbles from feedback statement using AI / NLP
    let keywords = [];
    try {
      keywords = await analyzeFeedbackStatement(comment.trim());
    } catch (aiErr) {
      console.warn('[Feedback] Failed to analyze feedback statement:', aiErr.message);
      keywords = ['Helpful', 'Great Session'];
    }

    // Save feedback to DB
    const feedback = await prisma.feedback.create({
      data: {
        expertId,
        clientName: clientName.trim(),
        rating: parsedRating,
        comment: comment.trim(),
        keywords: JSON.stringify(keywords)
      }
    });

    res.status(201).json({
      message: 'Thank you! Your feedback has been submitted successfully.',
      feedback: {
        ...feedback,
        keywords: keywords
      }
    });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback.' });
  }
});

/**
 * GET /api/feedback/expert/:expertId
 * Returns list of client feedbacks and aggregated word bubbles for an expert
 */
router.get('/expert/:expertId', async (req, res) => {
  try {
    const { expertId } = req.params;

    if (!prisma.feedback) {
      return res.json({
        feedbacks: [],
        wordBubbles: [],
        averageRating: 0,
        totalReviews: 0
      });
    }

    const feedbacks = await prisma.feedback.findMany({
      where: { expertId },
      orderBy: { createdAt: 'desc' }
    });

    // Parse keywords for each feedback and compute word frequency map for word cloud/bubbles
    const wordCounts = {};
    const parsedFeedbacks = feedbacks.map(item => {
      let parsedKeywords = [];
      try {
        if (item.keywords) {
          parsedKeywords = JSON.parse(item.keywords);
        }
      } catch (e) {
        parsedKeywords = [];
      }

      parsedKeywords.forEach(kw => {
        const cleanKw = kw.trim();
        if (cleanKw) {
          wordCounts[cleanKw] = (wordCounts[cleanKw] || 0) + 1;
        }
      });

      return {
        ...item,
        keywords: parsedKeywords
      };
    });

    // Sort word bubbles by frequency descending
    const wordBubbles = Object.keys(wordCounts)
      .map(word => ({ word, count: wordCounts[word] }))
      .sort((a, b) => b.count - a.count);

    // Compute average rating
    const totalReviews = feedbacks.length;
    const averageRating = totalReviews > 0
      ? (feedbacks.reduce((acc, f) => acc + f.rating, 0) / totalReviews)
      : 0;

    res.json({
      feedbacks: parsedFeedbacks,
      wordBubbles,
      averageRating: Math.round(averageRating * 10) / 10,
      totalReviews
    });
  } catch (error) {
    console.error('Error fetching expert feedback:', error);
    res.status(500).json({ error: 'Failed to retrieve expert feedback.' });
  }
});

module.exports = router;
