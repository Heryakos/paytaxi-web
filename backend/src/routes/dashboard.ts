import { Router } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getDriverForUser, getScopedDashboard } from '../services/drivers.service';
import { driverEvents, PaymentSuccessEvent } from '../services/events.service';

const router = Router();

router.get('/', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const driver = await getDriverForUser(userId);
    if (!driver) {
      return res.status(400).json({ error: 'No driver profile' });
    }
    const dashboard = await getScopedDashboard(driver.id);
    res.json(dashboard);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /dashboard/stream — real-time SSE stream for driver audio chime & auto-updating earnings
router.get('/stream', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const driver = await getDriverForUser(userId);
    if (!driver) {
      return res.status(404).json({ error: 'Driver profile not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable proxy buffering (e.g. NGINX/Render)
    res.flushHeaders?.();

    // Initial ping
    res.write(`data: ${JSON.stringify({ type: 'connected', driverId: driver.id, timestamp: new Date().toISOString() })}\n\n`);

    const handlePayment = (event: PaymentSuccessEvent) => {
      res.write(`data: ${JSON.stringify({ type: 'payment_received', ...event })}\n\n`);
    };

    driverEvents.on(`payment:${driver.id}`, handlePayment);

    // Keepalive heartbeat every 25 seconds
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
      driverEvents.off(`payment:${driver.id}`, handlePayment);
      clearInterval(heartbeat);
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;