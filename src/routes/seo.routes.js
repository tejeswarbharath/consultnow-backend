const express = require('express');
const router = express.Router();
const { getSitemap, getRobotsTxt, generateSeoProfile, getSeoProfileBySlug } = require('../controller/seo.controller');
const { authMiddleware } = require('../middleware/auth');

// GET /api/seo/sitemap.xml
router.get('/sitemap.xml', getSitemap);

// GET /api/seo/robots.txt
router.get('/robots.txt', getRobotsTxt);

// GET /api/seo/profile/:slug
router.get('/profile/:slug', getSeoProfileBySlug);

// POST /api/seo/generate/:expertId
router.post('/generate/:expertId', authMiddleware, generateSeoProfile);

module.exports = router;

