import { Router } from 'express';
import { prisma } from '../db/prisma';
import { canTransition } from '../services/fares';
import { paymentProvider } from '../services/provider';
import { Prisma } from '@prisma/client';
import { broadcastPaymentSuccess } from '../services/events.service';


type TransactionStatus = string;

const router = Router();
const statuses = new Set<TransactionStatus>(['SUCCESS', 'FAILED', 'REFUNDED', 'UNKNOWN']);

router.post('/addispay', async (req, res) => {
  // express.json() is parsing the body, but for signature verification we might need raw body.
  // For now we'll stringify it, or use req.body directly if the provider allows.
  const rawBody = JSON.stringify(req.body);
  const signature = req.header('x-addispay-signature') || null;

  if (!paymentProvider.verifyWebhook(signature, rawBody)) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  try {
    const body = req.body;
    const eventId = body.eventId;
    const transactionId = body.transactionId;
    const nextStatus = body.status as TransactionStatus;

    if (!eventId || !transactionId || !nextStatus || !statuses.has(nextStatus)) {
      return res.status(400).json({ error: 'eventId, transactionId, and valid status are required' });
    }

    // Idempotency check via unique constraint
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: 'ADDISPAY',
          providerEventId: eventId,
          eventType: body.eventType ?? null,
          transactionId,
          rawPayload: rawBody,
          processed: false,
        }
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return res.json({ received: true, duplicate: true });
      }
      throw error;
    }

    const current = await prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!current) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const from = current.status;
    if (!canTransition(from, nextStatus)) {
      await prisma.webhookEvent.update({
        where: { provider_providerEventId: { provider: 'ADDISPAY', providerEventId: eventId } },
        data: { processed: true }
      });
      return res.json({ received: true, ignored: true, reason: `Illegal transition ${from} -> ${nextStatus}` });
    }

    // Compare-and-set using updateMany to check affected rows (prevents concurrent double-processing)
    // Using an object wrapper so TypeScript doesn't narrow the union type inside the async $transaction callback.
    const race = { result: 'ok' as string };

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.transaction.updateMany({
        where: { id: transactionId, status: from },
        data: {
          status: nextStatus,
          addispayTransactionRef: body.providerReference ?? current.addispayTransactionRef,
          addispayRawPayload: JSON.stringify(body),
          updatedAt: new Date(),
          confirmedAt: nextStatus === 'SUCCESS' ? new Date() : current.confirmedAt
        }
      });

      if (updateResult.count === 0) {
        // Lost the race — re-read actual current status to distinguish idempotent vs conflict
        const fresh = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: { status: true }
        });
        const actualStatus = fresh?.status;

        if (actualStatus === nextStatus) {
          // Another concurrent request already applied this exact transition — genuinely idempotent
          race.result = 'idempotent';
        } else {
          // Conflict: the transaction is in a different state than expected — suspicious
          console.warn(JSON.stringify({
            event: 'webhook_race_conflict',
            timestamp: new Date().toISOString(),
            transactionId,
            attemptedTransition: `${from} -> ${nextStatus}`,
            actualStatus,
            eventId,
            source: 'webhook_addispay'
          }));
          race.result = 'conflict';
        }
      }

      await tx.webhookEvent.update({
        where: { provider_providerEventId: { provider: 'ADDISPAY', providerEventId: eventId } },
        data: { processed: true }
      });
    });

    if (race.result === 'idempotent') {
      return res.json({ received: true, ignored: true, reason: 'Already in target status (idempotent)' });
    }
    if (race.result === 'conflict') {
      return res.json({ received: true, ignored: true, reason: 'Race conflict — see server logs for details' });
    }

    console.log(JSON.stringify({
      event: 'transaction_state_change',
      timestamp: new Date().toISOString(),
      transactionId: transactionId,
      oldStatus: from,
      newStatus: nextStatus,
      source: 'webhook_addispay'
    }));

    if (nextStatus === 'SUCCESS') {
      const txFull = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { qr: true }
      });
      if (txFull) {
        broadcastPaymentSuccess({
          transactionId: txFull.id,
          driverProfileId: txFull.driverProfileId,
          taxiId: txFull.qr.taxiId,
          amount: Number(txFull.amount),
          currency: txFull.currency,
          seats: 1,
          confirmedAt: (txFull.confirmedAt || new Date()).toISOString()
        });
      }
    }

    res.json({ received: true, processed: true, status: nextStatus });

  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;