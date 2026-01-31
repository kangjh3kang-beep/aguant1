/**
 * TesterAgent -- QA Sub-Agent Tests
 *
 * Covers:
 *  - executeTask happy path (via run())
 *  - Test framework detection (Jest, Vitest, Mocha, Playwright, pytest, unknown)
 *  - Coverage gap analysis (untested source files -> stub generation)
 *  - Test quality scanning (test smells, skipped tests auto-activation)
 *  - Auto-fix of test failures (module-not-found, async timeout patterns)
 *  - Error handling (fs failures, execSync failures)
 *  - SharedKnowledge integration
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// --- Mocks must be declared before imports that use them ---

jest.mock('fs');
jest.mock('child_process');
jest.mock('../code-transformer', () => ({
  CodeTransformer: jest.fn().mockImplementation(() => ({
    transformProject: jest.fn().mockReturnValue({ changed: 0 }),
  })),
}));
jest.mock('../prompt-enhancer', () => ({
  PromptEnhancer: jest.fn().mockImplementation(() => ({
    enhance: jest.fn().mockReturnValue({
      systemPrompt: 'sys',
      enhancedDescription: 'enhanced description for testing purposes padded to 120+ chars so slice works properly here',
      thinkingFramework: '1단계\n2단계\n3단계',
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
jest.mock('../ai-provider', () => ({
  autoDetectProvider: jest.fn().mockReturnValue(null),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import { TesterAgent } from './tester-agent';
import { Task, SubAgentConfig, TaskPhase } from '../types';

// ---- Helpers ---------------------------------------------------------------

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    role: 'tester',
    concurrency: 1,
    maxRetries: 2,
    timeout: 60000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-test-1',
    phase: 'test' as TaskPhase,
    title: 'Run Tests',
    description: 'Execute tests and analyze coverage',
    assignedAgent: 'tester',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Helper: create a minimal Dirent-like object */
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

// ---- Tests -----------------------------------------------------------------

