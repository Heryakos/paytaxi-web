import { canTransition } from '../services/fares';

describe('canTransition()', () => {
  // ---- Valid (allowed) transitions ----
  test('PENDING -> SUCCESS is allowed', () => {
    expect(canTransition('PENDING', 'SUCCESS')).toBe(true);
  });
  test('PENDING -> FAILED is allowed', () => {
    expect(canTransition('PENDING', 'FAILED')).toBe(true);
  });
  test('PENDING -> REFUNDED is allowed', () => {
    expect(canTransition('PENDING', 'REFUNDED')).toBe(true);
  });
  test('PENDING -> UNKNOWN is allowed', () => {
    expect(canTransition('PENDING', 'UNKNOWN')).toBe(true);
  });
  test('SUCCESS -> REFUNDED is allowed', () => {
    expect(canTransition('SUCCESS', 'REFUNDED')).toBe(true);
  });
  test('UNKNOWN -> SUCCESS is allowed', () => {
    expect(canTransition('UNKNOWN', 'SUCCESS')).toBe(true);
  });
  test('UNKNOWN -> FAILED is allowed', () => {
    expect(canTransition('UNKNOWN', 'FAILED')).toBe(true);
  });
  test('UNKNOWN -> REFUNDED is allowed', () => {
    expect(canTransition('UNKNOWN', 'REFUNDED')).toBe(true);
  });

  // ---- Invalid (blocked) transitions ----
  test('FAILED -> SUCCESS is blocked (terminal)', () => {
    expect(canTransition('FAILED', 'SUCCESS')).toBe(false);
  });
  test('FAILED -> REFUNDED is blocked (terminal)', () => {
    expect(canTransition('FAILED', 'REFUNDED')).toBe(false);
  });
  test('REFUNDED -> SUCCESS is blocked (terminal)', () => {
    expect(canTransition('REFUNDED', 'SUCCESS')).toBe(false);
  });
  test('SUCCESS -> PENDING is blocked (no backward)', () => {
    expect(canTransition('SUCCESS', 'PENDING')).toBe(false);
  });
  test('SUCCESS -> FAILED is blocked', () => {
    expect(canTransition('SUCCESS', 'FAILED')).toBe(false);
  });
  test('PENDING -> PENDING (same state) is blocked', () => {
    expect(canTransition('PENDING', 'PENDING')).toBe(false);
  });
  test('SUCCESS -> SUCCESS (same state) is blocked', () => {
    expect(canTransition('SUCCESS', 'SUCCESS')).toBe(false);
  });
  test('unknown state returns false', () => {
    expect(canTransition('INVALID_STATE', 'SUCCESS')).toBe(false);
  });
});

describe('resolveFare() for Ethiopian Minibus Transit', () => {
  const { resolveFare, FARE_PRESETS } = require('../services/fares');

  test('resolves standard minibus preset with string argument', () => {
    const fare = resolveFare('standard');
    expect(fare).not.toBeNull();
    expect(fare.amount).toBe(15);
    expect(fare.currency).toBe('ETB');
    expect(fare.passengerCount).toBe(1);
  });

  test('resolves short stage preset (10 ETB)', () => {
    const fare = resolveFare({ presetId: 'short' });
    expect(fare.amount).toBe(10);
    expect(fare.unitAmount).toBe(10);
    expect(fare.passengerCount).toBe(1);
  });

  test('multiplies fare by passenger count for multi-seat payment (e.g. 3 passengers x 15 ETB = 45 ETB)', () => {
    const fare = resolveFare({ presetId: 'standard', passengerCount: 3 });
    expect(fare.amount).toBe(45);
    expect(fare.unitAmount).toBe(15);
    expect(fare.passengerCount).toBe(3);
    expect(fare.label).toContain('3 seats');
  });

  test('resolves custom fare within bounds (e.g. 12 ETB)', () => {
    const fare = resolveFare({ customAmount: 12, passengerCount: 1 });
    expect(fare).not.toBeNull();
    expect(fare.amount).toBe(12);
    expect(fare.id).toBe('custom');
  });

  test('multiplies custom fare by passenger count (2 x 12 ETB = 24 ETB)', () => {
    const fare = resolveFare({ customAmount: 12, passengerCount: 2 });
    expect(fare.amount).toBe(24);
    expect(fare.passengerCount).toBe(2);
  });

  test('rejects custom fare below minimum 5 ETB', () => {
    const fare = resolveFare({ customAmount: 3 });
    expect(fare).toBeNull();
  });

  test('rejects custom fare above maximum 500 ETB', () => {
    const fare = resolveFare({ customAmount: 600 });
    expect(fare).toBeNull();
  });

  test('rejects unknown presetId', () => {
    const fare = resolveFare({ presetId: 'non_existent_preset' });
    expect(fare).toBeNull();
  });
});

