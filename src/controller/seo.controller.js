const prisma = require('../prisma');

const getSitemap = async (req, res) => {
  try {
    // 1. Fetch all available experts from the database
    const experts = await prisma.expert.findMany({
      where: { isAvailable: true },
      select: { id: true }
    });

    const frontendUrl = 'https://consultnow.in';

    // 2. Build sitemap XML header and static pages
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

    const currentDate = new Date().toISOString().split('T')[0];

    // 3. Add dynamic expert booking pages
    for (const expert of experts) {
      xml += `
  <url>
    <loc>${frontendUrl}/booking/${expert.id}</loc>
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

module.exports = {
  getSitemap
};
