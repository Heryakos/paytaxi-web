import { PrismaClient } from '@prisma/client'
import { PrismaMssql } from '@prisma/adapter-mssql'
import { PrismaPg } from '@prisma/adapter-pg'
import dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../.env') })

let connectionString = process.env.DATABASE_URL!
if (connectionString && connectionString.includes('db.sklddyglnuigdnqhegck.supabase.co')) {
  connectionString = connectionString
    .replace('postgres:PayTaxi', 'postgres.sklddyglnuigdnqhegck:PayTaxi')
    .replace('db.sklddyglnuigdnqhegck.supabase.co:5432', 'aws-0-eu-west-1.pooler.supabase.com:5432')
    .replace('db.sklddyglnuigdnqhegck.supabase.co', 'aws-0-eu-west-1.pooler.supabase.com:5432')
  if (!connectionString.includes('schema=public')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'schema=public'
  }
}
let _prisma: PrismaClient | null = null

export async function getPrisma(): Promise<PrismaClient> {
  if (_prisma) return _prisma
  if (connectionString && (connectionString.startsWith('postgresql:') || connectionString.startsWith('postgres:'))) {
    const adapter = new PrismaPg({ connectionString })
    _prisma = new PrismaClient({ adapter } as any)
  } else {
    const adapter = new PrismaMssql(connectionString)
    _prisma = new PrismaClient({ adapter } as any)
  }
  return _prisma
}

export let prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!_prisma) {
      throw new Error('Prisma not initialized yet. Call getPrisma() first in src/index.ts startup.')
    }
    return (_prisma as any)[prop]
  }
})
