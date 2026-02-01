/**
 * CodeGenV2 — 코드 생성 자동 검증 + TDD 파이프라인 테스트
 *
 * 대상 클래스:
 *   CodeValidator, FallbackChain, TestFirstPipeline, CodeQualityGate, CodeGenV2
 */

import fs from 'fs';
import { execSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import {
  CodeValidator,
  FallbackChain,
  TestFirstPipeline,
  CodeQualityGate,
  CodeGenV2,
  QualityMetrics,
  DEFAULT_CODEGEN_V2_CONFIG,
} from './code-gen-v2';

// ─── CodeValidator ──────────────────────────────────────────

describe('CodeValidator', () => {
  let validator: CodeValidator;
  const projectPath = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.unlinkSync.mockReturnValue(undefined);
    validator = new CodeValidator(projectPath);
  });

  describe('validate', () => {
    it('should return validation results including syntax, compile, lint, and quality for .ts files', () => {
      // tsc succeeds (no error thrown)
      (mockExecSync as jest.Mock).mockReturnValue('');

      const code = `export function greet(name: string): string {\n  return 'Hello ' + name;\n}\n`;
      const results = validator.validate(code, 'src/greeting.ts');

      // For a .ts file: syntax + compile + lint + quality = 4 results
      expect(results).toHaveLength(4);
      expect(results.map((r) => r.stage)).toEqual(['syntax', 'compile', 'lint', 'quality']);
    });

    it('should return 3 results (no compile) for .js files', () => {
      const code = `function greet(name) {\n  return 'Hello ' + name;\n}\n`;
      const results = validator.validate(code, 'src/greeting.js');

      // For a .js file: syntax + lint + quality = 3 results
      expect(results).toHaveLength(3);
      expect(results.map((r) => r.stage)).toEqual(['syntax', 'lint', 'quality']);
    });
  });

  describe('validateSyntax (via validate)', () => {
    it('should detect bracket mismatch', () => {
      const code = `function test() {\n  if (true {\n    return 1;\n  }\n}\n`;
      const results = validator.validate(code, 'src/test.js');
      const syntax = results.find((r) => r.stage === 'syntax')!;

      expect(syntax.valid).toBe(false);
      expect(syntax.errors.length).toBeGreaterThan(0);
      expect(syntax.errors[0]).toContain('괄호 불일치');
    });

    it('should flag empty code as invalid', () => {
      const code = '   \n  \n';
      const results = validator.validate(code, 'src/empty.js');
      const syntax = results.find((r) => r.stage === 'syntax')!;

      expect(syntax.valid).toBe(false);
      expect(syntax.errors).toContain('빈 코드가 생성됨');
    });

    it('should warn on lines exceeding 300 characters', () => {
      const longLine = 'x'.repeat(350);
      const code = `const val = "${longLine}";\n`;
      const results = validator.validate(code, 'src/long.js');
      const syntax = results.find((r) => r.stage === 'syntax')!;

      expect(syntax.valid).toBe(true); // warnings don't make it invalid
      expect(syntax.warnings.length).toBeGreaterThan(0);
      expect(syntax.warnings[0]).toContain('300자 초과');
    });

    it('should pass for well-formed code', () => {
      const code = `const x = [1, 2, 3];\nconst y = { a: (x) => x };\n`;
      const results = validator.validate(code, 'src/ok.js');
      const syntax = results.find((r) => r.stage === 'syntax')!;

      expect(syntax.valid).toBe(true);
      expect(syntax.errors).toHaveLength(0);
    });
  });

  describe('validateTypeScript (via validate)', () => {
    it('should pass when tsc succeeds', () => {
      (mockExecSync as jest.Mock).mockReturnValue('');

      const code = `export const x: number = 1;\n`;
      const results = validator.validate(code, 'src/good.ts');
      const compile = results.find((r) => r.stage === 'compile')!;

      expect(compile.valid).toBe(true);
      expect(compile.errors).toHaveLength(0);
    });

    it('should capture TypeScript compilation errors', () => {
      const tscError = new Error('tsc failed') as Error & { stdout: string };
      tscError.stdout = 'src/bad.ts(3,5): error TS2322: Type "string" not assignable to type "number"\nsrc/bad.ts(7,1): error TS1005: Expected semicolon';
      mockExecSync.mockImplementation(() => {
        throw tscError;
      });

      const code = `export const x: number = "hello";\n`;
      const results = validator.validate(code, 'src/bad.ts');
      const compile = results.find((r) => r.stage === 'compile')!;

      expect(compile.valid).toBe(false);
      expect(compile.errors.length).toBe(2);
      expect(compile.errors[0]).toContain('error TS2322');
    });

    it('should issue warning when tsc is not available', () => {
      const execError = new Error('command not found: npx');
      mockExecSync.mockImplementation(() => {
        throw execError;
      });

      const code = `export const y = 2;\n`;
      const results = validator.validate(code, 'src/test.ts');
      const compile = results.find((r) => r.stage === 'compile')!;

      expect(compile.valid).toBe(true); // no TS errors, just a warning
      expect(compile.warnings.length).toBeGreaterThan(0);
      expect(compile.warnings[0]).toContain('수행할 수 없음');
    });

    it('should handle temp directory creation failure gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const code = `export const z = 3;\n`;
      const results = validator.validate(code, 'src/perm.ts');
      const compile = results.find((r) => r.stage === 'compile')!;

      expect(compile.valid).toBe(true); // outer catch -> warning, no errors
      expect(compile.warnings).toContain('TypeScript 검증 환경 설정 실패');
    });
  });

  describe('validateLint (via validate)', () => {
    it('should detect hardcoded secrets', () => {
      const code = `const password = "SuperSecret123!";\nmodule.exports = { password };\n`;
      const results = validator.validate(code, 'src/config.js');
      const lint = results.find((r) => r.stage === 'lint')!;

      expect(lint.valid).toBe(false);
      expect(lint.errors.some((e) => e.includes('시크릿'))).toBe(true);
    });

    it('should detect eval() usage', () => {
      const code = `const result = eval("2+2");\n`;
      const results = validator.validate(code, 'src/danger.js');
      const lint = results.find((r) => r.stage === 'lint')!;

      expect(lint.valid).toBe(false);
      expect(lint.errors.some((e) => e.includes('eval()'))).toBe(true);
    });

    it('should warn when console.log is used more than 3 times in non-test code', () => {
      const code = `console.log("a");\nconsole.log("b");\nconsole.log("c");\nconsole.log("d");\n`;
      const results = validator.validate(code, 'src/app.js');
      const lint = results.find((r) => r.stage === 'lint')!;

      expect(lint.valid).toBe(true); // warnings only
      expect(lint.warnings.some((w) => w.includes('console.log'))).toBe(true);
    });

    it('should not warn about console.log in test files', () => {
      const code = `console.log("a");\nconsole.log("b");\nconsole.log("c");\nconsole.log("d");\n`;
      const results = validator.validate(code, 'src/app.test.js');
      const lint = results.find((r) => r.stage === 'lint')!;

      expect(lint.warnings.filter((w) => w.includes('console.log'))).toHaveLength(0);
    });

    it('should warn on any type usage', () => {
      const code = `function parse(data: any): any {\n  return data;\n}\n`;
      const results = validator.validate(code, 'src/parser.js');
      const lint = results.find((r) => r.stage === 'lint')!;

      expect(lint.warnings.some((w) => w.includes("'any'"))).toBe(true);
    });
  });

  describe('measureQuality', () => {
    it('should return correct metrics for well-structured code', () => {
      const code = [
        'export interface Config { port: number; }',
        '',
        'export function start(config: Config): void {',
        '  try {',
        '    console.log("starting");',
        '  } catch (err: unknown) {',
        '    throw new Error("failed");',
        '  }',
        '}',
      ].join('\n');

      const metrics = validator.measureQuality(code);

      expect(metrics.totalLines).toBe(9);
      expect(metrics.hasTypeAnnotations).toBe(true);
      expect(metrics.hasErrorHandling).toBe(true);
      expect(metrics.hasExports).toBe(true);
      expect(metrics.qualityScore).toBeGreaterThanOrEqual(70);
    });

    it('should penalize code without type annotations or error handling', () => {
      const code = 'function add(a, b) {\n  return a + b;\n}\n';
      const metrics = validator.measureQuality(code);

      expect(metrics.hasTypeAnnotations).toBe(false);
      expect(metrics.hasErrorHandling).toBe(false);
      expect(metrics.hasExports).toBe(false);
      // Base 70 + 10 (short func) - no bonuses = 80, but no type annotations or error handling
      expect(metrics.qualityScore).toBeLessThanOrEqual(80);
    });
  });
});

