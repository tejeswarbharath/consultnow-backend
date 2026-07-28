const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');

/**
 * POST /api/affiliate/validate
 * Validate a referral/promo code during checkout
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, amount } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Referral code is required.' });
    }

    const uppercaseCode = code.trim().toUpperCase();

    // Check if code matches an Expert or User
    const expert = await prisma.expert.findUnique({ where: { referralCode: uppercaseCode } });
    const user = await prisma.user.findUnique({ where: { referralCode: uppercaseCode } });

    const referrer = expert || user;

    if (!referrer) {
      return res.status(404).json({ valid: false, error: 'Invalid referral code.' });
    }

    const discountPercent = 10; // 10% discount for end user
    const originalAmount = parseFloat(amount || 0);
    const discountAmount = Math.round((originalAmount * (discountPercent / 100)) * 100) / 100;
    const finalAmount = Math.max(0, originalAmount - discountAmount);

    res.json({
      valid: true,
      referralCode: uppercaseCode,
      referrerName: referrer.name,
      discountPercent,
      discountAmount,
      originalAmount,
      finalAmount
    });
  } catch (error) {
    console.error('Error validating referral code:', error);
    res.status(500).json({ error: 'Internal server error validating code.' });
  }
});

/**
 * GET /api/affiliate/stats
 * Get logged-in user or expert's affiliate links, balance, and referral history.
 * Supports optional authentication for guest visitors.
 */
router.get('/stats', async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'consultnow_development_secret';

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    let userId = null;
    let isExpert = false;

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id || decoded.expertId;
        isExpert = !!decoded.expertId;
      } catch (err) {
        console.warn('Optional auth token invalid/expired for affiliate stats:', err.message);
      }
    }

    // If logged in, fetch account details
    if (userId) {
      let account;
      if (isExpert) {
        account = await prisma.expert.findUnique({ where: { id: userId } });
      } else {
        account = await prisma.user.findUnique({ where: { id: userId } });
      }

      if (account) {
        let referralCode = account.referralCode;
        if (!referralCode) {
          const cleanName = account.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'USER';
          let unique = false;
          let attempts = 0;
          while (!unique && attempts < 10) {
            attempts++;
            const candidate = `REF-${cleanName}${Math.floor(1000 + Math.random() * 9000)}`;
            const existingExp = await prisma.expert.findUnique({ where: { referralCode: candidate } });
            const existingUsr = await prisma.user.findUnique({ where: { referralCode: candidate } });
            if (!existingExp && !existingUsr) {
              referralCode = candidate;
              unique = true;
            }
          }
          if (!referralCode) {
            referralCode = `REF-${cleanName}${Date.now().toString().slice(-4)}`;
          }

          if (isExpert) {
            await prisma.expert.update({ where: { id: userId }, data: { referralCode } });
          } else {
            await prisma.user.update({ where: { id: userId }, data: { referralCode } });
          }
        }

        const logs = await prisma.referralLog.findMany({
          where: { referrerId: userId },
          orderBy: { createdAt: 'desc' }
        });

        return res.json({
          isAuthenticated: true,
          referralCode,
          referralLink: `https://consultnow.in/?ref=${referralCode}`,
          affiliateBalance: account.affiliateBalance || 0,
          totalReferrals: logs.length,
          commissionPercent: 10,
          logs
        });
      }
    }

    // Guest / Unauthenticated response fallback
    res.json({
      isAuthenticated: false,
      referralCode: 'JOIN-NOW',
      referralLink: 'https://consultnow.in/?ref=JOIN-NOW',
      affiliateBalance: 0,
      totalReferrals: 0,
      commissionPercent: 10,
      logs: []
    });
  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    res.status(500).json({ error: 'Failed to fetch affiliate statistics.' });
  }
});

module.exports = router;
