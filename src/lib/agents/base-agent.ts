/**
 * DenialDefender — Base Agent (Day 4 — ADK-style Agent Framework)
 *
 * Abstract base class for all ADK agents. Provides:
 * - Typed input/output via generics
 * - Latency measurement
 * - Decision trace emission at each step
 * - Error handling with structured AgentResult
 * - mockRun() fallback for when LLM is unavailable
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface TraceEvent {
  agent: string;
  step: string;
  timestamp: string;
  status: 'started' | 'completed' | 'error' | 'blocked';
  detail: string;
  latencyMs?: number;
}

export interface AgentResult<T> {
  agent: string;
  status: 'success' | 'error' | 'blocked';
  data: T;
  latencyMs: number;
  trace: TraceEvent;
}

// ─── Base Agent ───────────────────────────────────────────────────────────

export abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract description: string;

  /**
   * Main entry point — wraps execute() with latency measurement,
   * trace emission, and error handling.
   */
  async run(input: TInput): Promise<AgentResult<TOutput>> {
    const startMs = Date.now();
    const startTrace: TraceEvent = {
      agent: this.name,
      step: `${this.name}.run`,
      timestamp: new Date().toISOString(),
      status: 'started',
      detail: `Agent ${this.name} starting execution`,
    };

    try {
      const data = await this.execute(input);
      const latencyMs = Date.now() - startMs;

      return {
        agent: this.name,
        status: 'success',
        data,
        latencyMs,
        trace: {
          ...startTrace,
          status: 'completed',
          detail: `Agent ${this.name} completed in ${latencyMs}ms`,
          latencyMs,
        },
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startMs;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[base-agent] ${this.name}.execute() threw: ${msg}`, error instanceof Error ? error.stack?.split('\n').slice(0, 4).join(' | ') : '');

      // Try mock fallback
      try {
        const mockData = await this.mockExecute(input);
        return {
          agent: this.name,
          status: 'success',
          data: mockData,
          latencyMs: Date.now() - startMs,
          trace: {
            ...startTrace,
            status: 'completed',
            detail: `Agent ${this.name} fell back to mock after error: ${msg}`,
            latencyMs: Date.now() - startMs,
          },
        };
      } catch (mockErr: unknown) {
        const mockMsg = mockErr instanceof Error ? mockErr.message : String(mockErr);
        console.error(`[base-agent] ${this.name}.mockExecute() ALSO threw: ${mockMsg}`, mockErr instanceof Error ? mockErr.stack?.split('\n').slice(0, 4).join(' | ') : '');
        return {
          agent: this.name,
          status: 'error',
          data: this.defaultOutput(),
          latencyMs,
          trace: {
            ...startTrace,
            status: 'error',
            detail: `Agent ${this.name} failed: ${msg}`,
            latencyMs,
          },
        };
      }
    }
  }

  /**
   * Core execution logic — must be implemented by each agent.
   */
  protected abstract execute(input: TInput): Promise<TOutput>;

  /**
   * Mock/fallback execution — used when LLM or external service is unavailable.
   * Must be implemented by each agent.
   */
  protected abstract mockExecute(input: TInput): Promise<TOutput>;

  /**
   * Default output — used when both execute() and mockExecute() fail.
   */
  protected abstract defaultOutput(): TOutput;

  /**
   * Helper: emit a trace event for a sub-step within this agent.
   */
  emitTrace(step: string, status: TraceEvent['status'], detail: string, latencyMs?: number): TraceEvent {
    return {
      agent: this.name,
      step,
      timestamp: new Date().toISOString(),
      status,
      detail,
      latencyMs,
    };
  }
}
