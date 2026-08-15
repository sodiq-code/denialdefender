/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with SQLite:
 * - Local SQLite for development (persistent)
 * - In-memory SQLite for Vercel production (function-scoped)
 *
 * The Day 13 demo (dry runs, domain validation) works without
 * cross-invocation persistence. Each Vercel function gets a fresh
 * filesystem, so we use the local file created during build.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