// ─── FallbackChain ──────────────────────────────────────────

describe('FallbackChain', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create a fresh copy of env for each test
    process.env = { ...originalEnv };
    // Clear all API keys by default
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should list providers in specified order with availability', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const chain = new FallbackChain(['claude', 'openai', 'google']);
    const providers = chain.getAvailableProviders();

    expect(providers).toHaveLength(3);
    expect(providers[0]).toEqual({ provider: 'claude', envKey: 'ANTHROPIC_API_KEY', available: true });
    expect(providers[1]).toEqual({ provider: 'openai', envKey: 'OPENAI_API_KEY', available: false });
    expect(providers[2]).toEqual({ provider: 'google', envKey: 'GOOGLE_API_KEY', available: false });
  });

  it('should return first available provider from getNextProvider', () => {
    process.env.OPENAI_API_KEY = 'sk-openai';
    const chain = new FallbackChain(['claude', 'openai', 'google']);

    expect(chain.getNextProvider()).toBe('openai');
  });

  it('should return null from getNextProvider when no provider is available', () => {
    const chain = new FallbackChain(['claude', 'openai', 'google']);
    expect(chain.getNextProvider()).toBeNull();
  });

  it('should exclude specified providers from getNextProvider', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-claude';
    process.env.OPENAI_API_KEY = 'sk-openai';
    const chain = new FallbackChain(['claude', 'openai']);

    expect(chain.getNextProvider(['claude'])).toBe('openai');
  });

  describe('generateLocalFix', () => {
    it('should add missing import when error is "Cannot find module"', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('const x = 1;\n');

      const chain = new FallbackChain();
      const result = chain.generateLocalFix(
        "Cannot find module 'lodash'",
        'src/app.ts',
        '/project',
      );

      expect(result).not.toBeNull();
      expect(result).toContain("import lodash from 'lodash'");
    });

    it('should return null when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const chain = new FallbackChain();
      const result = chain.generateLocalFix(
        "Cannot find module 'foo'",
        'src/missing.ts',
        '/project',
      );

      expect(result).toBeNull();
    });

    it('should return null for unrecognized error messages', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as jest.Mock).mockReturnValue('const x = 1;\n');

      const chain = new FallbackChain();
      const result = chain.generateLocalFix(
        'Some unknown error occurred',
        'src/app.ts',
        '/project',
      );

      expect(result).toBeNull();
    });

    it('should handle file read errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const chain = new FallbackChain();
      const result = chain.generateLocalFix(
        "Cannot find module 'fs'",
        'src/app.ts',
        '/project',
      );

      expect(result).toBeNull();
    });
  });
});

