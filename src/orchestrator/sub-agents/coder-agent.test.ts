/**
 * CoderAgent 테스트
 *
 * CoderAgent의 핵심 기능을 검증합니다:
 * - executeTask (AI 프로바이더 사용/미사용 분기)
 * - buildPrompt (컨텍스트 포함 프롬프트 생성)
 * - saveGeneratedCode (FILE: 마커를 이용한 다중 파일 저장)
 * - 경로 이탈 방지 (프로젝트 경계 밖 쓰기 차단)
 * - 코드 품질 검증
 * - AI 호출 실패 시 에러 핸들링
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');
jest.mock('../ai-provider');
jest.mock('../../utils/ai-sync-caller');
jest.mock('../prompt-enhancer', () => ({
  PromptEnhancer: jest.fn().mockImplementation(() => ({
    enhance: jest.fn().mockReturnValue({
      systemPrompt: 'sys',
      enhancedDescription: 'enhanced description for coder agent testing padded to exceed 120 characters so slice works correctly here and there and more',
      thinkingFramework: '1단계\n2단계\n3단계',
      outputFormat: '',
      qualityChecklist: [],
      fullPrompt: '',
    }),
    expandDescription: jest.fn().mockReturnValue('expanded'),
    buildSystemPrompt: jest.fn().mockReturnValue('system prompt'),
  })),
}));
jest.mock('../shared-knowledge', () => ({
  SharedKnowledgeBase: jest.fn().mockImplementation(() => ({
    addInsight: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    buildContextForAgent: jest.fn().mockReturnValue(''),
  })),
  EventBus: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
    on: jest.fn(),
  })),
  ContextChain: jest.fn().mockImplementation(() => ({
    buildContextForNextPhase: jest.fn().mockReturnValue(''),
    addPhaseResult: jest.fn(),
  })),
}));
jest.mock('../code-gen-v2');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import { CoderAgent } from './coder-agent';
import { SubAgentConfig, Task } from '../types';
import { autoDetectProvider } from '../ai-provider';
import { CodeGenV2, DEFAULT_CODEGEN_V2_CONFIG } from '../code-gen-v2';
import { callAISyncUtil } from '../../utils/ai-sync-caller';

const mockAutoDetect = autoDetectProvider as jest.MockedFunction<typeof autoDetectProvider>;
const mockCallAISyncUtil = callAISyncUtil as jest.MockedFunction<typeof callAISyncUtil>;

// CodeGenV2 mock setup
const mockValidateAndScore = jest.fn();
const mockGetAvailableProviders = jest.fn();
const mockGetConfig = jest.fn();
const mockBuildErrorFeedbackPrompt = jest.fn();
const mockTryLocalFix = jest.fn();
const mockGenerateTestFirst = jest.fn();

(CodeGenV2 as jest.Mock).mockImplementation(() => ({
  validateAndScore: mockValidateAndScore,
  getAvailableProviders: mockGetAvailableProviders,
  getConfig: mockGetConfig,
  buildErrorFeedbackPrompt: mockBuildErrorFeedbackPrompt,
  tryLocalFix: mockTryLocalFix,
  generateTestFirst: mockGenerateTestFirst,
}));

// ─── 테스트 헬퍼 ───

function createCoderConfig(overrides?: Partial<SubAgentConfig>): SubAgentConfig {
  return {
    role: 'coder',
    concurrency: 1,
    maxRetries: 2,
    timeout: 60000,
    ...overrides,
  };
}

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-coder-1',
    phase: 'code',
    title: 'Implement User Auth',
    description: 'Create user authentication module with JWT tokens',
    assignedAgent: 'coder',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PROJECT_PATH = '/tmp/test-project';

// ─── 테스트 시작 ───

describe('CoderAgent', () => {
  let agent: CoderAgent;

  beforeEach(() => {
    jest.clearAllMocks();

    // CodeGenV2 defaults
    mockGetAvailableProviders.mockReturnValue([
      { provider: 'claude', envKey: 'ANTHROPIC_API_KEY', available: false },
      { provider: 'openai', envKey: 'OPENAI_API_KEY', available: false },
      { provider: 'google', envKey: 'GOOGLE_API_KEY', available: false },
    ]);
    mockGetConfig.mockReturnValue({ ...DEFAULT_CODEGEN_V2_CONFIG });
    mockValidateAndScore.mockReturnValue({
      validations: [],
      metrics: { totalLines: 10, maxFunctionLength: 5, hasTypeAnnotations: true, hasErrorHandling: true, hasExports: true, complexityScore: 20, qualityScore: 80 },
      gateResult: { passed: true, reasons: [] },
      overallValid: true,
    });
    mockBuildErrorFeedbackPrompt.mockReturnValue('feedback prompt');
    mockTryLocalFix.mockReturnValue(null);
    mockGenerateTestFirst.mockReturnValue(null);

    // No AI provider by default
    mockAutoDetect.mockReturnValue(null);

    // callAISyncUtil returns null by default (no AI available)
    mockCallAISyncUtil.mockReturnValue(null);

    // fs defaults
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('');
    mockFs.mkdirSync.mockReturnValue(undefined as unknown as string);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.readdirSync.mockReturnValue([]);

    // git branch check
    mockExecSync.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git rev-parse')) {
        return 'feature/test-branch';
      }
      return '';
    });

    agent = new CoderAgent(createCoderConfig());
  });

  // ═══ 기본 동작 ═══

  describe('basic behavior', () => {
    it('should return agent info with correct name and role', () => {
      const info = agent.getInfo();
      expect(info.name).toBe('Coder Agent');
      expect(info.role).toBe('coder');
    });

    it('should have code-related capabilities', () => {
      const info = agent.getInfo();
      expect(info.capabilities).toContain('ai-code-generation');
      expect(info.capabilities).toContain('file-creation');
      expect(info.capabilities).toContain('clean-code-patterns');
      expect(info.capabilities).toContain('solid-principles');
    });
  });

  // ═══ executeTask — AI 프로바이더 없을 때 ═══

  describe('executeTask — no AI provider', () => {
    it('should run in analysis-only mode when no AI provider is available', () => {
      mockAutoDetect.mockReturnValue(null);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('No AI provider configured');
      expect(result.output).toContain('analysis-only mode');
    });

    it('should still check environment and analyze files', () => {
      mockAutoDetect.mockReturnValue(null);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Analyzed');
      expect(result.output).toContain('Source files:');
      expect(result.output).toContain('Test files:');
    });

    it('should detect Node.js project from package.json', () => {
      mockAutoDetect.mockReturnValue(null);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('package.json');
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ name: 'my-app', version: '1.0.0' });
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Node.js project detected');
      expect(result.output).toContain('my-app');
    });

    it('should detect TypeScript configuration', () => {
      mockAutoDetect.mockReturnValue(null);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('tsconfig.json');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('TypeScript configuration found');
    });

    it('should detect git branch', () => {
      mockAutoDetect.mockReturnValue(null);
      mockExecSync.mockReturnValue('main');

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Current branch: main');
    });

    it('should handle non-git directory gracefully', () => {
      mockAutoDetect.mockReturnValue(null);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) {
          throw new Error('Not a git repository');
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Not a git repository');
    });
  });

  // ═══ executeTask — AI 프로바이더 사용 가능 ═══

  describe('executeTask — with AI provider', () => {
    const mockAIConfig = { provider: 'claude' as const, apiKey: 'test-key', model: 'claude-sonnet-4-20250514', maxTokens: 8192 };

    beforeEach(() => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
    });

    it('should attempt AI code generation when provider is available', () => {
      mockCallAISyncUtil.mockReturnValue('export function hello() { return "world"; }');
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) {
          return 'feature/test';
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('AI Provider: claude');
      expect(result.output).toContain('AI Code Generation');
    });

    it('should handle AI call failure gracefully', () => {
      mockCallAISyncUtil.mockReturnValue(null);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('No response from AI');
      expect(result.issues.some((i) => i.message.includes('AI generation returned no response'))).toBe(true);
    });

    it('should handle AI error response', () => {
      // callAISyncUtil returns null when the AI provider returns an error
      mockCallAISyncUtil.mockReturnValue(null);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('No response from AI');
    });

    it('should report AI response received on success', () => {
      mockCallAISyncUtil.mockReturnValue('export const x = 1;');
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('AI response received');
    });
  });

  // ═══ saveGeneratedCode — FILE: 마커 ═══

  describe('saveGeneratedCode — FILE: markers', () => {
    const mockAIConfig = { provider: 'claude' as const, apiKey: 'test-key', model: 'claude-sonnet-4-20250514', maxTokens: 8192 };

    beforeEach(() => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
    });

    it('should save multiple files with FILE: markers', () => {
      const generatedCode = `// FILE: src/auth.ts
export function authenticate() { return true; }

// FILE: src/auth.test.ts
import { authenticate } from './auth';
test('should auth', () => { expect(authenticate()).toBe(true); });`;

      mockCallAISyncUtil.mockReturnValue(generatedCode);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Generated 2 file(s)');
      expect(result.output).toContain('src/auth.ts');
      expect(result.output).toContain('src/auth.test.ts');
    });

    it('should save single file to generated dir when no FILE: markers exist', () => {
      const generatedCode = 'export function hello() { return "world"; }';

      mockCallAISyncUtil.mockReturnValue(generatedCode);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Generated 1 file(s)');
      // Task title "Implement User Auth" -> "implement-user-auth"
      expect(result.artifacts.some((a) => a.includes('implement-user-auth'))).toBe(true);
    });
  });

  // ═══ Path traversal prevention ═══

  describe('path traversal prevention', () => {
    const mockAIConfig = { provider: 'claude' as const, apiKey: 'test-key', model: 'claude-sonnet-4-20250514', maxTokens: 8192 };

    beforeEach(() => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
    });

    it('should block writing files outside project boundary', () => {
      const maliciousCode = `// FILE: ../../etc/passwd
root:x:0:0:root:/root:/bin/bash

// FILE: src/safe-file.ts
export const safe = true;`;

      mockCallAISyncUtil.mockReturnValue(maliciousCode);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      // The traversal path should be blocked
      expect(result.output).toContain('보안 차단');
      // Only safe file should be written
      expect(result.output).toContain('src/safe-file.ts');
    });

    it('should block absolute paths outside project', () => {
      const maliciousCode = `// FILE: /etc/shadow
secret

// FILE: src/ok.ts
export const ok = 1;`;

      mockCallAISyncUtil.mockReturnValue(maliciousCode);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('보안 차단');
    });
  });

  // ═══ 코드 품질 검증 (CodeGenV2) ═══

  describe('code quality validation', () => {
    const mockAIConfig = { provider: 'claude' as const, apiKey: 'test-key', model: 'claude-sonnet-4-20250514', maxTokens: 8192 };

    beforeEach(() => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
    });

    it('should run CodeGenV2 validation on generated artifacts', () => {
      mockCallAISyncUtil.mockReturnValue('// FILE: src/module.ts\nexport function test() { return 1; }');
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      // Make the generated file "exist" for validation
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.includes('src/module.ts')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('src/module.ts')) return 'export function test() { return 1; }';
        return '';
      });

      mockValidateAndScore.mockReturnValue({
        validations: [],
        metrics: { totalLines: 1, maxFunctionLength: 1, hasTypeAnnotations: false, hasErrorHandling: false, hasExports: true, complexityScore: 10, qualityScore: 90 },
        gateResult: { passed: true, reasons: [] },
        overallValid: true,
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('CodeGenV2 Auto-Validation');
      expect(result.output).toContain('품질 점수: 90/100');
      expect(mockValidateAndScore).toHaveBeenCalled();
    });

    it('should report quality gate failure', () => {
      mockCallAISyncUtil.mockReturnValue('// FILE: src/bad.ts\nfunction x() {}');
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('src/bad.ts');
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('src/bad.ts')) return 'function x() {}';
        return '';
      });

      mockValidateAndScore.mockReturnValue({
        validations: [{ valid: false, stage: 'quality', errors: ['No error handling'], warnings: [] }],
        metrics: { totalLines: 1, maxFunctionLength: 1, hasTypeAnnotations: false, hasErrorHandling: false, hasExports: false, complexityScore: 50, qualityScore: 30 },
        gateResult: { passed: false, reasons: ['Quality score 30 below minimum 50'] },
        overallValid: false,
      });

      // Allow the retry loop to proceed (maxAttempts = 3)
      mockGetConfig.mockReturnValue({ ...DEFAULT_CODEGEN_V2_CONFIG, maxAttempts: 1 });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('품질 게이트');
      expect(result.issues.some((i) => i.message.includes('CodeGenV2'))).toBe(true);
    });
  });

  // ═══ 의존성 설치 확인 ═══

  describe('dependency check', () => {
    it('should detect already installed dependencies', () => {
      mockAutoDetect.mockReturnValue(null);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        if (s.endsWith('node_modules')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ name: 'test', version: '1.0.0' });
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Dependencies already installed');
    });

    it('should attempt npm install when node_modules missing', () => {
      mockAutoDetect.mockReturnValue(null);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        if (s.endsWith('node_modules')) return false;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ name: 'test', version: '1.0.0' });
        }
        return '';
      });
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('node_modules not found');
    });

    it('should report error when npm install fails', () => {
      mockAutoDetect.mockReturnValue(null);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        if (s.endsWith('node_modules')) return false;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ name: 'test' });
        }
        return '';
      });
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) {
          throw new Error('npm install failed');
        }
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('Failed to install dependencies'))).toBe(true);
    });
  });

  // ═══ 파일 분석 ═══

  describe('file analysis', () => {
    it('should count source and test files', () => {
      mockAutoDetect.mockReturnValue(null);

      const dirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });

      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        const s = String(p);
        if (s === PROJECT_PATH) {
          return [
            dirent('src', true),
            dirent('package.json', false),
          ] as unknown as fs.Dirent[];
        }
        if (s === path.join(PROJECT_PATH, 'src')) {
          return [
            dirent('app.ts', false),
            dirent('utils.ts', false),
            dirent('app.test.ts', false),
          ] as unknown as fs.Dirent[];
        }
        return [];
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Source files: 2');
      expect(result.output).toContain('Test files: 1');
    });
  });

  // ═══ 임시 스크립트 정리 ═══

  describe('temp file cleanup', () => {
    const mockAIConfig = { provider: 'claude' as const, apiKey: 'test-key', model: 'claude-sonnet-4-20250514', maxTokens: 8192 };

    it('should delegate AI calls to callAISyncUtil', () => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
      mockCallAISyncUtil.mockReturnValue('export const x = 1;');
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      agent.run(createTask(), PROJECT_PATH);

      // callAISyncUtil should have been called (it handles temp file lifecycle internally)
      expect(mockCallAISyncUtil).toHaveBeenCalled();
    });

    it('should handle callAISyncUtil returning null without crashing', () => {
      mockAutoDetect.mockReturnValue(mockAIConfig);
      mockCallAISyncUtil.mockReturnValue(null);
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('git')) return 'main';
        return '';
      });

      // Should not throw
      const result = agent.run(createTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ TDD 모드 ═══

  describe('TDD mode', () => {
    it('should generate test skeleton when TDD mode is enabled', () => {
      mockAutoDetect.mockReturnValue(null);
      mockGetConfig.mockReturnValue({ ...DEFAULT_CODEGEN_V2_CONFIG, tddMode: true });
      mockGenerateTestFirst.mockReturnValue('describe("test", () => { it("works", () => {}); });');
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('tsconfig.json')) return true;
        return false;
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('TDD: Test-First Pipeline');
      expect(mockGenerateTestFirst).toHaveBeenCalled();
    });
  });

  // ═══ success 판정 ═══

  describe('success determination', () => {
    it('should succeed when no critical issues exist', () => {
      mockAutoDetect.mockReturnValue(null);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.success).toBe(true);
    });

    it('should include prompt enhancement info', () => {
      mockAutoDetect.mockReturnValue(null);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Prompt Enhancement Applied');
    });
  });
});
