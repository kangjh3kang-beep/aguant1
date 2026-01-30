/**
 * AI Provider Client - Claude, OpenAI, Google AI API 통합 클라이언트
 *
 * API 키는 환경변수에서 로드합니다:
 *   ANTHROPIC_API_KEY - Claude API
 *   OPENAI_API_KEY    - OpenAI API
 *   GOOGLE_API_KEY    - Google Gemini API
 *
 * 절대로 API 키를 소스코드에 하드코딩하지 마세요!
 */

import https from 'https';
import { AIProviderConfig } from './types';

export interface AICodeRequest {
  /** 코드 생성 프롬프트 */
  prompt: string;
  /** 시스템 프롬프트 (역할 설정) */
  systemPrompt?: string;
  /** 기존 코드 컨텍스트 */
  context?: string;
  /** 사용할 언어 */
  language?: string;
  /** 최대 토큰 수 */
  maxTokens?: number;
}

export interface AICodeResponse {
  success: boolean;
  code: string;
  explanation?: string;
  error?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

/**
 * 환경변수에서 API 키를 안전하게 로드합니다.
 */
export function loadAPIKeysFromEnv(): { anthropic?: string; openai?: string; google?: string } {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
  };
}

/**
 * AI 프로바이더 설정을 환경변수에서 자동 감지합니다.
 */
export function autoDetectProvider(): AIProviderConfig | null {
  const keys = loadAPIKeysFromEnv();

  if (keys.anthropic) {
    return { provider: 'claude', apiKey: keys.anthropic, model: 'claude-sonnet-4-20250514', maxTokens: 8192 };
  }
  if (keys.openai) {
    return { provider: 'openai', apiKey: keys.openai, model: 'gpt-4o', maxTokens: 8192 };
  }
  if (keys.google) {
    return { provider: 'custom', apiKey: keys.google, model: 'gemini-2.0-flash', endpoint: 'https://generativelanguage.googleapis.com', maxTokens: 8192 };
  }

  return null;
}

/**
 * AI 프로바이더를 통해 코드를 생성합니다.
 */
export async function generateCode(config: AIProviderConfig, request: AICodeRequest): Promise<AICodeResponse> {
  const apiKey = config.apiKey || loadAPIKeysFromEnv()[config.provider === 'claude' ? 'anthropic' : config.provider === 'openai' ? 'openai' : 'google'];

  if (!apiKey) {
    return {
      success: false,
      code: '',
      error: `API key not found. Set environment variable: ${getEnvVarName(config.provider)}`,
      provider: config.provider,
      model: config.model || 'unknown',
    };
  }

  switch (config.provider) {
    case 'claude':
      return callClaudeAPI(apiKey, config, request);
    case 'openai':
      return callOpenAIAPI(apiKey, config, request);
    case 'custom':
      if (config.endpoint?.includes('generativelanguage.googleapis.com')) {
        return callGoogleAPI(apiKey, config, request);
      }
      return { success: false, code: '', error: 'Unknown custom provider', provider: config.provider, model: config.model || 'unknown' };
    default:
      return { success: false, code: '', error: `Unsupported provider: ${config.provider}`, provider: config.provider, model: config.model || 'unknown' };
  }
}

function getEnvVarName(provider: string): string {
  switch (provider) {
    case 'claude': return 'ANTHROPIC_API_KEY';
    case 'openai': return 'OPENAI_API_KEY';
    default: return 'GOOGLE_API_KEY';
  }
}

const DEFAULT_SYSTEM_PROMPT = `You are a 10x Senior Full-Stack Developer with 15+ years of experience at top-tier companies.
You write production-grade, battle-tested code that ships to millions of users.

## Core Principles
- Write code for humans first, machines second
- Make it work → Make it right → Make it fast (Kent Beck)
- Leave the codebase better than you found it (Boy Scout Rule)

## Mandatory Standards
- TypeScript strict mode: no any, no non-null assertion
- Clean Code: functions under 20 lines, meaningful names, no magic numbers
- SOLID principles: Single Responsibility, Open-Closed, Liskov, Interface Segregation, DI
- Error handling: typed errors, contextual messages, async error handling
- Security: input validation, no hardcoded secrets, injection prevention
- Performance: O(n) preferred, avoid unnecessary copies, use Map/Set

## Output Rules
- Return ONLY the code, no explanations outside code blocks
- Include proper TypeScript types and interfaces
- Add JSDoc for public APIs only
- Include error handling for all failure paths`;

