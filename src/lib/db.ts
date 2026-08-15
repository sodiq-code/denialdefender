/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with:
 * - Local SQLite for development
 * - Turso (libSQL) for production (Vercel)
 *
 * The @prisma/adapter-libsql adapter wraps the @libsql/client
 * to provide a Prisma-compatible interface for Turso's hosted SQLite.
 */

import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // In production with Turso, use the libSQL adapter
  if (process.env.TURSO_DATABASE_URL && process.env.NODE_ENV === 'production') {
    const libsql = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })

    const adapter = new PrismaLibSql(libsql)
    return new PrismaClient({ adapter })
  }

  // In development, use local SQLite
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
