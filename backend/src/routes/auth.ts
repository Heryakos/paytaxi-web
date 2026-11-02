import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requestOtp, verifyOtp } from '../services/auth.service';
import { requireAuth, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { prisma } from '../db/prisma';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

const IS_PROD = process.env.NODE_ENV === 'production';

// Cookie options:
// - Production (cross-domain e.g. Vercel frontend + Render backend): sameSite: 'none', secure: true
// - Development (localhost): sameSite: 'lax', secure: false
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? ('none' as const) : ('lax' as const),
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/',
};


const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many OTP requests from this IP, please try again after 15 minutes' }
});

router.post('/request-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, role } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone is required' });
    }
    const resolvedRole = role === 'DRIVER' ? 'DRIVER' : 'PASSENGER';
    const result = await requestOtp(phone, resolvedRole);
    // In dev, we return the devCode. In prod, we'd only return challengeId.
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { challengeId, code } = req.body;
    if (!challengeId || !code) {
      return res.status(400).json({ error: 'challengeId and code are required' });
    }
    const { user, token } = await verifyOtp(challengeId, code);

    // Set httpOnly cookie for web clients
    res.cookie('token', token, COOKIE_OPTIONS);

    // Also return token in body for mobile clients that use Bearer header
    res.json({ user, token });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /auth/me — returns session user from cookie or Bearer token, no body needed
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.appUser.findUnique({
      where: { id: req.user!.id },
      select: { id: true, phone: true, role: true, isVerified: true, createdAt: true }
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /auth/logout — clears the cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

export default router;