/**
 * ReviewerAgent Tests
 *
 * Covers:
 *  - Basic behavior (getInfo, capabilities)
 *  - executeTask via run() — prompt enhancement, CodeReviewAgent delegation
 *  - Code smell detection (console.log, any, empty catch, etc.)
 *  - Code smell auto-fix via CodeTransformer
 *  - AI code review (with/without provider)
 *  - Complexity analysis (large files, long functions)
 *  - SharedKnowledge integration
 *  - Success/failure determination
 *  - Report artifacts (learning insights, fix report, prompt enhancement)
 */

import fs from 'fs';
import path from 'path';

jest.mock('fs');
jest.mock('child_process');
jest.mock('../prompt-enhancer', () => ({
  PromptEnhancer: jest.fn().mockImplementation(() => ({
    enhance: jest.fn().mockReturnValue({
      systemPrompt: 'sys',
      enhancedDescription: 'enhanced description for reviewer agent testing padded to exceed 120 characters so slice works correctly here and there and more',
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

// Mock CodeReviewAgent and formatReportAsText
const mockRun = jest.fn();
const mockGetTrendReport = jest.fn().mockReturnValue('Trend: stable');
jest.mock('../../agent', () => ({
  CodeReviewAgent: jest.fn().mockImplementation(() => ({
    run: mockRun,
    getTrendReport: mockGetTrendReport,
  })),
}));

jest.mock('../../report-generator', () => ({
  formatReportAsText: jest.fn().mockReturnValue('\n[Report Text]\n'),
}));

// Mock ai-provider (used by base-agent via require)
jest.mock('../ai-provider', () => ({
  autoDetectProvider: jest.fn().mockReturnValue(null),
}));

// Mock code-transformer (used by reviewer-agent via require)
const mockTransformFile = jest.fn();
jest.mock('../code-transformer', () => ({
  CodeTransformer: jest.fn().mockImplementation(() => ({
    transformFile: mockTransformFile,
  })),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

import { ReviewerAgent } from './reviewer-agent';
import { SubAgentConfig, Task, TaskPhase } from '../types';

// ── Helpers ──

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    role: 'reviewer',
    concurrency: 1,
    maxRetries: 2,
    timeout: 60000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-review-1',
    phase: 'review' as TaskPhase,
    title: 'Code Review',
    description: 'Perform comprehensive code review',
    assignedAgent: 'reviewer',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function dirent(name: string, isDir: boolean): fs.Dirent {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  };
}

/** Returns a minimal ReviewReport-like object for the CodeReviewAgent mock */
function makeReviewReport(overrides: Record<string, unknown> = {}) {
  return {
    projectPath: '/test/project',
    timestamp: new Date().toISOString(),
    stages: [],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    passed: true,
    duration: 100,
    insights: [],
    fixReport: null,
    ...overrides,
  };
}

const PROJECT_PATH = '/test/project';

// ── Tests ──

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: CodeReviewAgent returns a clean report
    mockRun.mockReturnValue(makeReviewReport());
    mockGetTrendReport.mockReturnValue('Trend: stable');
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 0, changes: [] });

    // Default fs mocks
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('');
    (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

    agent = new ReviewerAgent(makeConfig());
  });

  // ═══ Basic behavior ═══

  describe('basic behavior', () => {
    it('should return agent info with correct name and role', () => {
      const info = agent.getInfo();
      expect(info.name).toBe('Reviewer Agent');
      expect(info.role).toBe('reviewer');
    });

    it('should have review-related capabilities', () => {
      const info = agent.getInfo();
      expect(info.capabilities).toContain('compile-check');
      expect(info.capabilities).toContain('lint-analysis');
      expect(info.capabilities).toContain('code-smell-detection');
      expect(info.capabilities).toContain('complexity-analysis');
      expect(info.capabilities).toContain('direct-code-fix');
    });

    it('should start in idle status', () => {
      expect(agent.getStatus()).toBe('idle');
    });
  });

  // ═══ executeTask — happy path ═══

  describe('executeTask (via run)', () => {
    it('should succeed when CodeReviewAgent finds no issues', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Prompt Enhancement Applied');
      expect(result.output).toContain('[Report Text]');
      expect(result.output).toContain('Trend: stable');
    });

    it('should include prompt enhancement info in output', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('[REVIEWER] ── Prompt Enhancement Applied ──');
      expect(result.output).toContain('강화된 지시');
      expect(result.output).toContain('사고 단계');
      expect(result.output).toContain('품질 체크리스트');
    });

    it('should include prompt enhancement artifact', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.artifacts.some((a) => a.includes('[PROMPT-ENHANCED]'))).toBe(true);
    });

    it('should convert CodeReviewAgent stage issues to TaskIssues', () => {
      mockRun.mockReturnValue(makeReviewReport({
        stages: [{
          stage: 'lint',
          status: 'fail',
          issues: [
            { stage: 'lint', severity: 'error', message: 'no-unused-vars', file: 'src/app.ts', line: 10 },
            { stage: 'lint', severity: 'warning', message: 'prefer-const', file: 'src/app.ts', line: 20, suggestion: 'Use const' },
          ],
          duration: 50,
          summary: '2 issues',
        }],
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.issues.length).toBeGreaterThanOrEqual(2);
      const errorIssue = result.issues.find((i) => i.message === 'no-unused-vars');
      expect(errorIssue).toBeDefined();
      expect(errorIssue!.severity).toBe('error');
      expect(errorIssue!.file).toBe('src/app.ts');
    });

    it('should fail when CodeReviewAgent reports errors', () => {
      mockRun.mockReturnValue(makeReviewReport({
        stages: [{
          stage: 'compile',
          status: 'fail',
          issues: [
            { stage: 'compile', severity: 'error', message: 'TS2322: Type error', file: 'src/main.ts' },
          ],
          duration: 100,
          summary: 'compile failed',
        }],
        passed: false,
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(false);
    });
  });

  // ═══ Code smell detection ═══

  describe('code smell detection', () => {
    it('should detect console.log usage', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('app.ts')) {
          return 'function main() {\n  console.log("debug");\n}';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const smellIssue = result.issues.find((i) => i.message.includes('Console Statement'));
      expect(smellIssue).toBeDefined();
      expect(smellIssue!.autoFixable).toBe(true);
    });

    it('should detect TypeScript any usage', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('utils.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('utils.ts')) {
          return 'function parse(data: any) { return data; }';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const anyIssue = result.issues.find((i) => i.message.includes('any'));
      expect(anyIssue).toBeDefined();
    });

    it('should detect empty catch blocks', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('handler.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('handler.ts')) {
          return 'try { doSomething(); } catch (e) {}';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const catchIssue = result.issues.find((i) => i.message.includes('Empty Catch Block'));
      expect(catchIssue).toBeDefined();
      expect(catchIssue!.autoFixable).toBe(true);
    });

    it('should skip test and spec files for code smell scanning', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.test.ts', false), dirent('app.spec.ts', false)];
        }
        return [];
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      // Should not have code smell issues from test files
      const smellIssues = result.issues.filter((i) => i.message.includes('[Code Smell]'));
      expect(smellIssues).toHaveLength(0);
    });

    it('should skip hidden directories and node_modules', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('.git', true), dirent('node_modules', true), dirent('dist', true)];
        }
        return [];
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const smellIssues = result.issues.filter((i) => i.message.includes('[Code Smell]'));
      expect(smellIssues).toHaveLength(0);
    });

    it('should recurse into subdirectories up to depth 5', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('src', true)];
        }
        if (dir === path.join(PROJECT_PATH, 'src')) {
          return [dirent('index.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('index.ts')) {
          return 'console.log("hello");';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const smellIssue = result.issues.find((i) => i.message.includes('Console Statement'));
      expect(smellIssue).toBeDefined();
    });
  });

  // ═══ CodeTransformer auto-fix ═══

  describe('code transformer auto-fix', () => {
    it('should run CodeTransformer when fixable smells are detected', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('app.ts')) {
          return 'console.log("debug");';
        }
        return '';
      });
      mockTransformFile.mockReturnValue({
        success: true,
        appliedCount: 1,
        changes: [{ description: 'Removed console.log' }],
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.artifacts.some((a) => a.includes('[AUTO-FIX]'))).toBe(true);
      expect(result.output).toContain('CodeTransformer');
    });

    it('should include remaining smells count when some cannot be auto-fixed', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('app.ts')) {
          return 'console.log("x"); // TODO fix this\nfunction f(data: any) {}';
        }
        return '';
      });
      mockTransformFile.mockReturnValue({
        success: true,
        appliedCount: 1,
        changes: [{ description: 'Removed console.log' }],
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.artifacts.some((a) => a.includes('[CODE-QUALITY]') && a.includes('remaining'))).toBe(true);
    });

    it('should handle CodeTransformer failure gracefully', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('app.ts')) {
          return 'console.log("debug");';
        }
        return '';
      });

      // Make CodeTransformer constructor throw
      const { CodeTransformer } = require('../code-transformer');
      (CodeTransformer as jest.Mock).mockImplementationOnce(() => {
        throw new Error('TypeScript not available');
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      // Should not crash
      expect(result).toBeDefined();
      expect(result.output).toContain('CodeTransformer');
    });
  });

  // ═══ AI code review ═══

  describe('AI code review', () => {
    it('should skip AI review when no AI provider is available', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('AI 프로바이더 없음');
    });

    it('should skip AI review when no source files > 20 lines exist', () => {
      // Even if AI provider is available, no files to review
      const { autoDetectProvider } = require('../ai-provider');
      (autoDetectProvider as jest.Mock).mockReturnValue({ provider: 'claude', apiKey: 'test-key' });

      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('tiny.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('tiny.ts')) {
          return 'export const x = 1;\n'; // only 1 line
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('분석 대상 소스 파일 없음');
    });
  });

  // ═══ Complexity analysis ═══

  describe('complexity analysis', () => {
    it('should detect large files (300+ lines)', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('big-file.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('big-file.ts')) {
          return Array(350).fill('// line').join('\n');
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const complexityIssue = result.issues.find((i) => i.message.includes('[Complexity]') && i.message.includes('350'));
      expect(complexityIssue).toBeDefined();
      expect(complexityIssue!.severity).toBe('info');
    });

    it('should handle read errors in complexity analysis gracefully', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('unreadable.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('unreadable.ts')) {
          throw new Error('EACCES: permission denied');
        }
        return '';
      });

      // Should not throw
      const result = agent.run(makeTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });

    it('should handle readdirSync errors gracefully', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = agent.run(makeTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ Learning insights & artifacts ═══

  describe('learning insights and artifacts', () => {
    it('should include learning insights in artifacts when present', () => {
      mockRun.mockReturnValue(makeReviewReport({
        insights: ['Issue count reduced by 5 since last run', 'Lint warnings trending down'],
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.artifacts.some((a) => a.includes('[LEARNING]'))).toBe(true);
    });

    it('should include fix report in artifacts when present', () => {
      mockRun.mockReturnValue(makeReviewReport({
        fixReport: {
          lintFixedCount: 3,
          snapshotsUpdated: false,
          suggestions: ['Consider adding type annotations'],
          duration: 50,
        },
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.artifacts.some((a) => a.includes('Auto-fixed 3 lint issues'))).toBe(true);
      expect(result.artifacts.some((a) => a.includes('Suggestion:'))).toBe(true);
    });
  });

  // ═══ Success/failure determination ═══

  describe('success determination', () => {
    it('should succeed when only info/warning issues exist', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('app.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('app.ts')) {
          return 'console.log("debug");';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(true);
    });

    it('should fail when error-severity issues exist', () => {
      mockRun.mockReturnValue(makeReviewReport({
        stages: [{
          stage: 'compile',
          status: 'fail',
          issues: [{ stage: 'compile', severity: 'error', message: 'compile error', file: 'main.ts' }],
          duration: 10,
          summary: 'fail',
        }],
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(false);
    });
  });

  // ═══ BaseSubAgent integration ═══

  describe('BaseSubAgent integration', () => {
    it('should increment completedTasks on success', () => {
      agent.run(makeTask(), PROJECT_PATH);
      expect(agent.getInfo().completedTasks).toBe(1);
    });

    it('should set status to idle after task completion', () => {
      agent.run(makeTask(), PROJECT_PATH);
      expect(agent.getStatus()).toBe('idle');
    });

    it('should return role as reviewer', () => {
      expect(agent.getRole()).toBe('reviewer');
    });
  });
});
