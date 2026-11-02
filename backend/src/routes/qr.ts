import { Router } from 'express';
import QRCode from 'qrcode';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { getDriverForUser, replaceLostQr } from '../services/drivers.service';
import { prisma } from '../db/prisma';

const router = Router();

// POST /qr/replace — report a lost QR and issue a new one
router.post('/replace', requireAuth, requireRole('DRIVER'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const driver = await getDriverForUser(userId);
    if (!driver) {
      return res.status(400).json({ error: 'No driver profile' });
    }
    const qr = await replaceLostQr(driver.id);
    res.json({ qr });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /qr/:taxiId.png — generate a scannable PNG for the given taxi ID.
// Encodes https://paytaxi.et/t/{taxiId} so Universal Links / App Links open the app
// when installed and fall back gracefully to the browser otherwise.
router.get('/:taxiId.png', async (req, res) => {
  const { taxiId } = req.params;

  // Validate the taxiId exists and has an ACTIVE QR
  const qr = await prisma.taxiQr.findFirst({
    where: { taxiId, status: 'ACTIVE' }
  });
  if (!qr) {
    return res.status(404).json({ error: 'No active QR for this taxi ID' });
  }

  const url = `https://paytaxi.et/t/${taxiId}`;

  try {
    const pngBuffer = await QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'H', // High — tolerates up to 30% damage
      margin: 2,
      width: 512,
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="paytaxi-${taxiId}.png"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pngBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// GET /qr/:taxiId — public driver verification info.
// Must be registered AFTER /:taxiId.png so PNG requests aren't swallowed.
// Powers the web deep-link landing page at /t/{taxiId}. No auth required.
router.get('/:taxiId', async (req, res) => {
  const { taxiId } = req.params;
  const qr = await prisma.taxiQr.findFirst({
    where: {
      taxiId,
      status: 'ACTIVE',
      driverProfile: { verificationStatus: 'APPROVED' }
    },
    include: { driverProfile: true }
  });
  if (!qr) {
    return res.status(404).json({ error: 'No active QR for this taxi ID or driver not approved' });
  }
  res.json({
    taxiId: qr.taxiId,
    driver: {
      displayName: qr.driverProfile.displayName,
      plateNumber: qr.driverProfile.plateNumber,
      vehicleMake: qr.driverProfile.vehicleMake,
      vehicleModel: qr.driverProfile.vehicleModel,
      vehicleColor: qr.driverProfile.vehicleColor,
      rating: Number(qr.driverProfile.rating),
    }
  });
});

export default router;