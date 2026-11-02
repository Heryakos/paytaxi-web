import { Router } from 'express';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { registerDriver, getDriverForUser, approveDriver, rejectDriver, listDrivers } from '../services/drivers.service';

const router = Router();

router.post('/register', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { name, vehicleMake, vehicleModel, vehicleColor, plateNumber, nationalIdUrl, licenseUrl } = req.body;
    
    const required = ["name", "vehicleMake", "vehicleModel", "vehicleColor", "plateNumber"];
    for (const key of required) {
      if (!req.body[key] || String(req.body[key]).trim().length === 0) {
        return res.status(400).json({ error: `${key} is required` });
      }
    }

    const result = await registerDriver({
      userId,
      name,
      phone: '',
      vehicleMake,
      vehicleModel,
      vehicleColor,
      plateNumber,
      nationalIdUrl,
      licenseUrl,
    });

    res.json({ driver: result.profile });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.get('/profile', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const profile = await getDriverForUser(req.user!.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json({ profile });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: list all registered drivers with statuses
router.get('/admin/all', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const drivers = await listDrivers(status);
    res.json({ drivers });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Admin: approve driver and issue QR code
router.post('/:id/approve', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const result = await approveDriver(req.params.id as string);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Admin: reject driver with optional reason
router.post('/:id/reject', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await rejectDriver(req.params.id as string, reason);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Driver KYC document upload (National ID / Driver License)
router.post('/upload', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const { dataUrl, docType } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }
    res.json({
      url: dataUrl,
      docType: docType || 'DOCUMENT',
      uploadedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;