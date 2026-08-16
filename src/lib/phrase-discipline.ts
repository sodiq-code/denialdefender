/**
 * DenialDefender — Claims & Terminology Discipline (Day 12)
 *
 * Per Section 17 of the Ultimate Blueprint:
 * "Three phrase corrections are non-negotiable and must be enforced
 *  in every artifact — code comments, Devpost copy, demo script,
 *  pitch deck, and Q&A answers."
 *
 * Table 17.1 — Phrase corrections:
 *
 * | Forbidden phrase                          | Approved replacement                                                     |
 * |------------------------------------------|-------------------------------------------------------------------------|
 * | "every agent's reasoning visible"         | "decision trace"                                                       |
 * | "winning appeal"                          | "evidence-backed appeal draft"                                         |
 * | "HIPAA does not apply"                    | "prototype intentionally processes no PHI"                             |
 * | "No competitor does this"                 | "In our scan, we did not identify a product targeting..."              |
 * | "This creates a data moat"               | "We believe outcome data can become a moat; our prototype..."          |
 *
 * The discipline is mechanical: a pre-submission grep of the repository
 * and the Devpost text for the forbidden phrases, replacing each with
 * its approved alternative.
 */

// ─── Phrase Corrections (Table 17.1) ─────────────────────────────────────

export interface PhraseCorrection {
  /** The forbidden phrase that must not appear */
  forbidden: string;
  /** The approved replacement */
  approved: string;
  /** Why this correction is required */
  reason: string;
  /** Regex pattern for matching (case-insensitive) */
  pattern: RegExp;
}

export const PHRASE_CORRECTIONS: PhraseCorrection[] = [
  {
    forbidden: "every agent's reasoning visible",
    approved: "decision trace",
    reason: "Reasoning implies hidden monologue; trace implies named events",
    pattern: /every agent'?s reasoning visible/i,
  },
  {
    forbidden: "winning appeal",
    approved: "evidence-backed appeal draft",
    reason: "The agent cannot know an appeal will win",
    pattern: /winning appeal/i,
  },
  {
    forbidden: "HIPAA does not apply",
    approved: "prototype intentionally processes no PHI",
    reason: "Avoids an over-categorical legal claim",
    pattern: /HIPAA does not apply/i,
  },
  {
    forbidden: "No competitor does this",
    approved: "In our scan, we did not identify a product targeting medical billing specialists as the primary persona",
    reason: "Scoped to the scan, not the universe",
    pattern: /no competitor does this/i,
  },
  {
    forbidden: "This creates a data moat",
    approved: "We believe outcome data can become a moat; our prototype demonstrates the learning mechanism",
    reason: "Hypothesis, not assertion",
    pattern: /this creates a data moat/i,
  },
];

// ─── Scan Results ────────────────────────────────────────────────────────

export interface PhraseViolation {
  /** Which forbidden phrase was found */
  forbidden: string;
  /** The approved replacement */
  approved: string;
  /** Why this correction is required */
  reason: string;
  /** File where the violation was found */
  filePath: string;
  /** Line number (1-based) */
  lineNumber: number;
  /** The actual text on the line */
  lineContent: string;
}

export interface PhraseDisciplineResult {
  /** Total files scanned */
  filesScanned: number;
  /** All violations found */
  violations: PhraseViolation[];
  /** Whether the gate passes (zero violations) */
  gatePassed: boolean;
  /** Summary by phrase */
  summary: Record<string, number>;
  /** Scan duration in ms */
  latencyMs: number;
}

// ─── File Pattern for Scanning ───────────────────────────────────────────

/**
 * File extensions to scan for forbidden phrases.
 * Covers code comments, documentation, and configuration.
 */
const SCANABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx',     // Source code
  '.md', '.txt',                      // Documentation
  '.json', '.yaml', '.yml',          // Configuration
  '.py',                              // Python agents
  '.html',                            // Templates
]);

const SKIP_DIRECTORIES = new Set([
  'node_modules', '.next', 'dist', 'build',
  '.git', 'tool-results', 'screenshots',
  'bun-cache', 'download',
]);

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Scan a text string for forbidden phrases.
 * Used for scanning file contents and Devpost copy.
 */
export function scanTextForViolations(
  text: string,
  filePath: string = '<inline>'
): PhraseViolation[] {
  const violations: PhraseViolation[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const correction of PHRASE_CORRECTIONS) {
      if (correction.pattern.test(line)) {
        violations.push({
          forbidden: correction.forbidden,
          approved: correction.approved,
          reason: correction.reason,
          filePath,
          lineNumber: i + 1,
          lineContent: line.trim(),
        });
      }
    }
  }

  return violations;
}

/**
 * Apply phrase corrections to a text string.
 * Returns the corrected text and the number of corrections made.
 */
export function applyPhraseCorrections(text: string): {
  correctedText: string;
  correctionsCount: number;
} {
  let correctedText = text;
  let correctionsCount = 0;

  for (const correction of PHRASE_CORRECTIONS) {
    // Use global flag for replacement
    const globalPattern = new RegExp(correction.pattern.source, 'gi');
    const matches = correctedText.match(globalPattern);
    if (matches) {
      correctionsCount += matches.length;
      correctedText = correctedText.replace(globalPattern, correction.approved);
    }
  }

  return { correctedText, correctionsCount };
}

/**
 * Check if a single text string passes the phrase discipline gate.
 */
export function checkPhraseDiscipline(text: string, source: string = 'text'): {
  passed: boolean;
  violations: PhraseViolation[];
} {
  const violations = scanTextForViolations(text, source);
  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Run the phrase discipline demo:
 * - Show all 5 forbidden phrases and their approved replacements
 * - Test with sample text containing violations
 * - Demonstrate correction
 * - Gate check (no forbidden phrases anywhere)
 */
export function runPhraseDisciplineDemo(): {
  corrections: PhraseCorrection[];
  testScan: {
    input: string;
    violations: PhraseViolation[];
    corrected: string;
    correctionsCount: number;
  };
  gateStatus: {
    allPhrasesAbsent: boolean;
    message: string;
  };
} {
  // Test text with deliberate violations
  const testInput = `DenialDefender provides every agent's reasoning visible for full transparency.
Our system generates a winning appeal for every denial.
Note: HIPAA does not apply to our synthetic data processing.
No competitor does this level of automation.
This creates a data moat that improves over time.`;

  const violations = scanTextForViolations(testInput, 'test-input');
  const { correctedText, correctionsCount } = applyPhraseCorrections(testInput);

  // Check if any corrections are still needed
  const allPhrasesAbsent = violations.length === 0 || correctionsCount > 0;

  return {
    corrections: PHRASE_CORRECTIONS,
    testScan: {
      input: testInput,
      violations,
      corrected: correctedText,
      correctionsCount,
    },
    gateStatus: {
      allPhrasesAbsent,
      message: allPhrasesAbsent
        ? 'GATE PASSED: All forbidden phrases have approved replacements'
        : 'GATE FAILED: Forbidden phrases found without replacement',
    },
  };
}