// ─── TestFirstPipeline ──────────────────────────────────────

describe('TestFirstPipeline', () => {
  let pipeline: TestFirstPipeline;

  beforeEach(() => {
    pipeline = new TestFirstPipeline();
  });

  it('should generate Jest skeleton for typescript', () => {
    const result = pipeline.generateTestSkeleton('My Feature', 'Create a new feature', 'typescript');

    expect(result).toContain("describe('My Feature'");
    expect(result).toContain("it('should handle normal input correctly'");
    expect(result).toContain("it('should handle empty input'");
    expect(result).toContain('expect(true).toBe(true)');
    expect(result).toContain("it('should create new item successfully'");
  });

  it('should generate pytest skeleton for python', () => {
    const result = pipeline.generateTestSkeleton('Auth Service', 'Login and validate token', 'python');

    expect(result).toContain('import pytest');
    expect(result).toContain('def test_');
    expect(result).toContain('assert True');
    // "Login" -> auth keyword match
    expect(result).toContain('should authenticate valid credentials');
    // "validate" -> valid keyword match
    expect(result).toContain('should validate correct format');
  });

  it('should infer error-related test cases', () => {
    const result = pipeline.generateTestSkeleton('Error Handler', 'Handle error and exception gracefully', 'javascript');

    expect(result).toContain('should throw error on invalid input');
    expect(result).toContain('should handle error gracefully');
  });

  it('should infer CRUD test cases from description', () => {
    const result = pipeline.generateTestSkeleton('CRUD API', 'Create, read, update and delete records', 'typescript');

    expect(result).toContain('should create new item successfully');
    expect(result).toContain('should return correct data');
    expect(result).toContain('should update existing item');
    expect(result).toContain('should delete existing item');
  });

  it('should default to Jest skeleton for unknown language', () => {
    const result = pipeline.generateTestSkeleton('Unknown', 'A simple task', 'ruby');

    // Falls through to default which is Jest
    expect(result).toContain("describe('Unknown'");
    expect(result).toContain("it('");
  });
});

