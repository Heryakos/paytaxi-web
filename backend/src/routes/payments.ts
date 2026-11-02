import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { resolveFare, canTransition } from '../services/fares';
import { paymentProvider } from '../services/provider';
import { prisma } from '../db/prisma';

import { broadcastPaymentSuccess } from '../services/events.service';

const router = Router();


const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many payment requests, please try again later' }
});

// POST /payments/initiate — supports both logged-in passengers and guest passengers (no-login flow)
router.post('/initiate', paymentLimiter, optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id ?? null;
    const { taxiId, farePresetId, customAmount, passengerCount, passengerPhone, returnUrl } = req.body;

    if (!taxiId) {
      return res.status(400).json({ error: 'taxiId is required' });
    }

    if (!farePresetId && customAmount === undefined) {
      return res.status(400).json({ error: 'Either farePresetId or customAmount is required' });
    }

    const fare = resolveFare({
      presetId: farePresetId,
      customAmount: typeof customAmount === 'number' ? customAmount : undefined,
      passengerCount: typeof passengerCount === 'number' ? passengerCount : 1,
    });

    if (!fare) {
      return res.status(400).json({ error: 'Invalid fare selection or amount out of bounds (5 - 500 ETB)' });
    }

    const qr = await prisma.taxiQr.findFirst({
      where: {
        taxiId,
        status: 'ACTIVE',
        driverProfile: {
          verificationStatus: 'APPROVED'
        }
      },
      include: { driverProfile: true }
    });

    if (!qr) {
      return res.status(409).json({ error: 'This taxi QR is inactive or its driver is not approved.' });
    }

    const transaction = await prisma.transaction.create({
      data: {
        taxiQrId: qr.id,
        driverProfileId: qr.driverProfileId,
        passengerUserId: userId,
        amount: fare.amount,
        currency: fare.currency,
        status: 'PENDING'
      }
    });

    const result = await paymentProvider.initiatePayment({
      transactionId: transaction.id,
      amount: fare.amount,
      currency: fare.currency,
      taxiId,
      returnUrl,
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        addispayTransactionRef: result.providerReference,
        updatedAt: new Date()
      }
    });

    console.log(JSON.stringify({
      event: 'transaction_state_change',
      timestamp: new Date().toISOString(),
      transactionId: transaction.id,
      oldStatus: null,
      newStatus: 'PENDING',
      source: 'initiate_payment',
      isGuest: !userId,
      passengerPhone: passengerPhone || null,
      seats: fare.passengerCount
    }));

    res.json({
      transactionId: transaction.id,
      fare,
      taxi: {
        taxiId: qr.taxiId,
        driverName: qr.driverProfile.displayName,
        plateNumber: qr.driverProfile.plateNumber,
        vehicleMake: qr.driverProfile.vehicleMake,
        vehicleModel: qr.driverProfile.vehicleModel,
        vehicleColor: qr.driverProfile.vehicleColor,
      },
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// GET /payments/:id — public transaction status & receipt details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        qr: true,
        driverProfile: true,
      }
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json({
      transaction: {
        id: transaction.id,
        status: transaction.status,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        createdAt: transaction.createdAt,
        confirmedAt: transaction.confirmedAt,
        taxiId: transaction.qr.taxiId,
        driver: {
          displayName: transaction.driverProfile.displayName,
          plateNumber: transaction.driverProfile.plateNumber,
          vehicleMake: transaction.driverProfile.vehicleMake,
          vehicleModel: transaction.driverProfile.vehicleModel,
          vehicleColor: transaction.driverProfile.vehicleColor,
          rating: Number(transaction.driverProfile.rating),
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /payments/:id/simulate-success — sandbox simulation for instant testing & receipt display
router.post('/:id/simulate-success', async (req, res) => {
  try {
    const { id } = req.params;
    const current = await prisma.transaction.findUnique({
      where: { id },
      include: { qr: true, driverProfile: true }
    });

    if (!current) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    if (current.status === 'SUCCESS') {
      return res.json({ alreadySuccess: true, transaction: current });
    }

    if (!canTransition(current.status, 'SUCCESS')) {
      return res.status(400).json({ error: `Cannot transition from ${current.status} to SUCCESS` });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: 'SUCCESS',
        confirmedAt: new Date(),
        updatedAt: new Date()
      },
      include: { qr: true, driverProfile: true }
    });

    console.log(JSON.stringify({
      event: 'transaction_state_change',
      timestamp: new Date().toISOString(),
      transactionId: id,
      oldStatus: current.status,
      newStatus: 'SUCCESS',
      source: 'simulate_sandbox_success'
    }));

    broadcastPaymentSuccess({
      transactionId: updated.id,
      driverProfileId: updated.driverProfileId,
      taxiId: updated.qr.taxiId,
      amount: Number(updated.amount),
      currency: updated.currency,
      seats: 1,
      passengerPhone: null,
      confirmedAt: (updated.confirmedAt || new Date()).toISOString()
    });

    res.json({

      success: true,
      transaction: {
        id: updated.id,
        status: updated.status,
        amount: Number(updated.amount),
        currency: updated.currency,
        createdAt: updated.createdAt,
        confirmedAt: updated.confirmedAt,
        taxiId: updated.qr.taxiId,
        driver: {
          displayName: updated.driverProfile.displayName,
          plateNumber: updated.driverProfile.plateNumber,
          vehicleMake: updated.driverProfile.vehicleMake,
          vehicleModel: updated.driverProfile.vehicleModel,
          vehicleColor: updated.driverProfile.vehicleColor,
          rating: Number(updated.driverProfile.rating),
        }
      }
    });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});


export default router;