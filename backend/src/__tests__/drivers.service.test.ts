import { registerDriver, approveDriver, replaceLostQr } from '../services/drivers.service';
import { prisma } from '../db/prisma';

jest.mock('../db/prisma', () => ({
  prisma: {
    driverProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    taxiQr: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    }
  }
}));

describe('Drivers Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Driver Registration', () => {
    test('throws if profile already exists', async () => {
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({ id: 'driver-1' });

      await expect(registerDriver({
        userId: 'user-1',
        name: 'John Doe',
        phone: '+251911111111',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleColor: 'White',
        plateNumber: 'B12345'
      })).rejects.toThrow('A driver profile already exists for this account');
    });

    test('creates profile in PENDING state', async () => {
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.driverProfile.create as jest.Mock).mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'PENDING'
      });

      const result = await registerDriver({
        userId: 'user-1',
        name: ' John Doe ',
        phone: '+251911111111',
        vehicleMake: ' Toyota ',
        vehicleModel: ' Corolla ',
        vehicleColor: ' White ',
        plateNumber: ' b12345 ' // should uppercase
      });

      expect(result.profile).toHaveProperty('id', 'driver-1');
      expect(prisma.driverProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            displayName: 'John Doe',
            vehicleMake: 'Toyota',
            plateNumber: 'B12345',
            verificationStatus: 'PENDING',
          })
        })
      );
    });
  });

  describe('Driver Approval', () => {
    test('updates status to APPROVED and issues an ACTIVE QR', async () => {
      (prisma.driverProfile.update as jest.Mock).mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'APPROVED'
      });

      (prisma.taxiQr.create as jest.Mock).mockResolvedValue({
        id: 'qr-1',
        taxiId: 'TX-9999',
        status: 'ACTIVE'
      });

      const result = await approveDriver('driver-1');

      expect(result.profile.verificationStatus).toBe('APPROVED');
      expect(result.qr.status).toBe('ACTIVE');

      expect(prisma.driverProfile.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: { verificationStatus: 'APPROVED' }
      });

      expect(prisma.taxiQr.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverProfileId: 'driver-1',
            status: 'ACTIVE',
            taxiId: expect.stringMatching(/^TX-\d{4}$/),
            qrPayloadUrl: expect.stringMatching(/^\/t\/TX-\d{4}$/)
          })
        })
      );
    });
  });

  describe('QR Replace on Lost', () => {
    test('throws if driver is not APPROVED', async () => {
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'PENDING'
      });

      await expect(replaceLostQr('driver-1')).rejects.toThrow('Only approved drivers can replace a QR');
    });

    test('disables current ACTIVE QR and creates a new ACTIVE QR', async () => {
      (prisma.driverProfile.findUnique as jest.Mock).mockResolvedValue({
        id: 'driver-1',
        verificationStatus: 'APPROVED'
      });

      (prisma.taxiQr.findFirst as jest.Mock).mockResolvedValue({
        id: 'old-qr-1',
        status: 'ACTIVE'
      });

      (prisma.taxiQr.create as jest.Mock).mockResolvedValue({
        id: 'new-qr-2',
        status: 'ACTIVE'
      });

      await replaceLostQr('driver-1');

      // Verify old QR was updated
      expect(prisma.taxiQr.update).toHaveBeenCalledWith({
        where: { id: 'old-qr-1' },
        data: expect.objectContaining({
          status: 'REPLACED',
          disabledReason: 'LOST_OR_STOLEN'
        })
      });

      // Verify new QR was created
      expect(prisma.taxiQr.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverProfileId: 'driver-1',
            status: 'ACTIVE'
          })
        })
      );
    });
  });
});