// ─── Claude API ──────────────────────────────────────────

async function callClaudeAPI(apiKey: string, config: AIProviderConfig, request: AICodeRequest): Promise<AICodeResponse> {
  const model = config.model || 'claude-sonnet-4-20250514';
  const maxTokens = request.maxTokens || config.maxTokens || 8192;

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    system: request.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildPrompt(request),
      },
    ],
  });

  const result = await httpPost('api.anthropic.com', '/v1/messages', body, {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  });

  try {
    const data = JSON.parse(result);
    if (data.error) {
      return { success: false, code: '', error: data.error.message, provider: 'claude', model };
    }
    const text = data.content?.[0]?.text || '';
    const code = extractCode(text);
    return {
      success: true,
      code,
      explanation: text.replace(/```[\s\S]*?```/g, '').trim() || undefined,
      provider: 'claude',
      model,
      tokensUsed: data.usage?.output_tokens,
    };
  } catch (err: unknown) {
    return { success: false, code: '', error: `Parse error: ${err instanceof Error ? err.message : String(err)}`, provider: 'claude', model };
  }
}

// ─── OpenAI API ──────────────────────────────────────────

async function callOpenAIAPI(apiKey: string, config: AIProviderConfig, request: AICodeRequest): Promise<AICodeResponse> {
  const model = config.model || 'gpt-4o';
  const maxTokens = request.maxTokens || config.maxTokens || 8192;

  const body = JSON.stringify({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: request.systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(request) },
    ],
  });

  const result = await httpPost('api.openai.com', '/v1/chat/completions', body, {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  });

  try {
    const data = JSON.parse(result);
    if (data.error) {
      return { success: false, code: '', error: data.error.message, provider: 'openai', model };
    }
    const text = data.choices?.[0]?.message?.content || '';
    const code = extractCode(text);
    return {
      success: true,
      code,
      explanation: text.replace(/```[\s\S]*?```/g, '').trim() || undefined,
      provider: 'openai',
      model,
      tokensUsed: data.usage?.completion_tokens,
    };
  } catch (err: unknown) {
    return { success: false, code: '', error: `Parse error: ${err instanceof Error ? err.message : String(err)}`, provider: 'openai', model };
  }
}

// ─── Google Gemini API ───────────────────────────────────

async function callGoogleAPI(apiKey: string, config: AIProviderConfig, request: AICodeRequest): Promise<AICodeResponse> {
  const model = config.model || 'gemini-2.0-flash';
  const endpoint = `/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: `${request.systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\n${buildPrompt(request)}` },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: request.maxTokens || config.maxTokens || 8192,
    },
  });

  const result = await httpPost('generativelanguage.googleapis.com', endpoint, body, {
    'Content-Type': 'application/json',
  });

  try {
    const data = JSON.parse(result);
    if (data.error) {
      return { success: false, code: '', error: data.error.message, provider: 'google', model };
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const code = extractCode(text);
    return {
      success: true,
      code,
      explanation: text.replace(/```[\s\S]*?```/g, '').trim() || undefined,
      provider: 'google',
      model,
      tokensUsed: data.usageMetadata?.candidatesTokenCount,
    };
  } catch (err: unknown) {
    return { success: false, code: '', error: `Parse error: ${err instanceof Error ? err.message : String(err)}`, provider: 'google', model };
  }
}

// ─── 유틸리티 ────────────────────────────────────────────

function buildPrompt(request: AICodeRequest): string {
  const parts: string[] = [];

  if (request.language) {
    parts.push(`Language: ${request.language}`);
  }
  if (request.context) {
    parts.push(`Existing code context:\n\`\`\`\n${request.context}\n\`\`\``);
  }
  parts.push(request.prompt);

  return parts.join('\n\n');
}

/**
 * AI 응답에서 코드 블록을 추출합니다.
 */
export function extractCode(text: string): string {
  // ```lang ... ``` 패턴
  const codeBlocks = text.match(/```(?:\w+)?\n([\s\S]*?)```/g);
  if (codeBlocks && codeBlocks.length > 0) {
    return codeBlocks.map((block) => block.replace(/```(?:\w+)?\n?/g, '').replace(/```$/g, '')).join('\n\n');
  }
  // 코드 블록이 없으면 전체 텍스트 반환
  return text.trim();
}

function httpPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(120000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}
