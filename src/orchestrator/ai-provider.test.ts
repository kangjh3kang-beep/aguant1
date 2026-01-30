import { extractCode, loadAPIKeysFromEnv, autoDetectProvider } from './ai-provider';

describe('ai-provider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('extractCode', () => {
    it('should extract code from markdown code blocks', () => {
      const text = 'Here is the code:\n```typescript\nconst x = 1;\n```\nDone.';
      expect(extractCode(text).trim()).toBe('const x = 1;');
    });

    it('should extract multiple code blocks', () => {
      const text = '```ts\nconst a = 1;\n```\nand\n```ts\nconst b = 2;\n```';
      expect(extractCode(text)).toContain('const a = 1;');
      expect(extractCode(text)).toContain('const b = 2;');
    });

    it('should return raw text when no code blocks', () => {
      const text = 'const x = 1;';
      expect(extractCode(text)).toBe('const x = 1;');
    });

    it('should handle code blocks without language tag', () => {
      const text = '```\nconst x = 1;\n```';
      expect(extractCode(text).trim()).toBe('const x = 1;');
    });
  });

  describe('loadAPIKeysFromEnv', () => {
    it('should return undefined when no env vars set', () => {
      const keys = loadAPIKeysFromEnv();
      expect(keys.anthropic).toBeUndefined();
      expect(keys.openai).toBeUndefined();
      expect(keys.google).toBeUndefined();
    });

    it('should load ANTHROPIC_API_KEY', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const keys = loadAPIKeysFromEnv();
      expect(keys.anthropic).toBe('test-key');
    });

    it('should load OPENAI_API_KEY', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const keys = loadAPIKeysFromEnv();
      expect(keys.openai).toBe('test-key');
    });

    it('should load GOOGLE_API_KEY', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      const keys = loadAPIKeysFromEnv();
      expect(keys.google).toBe('test-key');
    });
  });

  describe('autoDetectProvider', () => {
    it('should return null when no keys set', () => {
      expect(autoDetectProvider()).toBeNull();
    });

    it('should prefer Anthropic when available', () => {
      process.env.ANTHROPIC_API_KEY = 'test-anthropic';
      process.env.OPENAI_API_KEY = 'test-openai';
      const config = autoDetectProvider();
      expect(config?.provider).toBe('claude');
    });

    it('should fall back to OpenAI', () => {
      process.env.OPENAI_API_KEY = 'test-openai';
      const config = autoDetectProvider();
      expect(config?.provider).toBe('openai');
      expect(config?.model).toBe('gpt-4o');
    });

    it('should fall back to Google', () => {
      process.env.GOOGLE_API_KEY = 'test-google';
      const config = autoDetectProvider();
      expect(config?.provider).toBe('custom');
      expect(config?.model).toBe('gemini-2.0-flash');
    });
  });
});