// ─── CodeQualityGate ────────────────────────────────────────

describe('CodeQualityGate', () => {
  it('should pass for metrics meeting all criteria', () => {
    const gate = new CodeQualityGate(50, 50);
    const metrics: QualityMetrics = {
      totalLines: 100,
      maxFunctionLength: 30,
      hasTypeAnnotations: true,
      hasErrorHandling: true,
      hasExports: true,
      complexityScore: 25,
      qualityScore: 85,
    };

    const result = gate.check(metrics);
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it('should fail for quality score below minimum', () => {
    const gate = new CodeQualityGate(60, 50);
    const metrics: QualityMetrics = {
      totalLines: 10,
      maxFunctionLength: 10,
      hasTypeAnnotations: true,
      hasErrorHandling: true,
      hasExports: true,
      complexityScore: 10,
      qualityScore: 40,
    };

    const result = gate.check(metrics);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('품질 점수'))).toBe(true);
  });

  it('should fail for function length exceeding limit', () => {
    const gate = new CodeQualityGate(50, 30);
    const metrics: QualityMetrics = {
      totalLines: 100,
      maxFunctionLength: 60,
      hasTypeAnnotations: true,
      hasErrorHandling: true,
      hasExports: true,
      complexityScore: 25,
      qualityScore: 70,
    };

    const result = gate.check(metrics);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('함수 길이'))).toBe(true);
  });

  it('should fail for missing type annotations', () => {
    const gate = new CodeQualityGate(50, 50);
    const metrics: QualityMetrics = {
      totalLines: 10,
      maxFunctionLength: 5,
      hasTypeAnnotations: false,
      hasErrorHandling: true,
      hasExports: true,
      complexityScore: 10,
      qualityScore: 70,
    };

    const result = gate.check(metrics);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('타입 어노테이션'))).toBe(true);
  });

  it('should fail for empty code (totalLines === 0)', () => {
    const gate = new CodeQualityGate(50, 50);
    const metrics: QualityMetrics = {
      totalLines: 0,
      maxFunctionLength: 0,
      hasTypeAnnotations: false,
      hasErrorHandling: false,
      hasExports: false,
      complexityScore: 0,
      qualityScore: 70,
    };

    const result = gate.check(metrics);
    expect(result.passed).toBe(false);
    expect(result.reasons.some((r) => r.includes('빈 코드'))).toBe(true);
  });
});