describe('TesterAgent', () => {
  let agent: TesterAgent;
  const projectPath = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: package.json with jest, no test files on disk
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

    // execSync default: successful test run with no failures
    mockExecSync.mockReturnValue('All tests passed\n');

    agent = new TesterAgent(makeConfig());
  });

  // =========================================================================
  // executeTask -- happy path
  // =========================================================================

  describe('executeTask (via run)', () => {
    it('should return a successful result when all tests pass', () => {
      // package.json exists with jest
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      // execSync: clean jest JSON output
      mockExecSync.mockReturnValue(JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 5,
        numFailedTests: 0,
        numPassedTestSuites: 2,
        numFailedTestSuites: 0,
        testResults: [],
      }));

      const result = agent.run(makeTask(), projectPath);

      expect(result.success).toBe(true);
      expect(result.output).toContain('[TESTER]');
      expect(result.output).toContain('jest');
    });

    it('should return failure when tests fail', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue(JSON.stringify({
        numTotalTests: 5,
        numPassedTests: 3,
        numFailedTests: 2,
        numPassedTestSuites: 1,
        numFailedTestSuites: 1,
        testResults: [
          {
            status: 'failed',
            testFilePath: 'src/app.test.ts',
            testResults: [
              { status: 'failed', fullName: 'App should work', failureMessages: ['Expected true to be false'] },
            ],
          },
        ],
      }));

      const result = agent.run(makeTask(), projectPath);

      expect(result.success).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should handle execSync throwing an error', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);
      mockExecSync.mockImplementation(() => { throw new Error('spawn ENOENT'); });

      const result = agent.run(makeTask(), projectPath);

      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.message.includes('Test execution failed'))).toBe(true);
    });
  });

  // =========================================================================
  // Framework detection
  // =========================================================================

  describe('framework detection', () => {
    it('should detect jest from package.json devDependencies', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        return s.endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('jest');
    });

    it('should detect vitest when vitest is in dependencies', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        return s.endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { vitest: '^1.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('vitest');
    });

    it('should detect mocha when mocha is in dependencies', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        return s.endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { mocha: '^10.0.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('mocha');
    });

    it('should detect playwright from @playwright/test', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        return s.endsWith('package.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { '@playwright/test': '^1.40.0' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('playwright');
    });

    it('should detect pytest from pytest.ini', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('pytest.ini')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('pytest');
    });

    it('should fall back to unknown when no framework is detected', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');
      const result = agent.run(makeTask(), projectPath);
      expect(result.output).toContain('unknown');
    });
  });

  // =========================================================================
  // Coverage gap analysis
  // =========================================================================

  describe('coverage gap analysis', () => {
    it('should identify source files without corresponding test files', () => {
      // package.json with jest
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        // Source file exists
        if (s.includes('utils.ts')) return true;
        // Test stub does not exist yet
        if (s.includes('utils.test.ts')) return false;
        return false;
      });

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '^29' } });
        }
        if (s.endsWith('utils.ts')) {
          return 'export function helper() { return 1; }\n';
        }
        return '';
      });

      // Directory scan returns a source file without a test
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [
            dirent('utils.ts', false),
          ] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });
      mockFs.writeFileSync.mockImplementation(() => {});
      mockFs.mkdirSync.mockImplementation(() => undefined as unknown as string);

      mockExecSync.mockReturnValue('All tests passed\n');

      const result = agent.run(makeTask(), projectPath);

      expect(result.output).toContain('테스트 없는 소스 파일');
      // Should report untested files
      expect(result.issues.some((i) => i.message.includes('Coverage Gap') || i.message.includes('utils'))).toBe(true);
    });

    it('should not flag files that already have tests', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));

      // Both source and test files present
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [
            dirent('app.ts', false),
            dirent('app.test.ts', false),
          ] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });

      mockExecSync.mockReturnValue('All tests passed\n');
      const result = agent.run(makeTask(), projectPath);

      // Should not report any coverage gap for app.ts
      const gapIssues = result.issues.filter((i) => i.message.includes('Coverage Gap') && i.message.includes('app.ts'));
      expect(gapIssues.length).toBe(0);
    });

    it('should skip index/types/config files from gap analysis', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));

      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [
            dirent('index.ts', false),
            dirent('types.ts', false),
            dirent('config.ts', false),
            dirent('constants.ts', false),
          ] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });

      mockExecSync.mockReturnValue('All tests passed\n');
      const result = agent.run(makeTask(), projectPath);

      // index, types, config, constants should be skipped
      const gapIssues = result.issues.filter((i) => i.message.includes('Coverage Gap'));
      expect(gapIssues.length).toBe(0);
    });
  });

  // =========================================================================
  // Test quality scanning
  // =========================================================================

  describe('test quality scanning', () => {
    it('should detect test smell: no assertion in test blocks', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '^29' } });
        }
        // Test file with 3 tests but only 1 assertion
        if (s.endsWith('app.test.ts')) {
          return `
describe('App', () => {
  it('test one', () => { const x = 1; });
  it('test two', () => { const y = 2; });
  it('test three', () => { expect(1).toBe(1); });
});`;
        }
        return '';
      });

      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [dirent('app.test.ts', false)] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });

      mockExecSync.mockReturnValue('All tests passed\n');
      const result = agent.run(makeTask(), projectPath);

      expect(result.issues.some((i) => i.message.includes('Test Smell') && i.message.includes('assertion'))).toBe(true);
    });

    it('should detect and auto-activate disabled/skipped tests', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });

      const skippedTestContent = `
describe('Feature', () => {
  xit('should do thing', () => { expect(1).toBe(1); });
  it.skip('should do other thing', () => { expect(2).toBe(2); });
  it('active test', () => { expect(3).toBe(3); });
});`;

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '^29' } });
        }
        return skippedTestContent;
      });

      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [dirent('feature.test.ts', false)] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });
      mockFs.writeFileSync.mockImplementation(() => {});

      mockExecSync.mockReturnValue('All tests passed\n');
      const result = agent.run(makeTask(), projectPath);

      // Should have written a file with skipped tests activated
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      // Artifacts should note auto-fix
      expect(result.artifacts.some((a) => a.includes('AUTO-FIX') || a.includes('자동 수정'))).toBe(true);
    });

    it('should detect no-describe smell when many tests exist without describe', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });

      // 4 tests without describe block
      const noDescribeContent = `
it('a', () => { expect(1).toBe(1); });
it('b', () => { expect(2).toBe(2); });
it('c', () => { expect(3).toBe(3); });
it('d', () => { expect(4).toBe(4); });
`;

      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '^29' } });
        }
        return noDescribeContent;
      });

      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        const s = String(dir);
        if (s === projectPath) {
          return [dirent('math.test.ts', false)] as unknown as fs.Dirent[];
        }
        return [] as unknown as fs.Dirent[];
      });

      mockExecSync.mockReturnValue('All tests passed\n');
      const result = agent.run(makeTask(), projectPath);

      expect(result.issues.some((i) => i.message.includes('describe'))).toBe(true);
    });
  });

  // =========================================================================
  // Auto-fix test failures
  // =========================================================================

  describe('auto-fix test failures', () => {
    it('should attempt auto-fix when tests fail and re-run passes', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      let callCount = 0;
      mockExecSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First run: tests fail
          return JSON.stringify({
            numTotalTests: 2,
            numPassedTests: 0,
            numFailedTests: 2,
            numPassedTestSuites: 0,
            numFailedTestSuites: 1,
            testResults: [
              {
                status: 'failed',
                testFilePath: 'src/app.test.ts',
                testResults: [
                  {
                    status: 'failed',
                    fullName: 'App test',
                    failureMessages: ['Timeout - Async callback was not invoked within 5000ms'],
                  },
                ],
              },
            ],
          });
        }
        // Subsequent runs: tests pass
        return JSON.stringify({
          numTotalTests: 2,
          numPassedTests: 2,
          numFailedTests: 0,
          numPassedTestSuites: 1,
          numFailedTestSuites: 0,
          testResults: [],
        });
      });

      // Make the async timeout fix work: existsSync returns true for the test file
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        if (s.endsWith('.test.ts') || s.endsWith('app.test.ts')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { jest: '^29' } });
        }
        // Test file without jest.setTimeout
        return 'describe("App", () => { it("works", (done) => { done(); }); });';
      });
      mockFs.writeFileSync.mockImplementation(() => {});

      const result = agent.run(makeTask(), projectPath);

      // After auto-fix + re-run, the result should be successful
      expect(result.output).toContain('자동 수정');
    });
  });

  // =========================================================================
  // Jest JSON output parsing
  // =========================================================================

  describe('jest output parsing', () => {
    it('should parse valid jest JSON output with numTotalTests', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue(JSON.stringify({
        numTotalTests: 10,
        numPassedTests: 10,
        numFailedTests: 0,
        numPassedTestSuites: 3,
        numFailedTestSuites: 0,
        testResults: [],
      }));

      const result = agent.run(makeTask(), projectPath);

      expect(result.success).toBe(true);
      expect(result.output).toContain('10 passed');
      expect(result.output).toContain('0 failed');
    });

    it('should fall back gracefully when jest JSON is malformed', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      // Malformed output -- not JSON
      mockExecSync.mockReturnValue('PASS src/app.test.ts\nTests: 5 passed, 5 total\n');

      const result = agent.run(makeTask(), projectPath);

      // Falls back to text-based analysis -- no 'fail' keyword means pass
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // Non-jest frameworks (general text output parsing)
  // =========================================================================

  describe('non-jest framework output parsing', () => {
    it('should detect failure in general text output', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { mocha: '^10' },
      }));
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('1 passing\n2 failing\nError: expected 1 to equal 2\n');

      const result = agent.run(makeTask(), projectPath);

      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('error handling', () => {
    it('should handle fs.readdirSync failure gracefully during quality scan', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29' },
      }));
      mockFs.readdirSync.mockImplementation(() => { throw new Error('EACCES: permission denied'); });

      mockExecSync.mockReturnValue('All tests passed\n');

      // Should not throw -- errors handled internally
      const result = agent.run(makeTask(), projectPath);
      expect(result).toBeDefined();
      expect(result.output).toContain('[TESTER]');
    });

    it('should handle package.json parse error gracefully', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{ invalid json !!!');
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('Tests passed\n');

      // Should fall through to unknown framework
      const result = agent.run(makeTask(), projectPath);
      expect(result).toBeDefined();
      expect(result.output).toContain('unknown');
    });
  });

  // =========================================================================
  // BaseSubAgent integration (run wraps executeTask)
  // =========================================================================

  describe('BaseSubAgent integration', () => {
    it('should track completed tasks count', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
      mockExecSync.mockReturnValue('All tests passed\n');

      agent.run(makeTask(), projectPath);
      const info = agent.getInfo();
      expect(info.completedTasks).toBe(1);
      expect(info.failedTasks).toBe(0);
    });

    it('should track failed tasks count', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);

      mockExecSync.mockReturnValue('FAIL src/bad.test.ts\nTest failed\n');

      agent.run(makeTask(), projectPath);
      const info = agent.getInfo();
      expect(info.failedTasks).toBe(1);
    });

    it('should return role as tester', () => {
      expect(agent.getRole()).toBe('tester');
    });

    it('should return idle status after task completion', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
      mockExecSync.mockReturnValue('All tests passed\n');

      agent.run(makeTask(), projectPath);
      expect(agent.getStatus()).toBe('idle');
    });
  });
});
