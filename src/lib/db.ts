/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with:
 * - Local SQLite for development
 * - Turso (libSQL) for production (Vercel) via @prisma/adapter-libsql
 * - Falls back to local SQLite if Turso connection fails
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

  // In production with Turso credentials, try the libSQL adapter
  if (tursoUrl && tursoToken && process.env.NODE_ENV === 'production') {
    try {
      console.log('[db] Attempting Turso adapter:', tursoUrl.replace(/\/\/.*@/, '//***@'))
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      })
      const adapter = new PrismaLibSql(libsql)
      const client = new PrismaClient({ adapter })
      console.log('[db] Turso adapter created successfully')
      return client
    } catch (e) {
      console.error('[db] Turso adapter failed, falling back to SQLite:', e)
    }
  }

  // Fallback: use local SQLite (works for dev and for Vercel build)
  console.log('[db] Using local SQLite:', process.env.DATABASE_URL || 'file:./prisma/dev.db')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
