const prisma = require('../prisma');
const aiService = require('../service/ai.service');

/**
 * Generate AI-driven SEO profile for an Expert
 */
const generateSeoProfile = async (req, res) => {
  try {
    const expertId = req.params.expertId || (req.user && req.user.expertId);
    if (!expertId) {
      return res.status(400).json({ error: 'Expert ID is required.' });
    }

    const result = await aiService.generateSeoProfile(expertId);
    res.json({
      message: 'SEO profile generated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error generating SEO profile:', error);
    res.status(500).json({ error: 'Failed to generate SEO profile.' });
  }
};

/**
 * Fetch Public SEO Profile by slug or ID
 */
const getSeoProfileBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // Try finding by seoSlug or ID
    let expert = await prisma.expert.findFirst({
      where: {
        OR: [
          { seoSlug: slug },
          { id: slug }
        ]
      }
    });

    // If expert exists but doesn't have SEO content yet, auto-generate it!
    if (expert && (!expert.seoBio || !expert.seoServices)) {
      try {
        const generated = await aiService.generateSeoProfile(expert.id);
        expert = generated.expert;
      } catch (genErr) {
        console.warn("Auto SEO generation failed, returning standard expert info:", genErr);
      }
    }

    if (!expert) {
      return res.status(404).json({ error: 'SEO profile not found for specified slug.' });
    }

    let services = [];
    let faqs = [];
    try {
      if (expert.seoServices) services = JSON.parse(expert.seoServices);
      if (expert.seoFaqs) faqs = JSON.parse(expert.seoFaqs);
    } catch (e) {
      console.warn("JSON parse error for SEO services/faqs:", e);
    }

    res.json({
      id: expert.id,
      name: expert.name,
      photoUrl: expert.photoUrl,
      subjectExpertise: expert.subjectExpertise,
      yearsExperience: expert.yearsExperience,
      pricePerHour: expert.pricePerHour,
      currency: expert.currency || 'INR',
      seoSlug: expert.seoSlug,
      seoBio: expert.seoBio || expert.bio,
      seoMetaTitle: expert.seoMetaTitle || `${expert.name} - ${expert.subjectExpertise} Consultant`,
      seoMetaDescription: expert.seoMetaDescription || `Book a 1-on-1 consultation session with ${expert.name}.`,
      services,
      faqs,
      referralCode: expert.referralCode
    });
  } catch (error) {
    console.error('Error fetching SEO profile:', error);
    res.status(500).json({ error: 'Internal server error retrieving SEO profile.' });
  }
};

const getSitemap = async (req, res) => {
  try {
    const experts = await prisma.expert.findMany({
      where: { isAvailable: true },
      select: { id: true, seoSlug: true }
    });

    const frontendUrl = 'https://consultnow.in';
    const currentDate = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${frontendUrl}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${frontendUrl}/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${frontendUrl}/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>`;

    for (const expert of experts) {
      const expertUrl = expert.seoSlug ? `${frontendUrl}/expert/seo/${expert.seoSlug}` : `${frontendUrl}/booking/${expert.id}`;
      xml += `
  <url>
    <loc>${expertUrl}</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
    }

    xml += `
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap XML.');
  }
};

const getRobotsTxt = (req, res) => {
  const robots = `User-agent: *
Allow: /
Allow: /expert/seo/
Allow: /booking/

Sitemap: https://consultnow.in/api/seo/sitemap.xml
`;
  res.header('Content-Type', 'text/plain');
  res.status(200).send(robots);
};

module.exports = {
  generateSeoProfile,
  getSeoProfileBySlug,
  getSitemap,
  getRobotsTxt
};
