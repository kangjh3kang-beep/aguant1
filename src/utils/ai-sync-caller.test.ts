/**
 * Tests for utils/ai-sync-caller.ts
 */

jest.mock('fs');
jest.mock('child_process');

import fs from 'fs';
import { execSync } from 'child_process';
import { callAISyncUtil, AISyncCallOptions } from './ai-sync-caller';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('ai-sync-caller', () => {
  const baseOptions: AISyncCallOptions = {
    aiConfig: { provider: 'openai', model: 'gpt-4', apiKey: 'test-key-123' },
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: 'Write a hello world function.',
    maxTokens: 2048,
    timeout: 60000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (mockFs.existsSync as jest.Mock).mockReturnValue(true);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {});
    (mockFs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
    (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {});
  });

  describe('successful calls', () => {
    it('returns AI response text on success', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'function hello() { return "Hello"; }' }));

      const result = callAISyncUtil(baseOptions);
      expect(result).toBe('function hello() { return "Hello"; }');
    });

    it('creates temp directory if it does not exist', () => {
      (mockFs.existsSync as jest.Mock).mockReturnValueOnce(false);
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('.ag-review-ai'), { recursive: true });
    });

    it('writes temp script with mode 0o600', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('_ai_sync_'),
        expect.any(String),
        { mode: 0o600 },
      );
    });

    it('does NOT include API key in the script content', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      const scriptContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
      expect(scriptContent).not.toContain('test-key-123');
      expect(scriptContent).toContain('process.env._AG_AI_KEY');
    });

    it('passes API key via environment variable', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('node'),
        expect.objectContaining({
          env: expect.objectContaining({ _AG_AI_KEY: 'test-key-123' }),
        }),
      );
    });

    it('uses default maxTokens (4096) when not specified', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil({ ...baseOptions, maxTokens: undefined });
      const scriptContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
      expect(scriptContent).toContain('maxTokens: 4096');
    });

    it('uses default timeout (120000) when not specified', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil({ ...baseOptions, timeout: undefined });
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ timeout: 120000 }),
      );
    });
  });

  describe('failure cases', () => {
    it('returns null when AI call fails', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: false, error: 'rate limit' }));

      const result = callAISyncUtil(baseOptions);
      expect(result).toBeNull();
    });

    it('returns null when execSync throws', () => {
      mockExecSync.mockImplementationOnce(() => { throw new Error('timeout'); });

      const result = callAISyncUtil(baseOptions);
      expect(result).toBeNull();
    });

    it('returns null when JSON parse fails', () => {
      mockExecSync.mockReturnValueOnce('not json');

      const result = callAISyncUtil(baseOptions);
      expect(result).toBeNull();
    });

    it('returns null when response text is empty', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: '' }));

      const result = callAISyncUtil(baseOptions);
      expect(result).toBeNull();
    });

    it('handles missing apiKey gracefully', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      const opts = { ...baseOptions, aiConfig: { provider: 'openai' } };
      const result = callAISyncUtil(opts);
      expect(result).toBe('ok');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          env: expect.objectContaining({ _AG_AI_KEY: '' }),
        }),
      );
    });
  });

  describe('cleanup', () => {
    it('cleans up temp file after success', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('_ai_sync_'));
    });

    it('cleans up temp file after failure', () => {
      mockExecSync.mockImplementationOnce(() => { throw new Error('fail'); });

      callAISyncUtil(baseOptions);
      expect(mockFs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('_ai_sync_'));
    });

    it('ignores ENOENT during cleanup', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));
      (mockFs.unlinkSync as jest.Mock).mockImplementationOnce(() => {
        const err: NodeJS.ErrnoException = new Error('not found');
        err.code = 'ENOENT';
        throw err;
      });

      // Should not throw
      const result = callAISyncUtil(baseOptions);
      expect(result).toBe('ok');
    });

    it('logs debug on non-ENOENT cleanup failure', () => {
      const debugSpy = jest.spyOn(console, 'debug').mockImplementation();
      process.env.AG_DEBUG = '1';
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));
      (mockFs.unlinkSync as jest.Mock).mockImplementationOnce(() => {
        const err: NodeJS.ErrnoException = new Error('permission denied');
        err.code = 'EPERM';
        throw err;
      });

      callAISyncUtil(baseOptions);
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('temp file cleanup failed'));

      delete process.env.AG_DEBUG;
      debugSpy.mockRestore();
    });
  });

  describe('script content', () => {
    it('includes provider config in script', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      const scriptContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
      expect(scriptContent).toContain('"provider":"openai"');
      expect(scriptContent).toContain('"model":"gpt-4"');
    });

    it('includes user prompt in script', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      const scriptContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
      expect(scriptContent).toContain('Write a hello world function.');
    });

    it('includes system prompt in script', () => {
      mockExecSync.mockReturnValueOnce(JSON.stringify({ ok: true, text: 'ok' }));

      callAISyncUtil(baseOptions);
      const scriptContent = (mockFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
      expect(scriptContent).toContain('You are a helpful assistant.');
    });
  });
});
