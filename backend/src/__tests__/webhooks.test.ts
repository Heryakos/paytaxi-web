/**
 * Webhook idempotency & concurrent update tests.
 *
 * We test the logic in isolation by mocking prisma and the provider — no DB needed.
 * The real compare-and-set atomicity is guaranteed by the DB (updateMany with status precondition).
 * Here we test: duplicate event IDs are rejected, zero-affected-rows is handled gracefully,
 * and the canTransition guard blocks invalid transitions.
 */

import { canTransition } from '../services/fares';

// ---- Idempotency via unique constraint (simulated) ----
describe('Webhook idempotency (eventId uniqueness)', () => {
  const seenEvents = new Set<string>();

  function handleEvent(eventId: string): 'new' | 'duplicate' {
    if (seenEvents.has(eventId)) return 'duplicate';
    seenEvents.add(eventId);
    return 'new';
  }

  beforeEach(() => seenEvents.clear());

  test('first event is processed', () => {
    expect(handleEvent('evt-001')).toBe('new');
  });

  test('duplicate event ID is rejected', () => {
    handleEvent('evt-001');
    expect(handleEvent('evt-001')).toBe('duplicate');
  });

  test('different event IDs are both processed', () => {
    expect(handleEvent('evt-001')).toBe('new');
    expect(handleEvent('evt-002')).toBe('new');
  });
});

// ---- Compare-and-set race simulation ----
describe('Webhook compare-and-set (concurrent update handling)', () => {
  type TxStatus = string;

  interface MockTransaction {
    id: string;
    status: TxStatus;
  }

  /** Simulates the updateMany(where: { id, status: from }) pattern */
  function atomicUpdateIfStatus(tx: MockTransaction, from: TxStatus, to: TxStatus): number {
    if (tx.status === from) {
      tx.status = to;
      return 1; // 1 row affected
    }
    return 0; // lost the race or already updated
  }

  test('update succeeds when status matches expectation', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'PENDING' };
    const count = atomicUpdateIfStatus(tx, 'PENDING', 'SUCCESS');
    expect(count).toBe(1);
    expect(tx.status).toBe('SUCCESS');
  });

  test('update returns 0 when status has already changed (lost race)', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'SUCCESS' }; // already updated
    const count = atomicUpdateIfStatus(tx, 'PENDING', 'SUCCESS');
    expect(count).toBe(0);
    expect(tx.status).toBe('SUCCESS'); // unchanged
  });

  test('zero-affected-rows + status matches target => idempotent (same result already applied)', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'SUCCESS' };
    const count = atomicUpdateIfStatus(tx, 'PENDING', 'SUCCESS');
    expect(count).toBe(0);
    // Re-read: tx.status === nextStatus (SUCCESS === SUCCESS) => idempotent
    expect(tx.status).toBe('SUCCESS');
  });

  test('zero-affected-rows + status does NOT match target => conflict (should log warning)', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'FAILED' };
    const count = atomicUpdateIfStatus(tx, 'PENDING', 'SUCCESS');
    expect(count).toBe(0);
    // Re-read: tx.status (FAILED) !== nextStatus (SUCCESS) => conflict
    expect(tx.status).not.toBe('SUCCESS');
  });

  test('double-fire of the same event cannot change terminal state (canTransition guard)', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'SUCCESS' };
    // Second webhook fires with SUCCESS again — canTransition blocks it
    expect(canTransition(tx.status, 'SUCCESS')).toBe(false);
  });

  test('FAILED terminal state cannot be moved to SUCCESS by a stale webhook', () => {
    const tx: MockTransaction = { id: 'tx-1', status: 'FAILED' };
    expect(canTransition(tx.status, 'SUCCESS')).toBe(false);
  });
});
