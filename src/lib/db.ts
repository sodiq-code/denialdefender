/**
 * DenialDefender — Database Client
 *
 * Uses Prisma with SQLite:
 * - Local SQLite for development (persistent file)
 * - /tmp SQLite for Vercel production (writable in serverless)
 *
 * Auto-initializes schema on first query in production.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  dbInitialized: boolean | undefined
}

const prismaClient = globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaClient

/**
 * Auto-initialize database schema in Vercel serverless environment.
 * /tmp is writable but starts empty, so we push the schema on first use.
 */
let initPromise: Promise<void> | null = null

async function initializeSchema(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (globalForPrisma.dbInitialized) return
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.dbInitialized = true
      return
    }

    try {
      // Quick check: does the Case table exist?
      await prismaClient.case.count()
      globalForPrisma.dbInitialized = true
    } catch (e: any) {
      if (e?.code === 'P2021') {
        console.log('[db] Initializing schema for Vercel /tmp...')
        try {
          const { execSync } = await import('child_process')
          execSync('npx prisma db push --accept-data-loss --skip-generate', {
            stdio: 'pipe',
            timeout: 30000,
            env: { ...process.env },
          })
          console.log('[db] Schema initialized successfully')
        } catch (err) {
          console.error('[db] Schema init error:', err)
        }
        globalForPrisma.dbInitialized = true
      } else {
        throw e
      }
    }
  })()

  return initPromise
}

/**
 * Export a proxy that auto-initializes on first property access.
 * This way, existing code using `db.case.findMany()` works transparently.
 */
export const db = new Proxy(prismaClient, {
  get(target, prop, receiver) {
    // Auto-initialize before any model access
    if (typeof prop === 'string' && prop !== '$transaction' && prop !== '$connect' && prop !== '$disconnect' && prop !== '$extends') {
      const original = Reflect.get(target, prop, receiver)
      if (original && typeof original === 'object') {
        // Wrap each model's methods to ensure initialization
        return new Proxy(original, {
          get(modelTarget, modelProp, modelReceiver) {
            const method = Reflect.get(modelTarget, modelProp, modelReceiver)
            if (typeof method === 'function') {
              return async function (...args: any[]) {
                await initializeSchema()
                return method.apply(modelTarget, args)
              }
            }
            return method
          }
        })
      }
    }
    return original
  }
}) as PrismaClient
