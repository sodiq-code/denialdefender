/**
 * Auto-seed — idempotent. On a fresh database (Cloud Run cold start), ingests
 * the 31-file evidence corpus, payer policies, and 90 synthetic cases so the
 * pipeline has real data to ground citations in. Runs in <1s.
 */
import { db } from '@/lib/db';
import { ingestRawEvidence, ingestPayerPolicies } from '@/lib/evidence-ingest';
import { storeSyntheticCases } from '@/lib/synthetic-cases';

let seeding: Promise<void> | null = null;
let seeded = false;

export async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (seeding) return seeding;
  seeding = (async () => {
    try {
      const evidenceCount = await db.evidence.count().catch(() => 0);
      if (evidenceCount === 0) {
        console.log('[auto-seed] fresh DB — ingesting evidence corpus…');
        await ingestRawEvidence('data/corpus/raw').catch((e) =>
          console.warn('[auto-seed] evidence ingest failed:', (e as Error)?.message),
        );
        await ingestPayerPolicies().catch((e) =>
          console.warn('[auto-seed] policy ingest failed:', (e as Error)?.message),
        );
      }
      const caseCount = await db.case.count().catch(() => 0);
      if (caseCount === 0) {
        console.log('[auto-seed] seeding synthetic cases…');
        await storeSyntheticCases(90).catch((e) =>
          console.warn('[auto-seed] case seed failed:', (e as Error)?.message),
        );
      }
      seeded = true;
      console.log('[auto-seed] done');
    } catch (e) {
      console.warn('[auto-seed] error:', (e as Error)?.message);
    } finally {
      seeding = null;
    }
  })();
  return seeding;
}
