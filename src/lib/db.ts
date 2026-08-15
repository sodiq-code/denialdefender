/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with SQLite:
 * - Local SQLite for development (persistent file)
 * - /tmp SQLite for Vercel production (writable in serverless)
 *
 * The dbInit promise ensures the schema is pushed on first access
 * in the Vercel serverless environment.
 */

import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

// Initialize database schema on first access (needed for Vercel /tmp)
function ensureDbInitialized() {
  if (globalForPrisma.dbInitialized) return
  if (process.env.NODE_ENV === 'production') {
    try {
      execSync('npx prisma db push --accept-data-loss', {
        stdio: 'pipe',
        timeout: 15000,
        env: { ...process.env },
      })
      globalForPrisma.dbInitialized = true
    } catch {
      // Best effort - schema might already exist
      globalForPrisma.dbInitialized = true
    }
  }
}

export const db = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