// ─── CodeGenV2 (통합 클래스) ────────────────────────────────

describe('CodeGenV2', () => {
  const projectPath = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.unlinkSync.mockReturnValue(undefined);
    (mockExecSync as jest.Mock).mockReturnValue('');
  });

  it('should use default config when none provided', () => {
    const gen = new CodeGenV2(projectPath);
    const config = gen.getConfig();

    expect(config).toEqual(DEFAULT_CODEGEN_V2_CONFIG);
  });

  it('should merge partial config with defaults', () => {
    const gen = new CodeGenV2(projectPath, { tddMode: true, maxAttempts: 5 });
    const config = gen.getConfig();

    expect(config.tddMode).toBe(true);
    expect(config.maxAttempts).toBe(5);
    expect(config.minQualityScore).toBe(DEFAULT_CODEGEN_V2_CONFIG.minQualityScore);
  });

  describe('validateAndScore', () => {
    it('should return overallValid=true for valid high-quality code', () => {
      const gen = new CodeGenV2(projectPath, { minQualityScore: 50, maxFunctionLength: 50 });
      const code = [
        'export interface Item { id: number; name: string; }',
        '',
        'export function createItem(name: string): Item {',
        '  try {',
        '    return { id: Date.now(), name };',
        '  } catch (err: unknown) {',
        '    throw new Error("creation failed");',
        '  }',
        '}',
      ].join('\n');

      const result = gen.validateAndScore(code, 'src/item.ts');

      expect(result.validations.length).toBe(4); // syntax + compile + lint + quality
      expect(result.metrics.hasTypeAnnotations).toBe(true);
      expect(result.metrics.hasExports).toBe(true);
      expect(result.gateResult).toBeDefined();
      expect(result.overallValid).toBe(true);
    });

    it('should return overallValid=false for code with bracket mismatch', () => {
      const gen = new CodeGenV2(projectPath);
      const code = 'export function broken() {\n  if (true {\n  }\n';

      const result = gen.validateAndScore(code, 'src/broken.ts');

      expect(result.overallValid).toBe(false);
      const syntaxResult = result.validations.find((v) => v.stage === 'syntax');
      expect(syntaxResult?.valid).toBe(false);
    });
  });

  describe('generateTestFirst', () => {
    it('should delegate to TestFirstPipeline and return skeleton', () => {
      const gen = new CodeGenV2(projectPath, { tddMode: true });
      const skeleton = gen.generateTestFirst('User API', 'Create and fetch users', 'typescript');

      expect(skeleton).toContain("describe('User API'");
      expect(skeleton).toContain('should create new item successfully');
      expect(skeleton).toContain('should return correct data');
    });
  });

  describe('buildErrorFeedbackPrompt', () => {
    it('should include error details and attempt number in the prompt', () => {
      const gen = new CodeGenV2(projectPath);
      const validations = [
        {
          valid: false,
          stage: 'lint' as const,
          errors: ['eval() 사용 감지 — 보안 위험'],
          warnings: [],
        },
        {
          valid: true,
          stage: 'syntax' as const,
          errors: [],
          warnings: ['1줄이 300자 초과 (310자)'],
        },
      ];

      const result = gen.buildErrorFeedbackPrompt('Write safe code', validations, 2);

      expect(result).toContain('Write safe code');
      expect(result).toContain('attempt 2');
      expect(result).toContain('LINT ERRORS');
      expect(result).toContain('eval()');
      expect(result).toContain('SYNTAX WARNINGS');
      expect(result).toContain('300자 초과');
    });
  });
});
