/**
 * Shared utility for synchronous AI calls via child process.
 *
 * Wraps async AI provider calls (generateCode) into synchronous execution
 * using execSync + temp script pattern.  API key is passed via environment
 * variable (_AG_AI_KEY) to avoid writing secrets to disk.
 *
 * Previously this pattern was duplicated in:
 *   - BaseSubAgent.callAISync()
 *   - CoderAgent.generateCodeSync()
 *   - AutonomousLoop.tryAIJudge()
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// ─── Public Interface ────────────────────────────────────

export interface AISyncCallOptions {
  /** AI provider configuration (provider, model, apiKey, maxTokens). */
  aiConfig: { provider: string; model?: string; apiKey?: string; maxTokens?: number };
  /** System-level prompt (role / persona). */
  systemPrompt: string;
  /** User-level prompt (the actual request). */
  userPrompt: string;
  /** Maximum tokens for AI response (default 4096). */
  maxTokens?: number;
  /** Timeout in ms for the child process (default 120 000). */
  timeout?: number;
}

// ─── Implementation ──────────────────────────────────────

/**
 * Calls the AI provider synchronously by spawning a child Node.js process.
 *
 *   1. Creates a temp directory under os.tmpdir()
 *   2. Writes a .js script (API key via _AG_AI_KEY env var, never on disk)
 *   3. Executes via execSync
 *   4. Parses JSON response from stdout
 *   5. Cleans up temp file in finally
 *   6. Returns response text or null on failure
 */
export function callAISyncUtil(options: AISyncCallOptions): string | null {
  const {
    aiConfig,
    systemPrompt,
    userPrompt,
    maxTokens = 4096,
    timeout = 120_000,
  } = options;

  try {
    const tmpDir = path.join(os.tmpdir(), '.ag-review-ai');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const scriptPath = path.join(
      tmpDir,
      `_ai_sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.js`,
    );
    const providerPath = path
      .resolve(__dirname, '..', 'orchestrator', 'ai-provider')
      .replace(/\\/g, '\\\\');

    // Strip the API key so it is never serialised into the temp script.
    const safeConfig = { ...aiConfig, apiKey: undefined };

    const script = `
const { generateCode } = require('${providerPath}');
const config = { ...${JSON.stringify(safeConfig)}, apiKey: process.env._AG_AI_KEY };
const request = {
  prompt: ${JSON.stringify(userPrompt)},
  systemPrompt: ${JSON.stringify(systemPrompt)},
  maxTokens: ${maxTokens},
};
generateCode(config, request).then(r => {
  if (r.success) {
    process.stdout.write(JSON.stringify({ ok: true, text: r.code || '' }));
  } else {
    process.stdout.write(JSON.stringify({ ok: false, error: r.error }));
  }
}).catch(e => {
  process.stdout.write(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
});
`;

    fs.writeFileSync(scriptPath, script, { mode: 0o600 });
    try {
      const output = execSync(`node "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, _AG_AI_KEY: aiConfig.apiKey || '' },
      });
      const result = JSON.parse(output);
      if (result && typeof result === 'object' && result.ok) {
        return result.text || null;
      }
      return null;
    } finally {
      try {
        fs.unlinkSync(scriptPath);
      } catch (e: unknown) {
        if (
          e &&
          typeof e === 'object' &&
          (e as NodeJS.ErrnoException).code !== 'ENOENT'
        ) {
          if (process.env.AG_DEBUG) {
            console.debug(`[callAISyncUtil] temp file cleanup failed: ${(e as Error).message}`);
          }
        }
      }
    }
  } catch (err: unknown) {
    if (process.env.AG_DEBUG) {
      console.debug(
        `[callAISyncUtil] AI call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return null;
  }
}
