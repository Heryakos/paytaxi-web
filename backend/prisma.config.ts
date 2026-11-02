import { defineConfig } from 'prisma/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env before Prisma reads DATABASE_URL
config({ path: resolve(__dirname, '.env') })

let dbUrl = process.env.DATABASE_URL || ''
if (dbUrl.includes('db.sklddyglnuigdnqhegck.supabase.co')) {
  dbUrl = dbUrl
    .replace('postgres:PayTaxi', 'postgres.sklddyglnuigdnqhegck:PayTaxi')
    .replace('db.sklddyglnuigdnqhegck.supabase.co:5432', 'aws-0-eu-west-1.pooler.supabase.com:5432')
    .replace('db.sklddyglnuigdnqhegck.supabase.co', 'aws-0-eu-west-1.pooler.supabase.com:5432')
  if (!dbUrl.includes('schema=public')) {
    dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'schema=public'
  }
}

export default defineConfig({
  datasource: {
    url: dbUrl,
  }
})
