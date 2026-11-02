import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env') })

const connectionString = process.env.DATABASE_URL!

async function main() {
  console.log('Connecting to database...')
  let prisma: PrismaClient
  if (connectionString && (connectionString.startsWith('postgresql:') || connectionString.startsWith('postgres:'))) {
    const adapter = new PrismaPg({ connectionString })
    prisma = new PrismaClient({ adapter } as any)
  } else {
    const adapter = new PrismaMssql(connectionString)
    prisma = new PrismaClient({ adapter } as any)
  }

  console.log('Seeding database...')

  // Admin user
  await prisma.appUser.upsert({
    where: { phone: '+251911111111' },
    update: {},
    create: {
      phone: '+251911111111',
      role: 'ADMIN',
      name: 'System Admin',
      isVerified: true,
    },
  })

  // Driver user + profile
  const driverUser = await prisma.appUser.upsert({
    where: { phone: '+251922222222' },
    update: {},
    create: {
      phone: '+251922222222',
      role: 'DRIVER',
      name: 'Abebe Bikila',
      isVerified: true,
    },
  })

  let driverProfile = await prisma.driverProfile.findUnique({
    where: { userId: driverUser.id }
  })

  if (!driverProfile) {
    driverProfile = await prisma.driverProfile.create({
      data: {
        userId: driverUser.id,
        displayName: 'Abebe B.',
        plateNumber: 'B12345',
        vehicleMake: 'Toyota',
        vehicleModel: 'Corolla',
        vehicleColor: 'Blue',
        verificationStatus: 'APPROVED',
      }
    })
  }

  // Taxi QR (the one seeded drivers can test with)
  await prisma.taxiQr.upsert({
    where: { taxiId: 'TX-1001' },
    update: {},
    create: {
      taxiId: 'TX-1001',
      driverProfileId: driverProfile.id,
      qrPayloadUrl: 'https://paytaxi.et/t/TX-1001',
      status: 'ACTIVE',
      backupCode: 'ABCD1234',
    }
  })

  // Passenger user
  await prisma.appUser.upsert({
    where: { phone: '+251933333333' },
    update: {},
    create: {
      phone: '+251933333333',
      role: 'PASSENGER',
      name: 'Almaz T.',
      isVerified: true,
    },
  })

  console.log('✅ Seeding complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
