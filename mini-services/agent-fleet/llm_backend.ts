/**
 * DenialDefender Gemini-Only LLM System — TypeScript/Bun
 * Backend: Google Gemini 3.5+ (direct API)
 *
 * Architecture:
 * - Uses Gemini direct API as the sole LLM backend
 * - No fallback — if Gemini fails, returns error LLMResponse
 * - Maintains consistent interface for all 8 agents
 */

// ─── Configuration from Environment ─────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
const GEMINI_CHECK_TIMEOUT = parseInt(process.env.GEMINI_CHECK_TIMEOUT ?? "5", 10) * 1000;
const LLM_GENERATION_TIMEOUT = parseInt(process.env.LLM_GENERATION_TIMEOUT ?? "60", 10) * 1000;

// ─── Types ──────────────────────────────────────────────────────────────

enum LLMBackend {
  GEMINI_DIRECT = "gemini_direct",
}

interface LLMResponse {
  content: string;
  model: string;
  backend: LLMBackend;
  tokensUsed: number;
  success: boolean;
  error?: string;
}

interface GenerationConfig {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  systemPrompt?: string;
}

// ─── GeminiLLM Class ───────────────────────────────────────────────────

class GeminiLLM {
  public activeBackend: LLMBackend = LLMBackend.GEMINI_DIRECT;
  public geminiAvailable: boolean | null = null;

  constructor() {
    this.checkGemini();
  }

  /** Check if Gemini API is accessible. */
  private checkGemini(): void {
    if (!GEMINI_API_KEY) {
      this.geminiAvailable = false;
      console.log("[GeminiLLM] No GEMINI_API_KEY set — agents will use mock mode");
      return;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEMINI_CHECK_TIMEOUT);

      fetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          clearTimeout(timeoutId);
          this.geminiAvailable = true;
          console.log(`[GeminiLLM] Active LLM backend: ${this.activeBackend}`);
          return true;
        })
        .catch((err) => {
          clearTimeout(timeoutId);
          this.handleGeminiCheckError(err);
          return false;
        });

      // Optimistically return true; if the check fails later,
      // the generate method will handle it
      this.geminiAvailable = true;
    } catch (e) {
      this.handleGeminiCheckError(e);
    }
  }

  private handleGeminiCheckError(e: unknown): void {
    const msg = String(e);
    if (msg.includes("location is not supported")) {
      console.warn("[GeminiLLM] Gemini API geo-blocked in this region");
    } else if (msg.includes("leaked")) {
      console.warn("[GeminiLLM] Gemini API key reported as leaked");
    } else if (msg.includes("PERMISSION_DENIED")) {
      console.warn("[GeminiLLM] Gemini API permission denied");
    } else {
      console.warn(`[GeminiLLM] Gemini API check failed: ${msg.slice(0, 100)}`);
    }
    this.geminiAvailable = false;
  }

  /** Generate text using Gemini direct API. No fallback. */
  async generate(
    prompt: string,
    config: GenerationConfig = {}
  ): Promise<LLMResponse> {
    const { temperature = 0.7, maxTokens = 2048, model, systemPrompt = "" } = config;
    return this.generateGemini(prompt, systemPrompt, model, temperature, maxTokens);
  }

  /** Generate using Gemini API directly. */
  private async generateGemini(
    prompt: string,
    systemPrompt: string,
    model?: string,
    temperature = 0.7,
    maxTokens = 2048
  ): Promise<LLMResponse> {
    try {
      const modelName = model ?? GEMINI_MODEL;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

      const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
      if (systemPrompt) {
        contents.push({ role: "user", parts: [{ text: systemPrompt }] });
        contents.push({ role: "model", parts: [{ text: "Understood." }] });
      }
      contents.push({ role: "user", parts: [{ text: prompt }] });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LLM_GENERATION_TIMEOUT);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.candidates[0].content.parts[0].text;
      const tokens = data.usageMetadata?.totalTokenCount ?? 0;

      return {
        content: text,
        model: modelName,
        backend: LLMBackend.GEMINI_DIRECT,
        tokensUsed: tokens,
        success: true,
      };
    } catch (e) {
      const error = String(e);
      console.error(`[GeminiLLM] Gemini API error: ${error.slice(0, 200)}`);
      return {
        content: "",
        model: model ?? GEMINI_MODEL,
        backend: LLMBackend.GEMINI_DIRECT,
        tokensUsed: 0,
        success: false,
        error,
      };
    }
  }
}

// ─── Singleton Instance ────────────────────────────────────────────────

let _llmInstance: GeminiLLM | null = null;

export function getLLM(): GeminiLLM {
  if (!_llmInstance) {
    _llmInstance = new GeminiLLM();
  }
  return _llmInstance;
}

export { GeminiLLM, LLMBackend };
export type { LLMResponse, GenerationConfig };
