import { requestOtp, verifyOtp, normalizePhone } from '../services/auth.service';
import { prisma } from '../db/prisma';

// Mock prisma
jest.mock('../db/prisma', () => ({
  prisma: {
    otpChallenge: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    appUser: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    }
  }
}));

describe('Auth Service - OTP logic', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizePhone', () => {
    test('adds + to valid local phone numbers', () => {
      expect(normalizePhone('251911234567')).toBe('+251911234567');
      expect(normalizePhone('0911234567')).toBe('+0911234567');
    });
    test('keeps + if already present', () => {
      expect(normalizePhone('+251911234567')).toBe('+251911234567');
    });
    test('strips spaces and dashes', () => {
      expect(normalizePhone('+251 911 23-45-67')).toBe('+251911234567');
    });
    test('throws on invalid length', () => {
      expect(() => normalizePhone('123')).toThrow();
    });
  });

  describe('requestOtp', () => {
    test('creates an otp challenge and returns challenge id and code', async () => {
      const phone = '+251911234567';
      const role = 'PASSENGER';

      const result = await requestOtp(phone, role);

      expect(result).toHaveProperty('challengeId');
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('expiresInSeconds', 600); // 10 minutes

      expect(prisma.otpChallenge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone,
            role,
            codeHash: expect.any(String), // hashed code
            expiresAt: expect.any(Date),
          })
        })
      );
    });
  });

  describe('verifyOtp', () => {
    // Helper to generate a known hash for a test code (e.g., '123456')
    const crypto = require('node:crypto');
    const validCode = '123456';
    const validCodeHash = crypto.createHash('sha256').update(validCode).digest('hex');

    const validChallenge = {
      id: 'challenge-123',
      phone: '+251911234567',
      role: 'PASSENGER',
      codeHash: validCodeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60000), // future
      consumedAt: null,
    };

    test('throws if challenge not found', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(verifyOtp('invalid-id', '123456')).rejects.toThrow('OTP expired or invalid');
    });

    test('throws if challenge expired', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue({
        ...validChallenge,
        expiresAt: new Date(Date.now() - 1000), // past
      });
      await expect(verifyOtp('challenge-123', '123456')).rejects.toThrow('OTP expired or invalid');
    });

    test('throws if already consumed', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue({
        ...validChallenge,
        consumedAt: new Date(),
      });
      await expect(verifyOtp('challenge-123', '123456')).rejects.toThrow('OTP expired or invalid');
    });

    test('increments attempts and throws if incorrect OTP code', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue(validChallenge);

      await expect(verifyOtp('challenge-123', '000000')).rejects.toThrow('Incorrect OTP');

      expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-123' },
        data: { attempts: 1 }
      });
    });

    test('throws if too many attempts', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue({
        ...validChallenge,
        attempts: 5,
      });

      await expect(verifyOtp('challenge-123', validCode)).rejects.toThrow('Too many attempts');
    });

    test('marks as consumed and issues token if valid', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue(validChallenge);
      (prisma.appUser.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        phone: validChallenge.phone,
        role: validChallenge.role,
        isVerified: true
      });
      (prisma.appUser.update as jest.Mock).mockResolvedValue({
        id: 'user-1',
        phone: validChallenge.phone,
        role: validChallenge.role,
        isVerified: true
      });

      const result = await verifyOtp('challenge-123', validCode);

      expect(result).toHaveProperty('token');
      expect(result.user).toHaveProperty('id', 'user-1');

      expect(prisma.otpChallenge.update).toHaveBeenCalledWith({
        where: { id: 'challenge-123' },
        data: { consumedAt: expect.any(Date) }
      });
    });

    test('prevents role switching (e.g. driver trying to login as passenger)', async () => {
      (prisma.otpChallenge.findUnique as jest.Mock).mockResolvedValue(validChallenge); // wants to login as PASSENGER
      (prisma.appUser.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-1',
        phone: validChallenge.phone,
        role: 'DRIVER', // but is a DRIVER
        isVerified: true
      });

      await expect(verifyOtp('challenge-123', validCode)).rejects.toThrow('This phone is registered for another role');
    });
  });
});
