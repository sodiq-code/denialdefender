/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with:
 * - Local SQLite for development
 * - Turso (libSQL) for production (Vercel) via @prisma/adapter-libsql
 */

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  // In production with Turso credentials, use the libSQL adapter
  if (tursoUrl && tursoToken && process.env.NODE_ENV === 'production') {
    console.log('[db] Using Turso adapter:', tursoUrl.replace(/\/\/.*@/, '//***@'))
    const libsql = createClient({
      url: tursoUrl,
      authToken: tursoToken,
    })
    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({ adapter })
  }

  // In development, use local SQLite
  console.log('[db] Using local SQLite')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
