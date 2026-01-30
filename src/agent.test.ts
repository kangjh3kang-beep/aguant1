import { CodeReviewAgent } from './agent';

// 분석기 모듈 모킹
jest.mock('./analyzers/compile-analyzer', () => ({
  analyzeCompile: jest.fn().mockReturnValue({
    stage: 'compile',
    status: 'pass',
    issues: [],
    duration: 100,
    summary: 'Compilation succeeded.',
  }),
}));

jest.mock('./analyzers/lint-analyzer', () => ({
  analyzeLint: jest.fn().mockReturnValue({
    stage: 'lint',
    status: 'pass',
    issues: [],
    duration: 200,
    summary: 'No lint issues.',
  }),
}));

jest.mock('./analyzers/test-analyzer', () => ({
  analyzeTest: jest.fn().mockReturnValue({
    stage: 'test',
    status: 'pass',
    issues: [],
    duration: 300,
    summary: 'All tests passed.',
  }),
}));

jest.mock('./analyzers/auto-fixer', () => ({
  autoFixLint: jest.fn().mockReturnValue({
    stage: 'fix',
    fixedCount: 2,
    issues: [],
    duration: 100,
    summary: 'Fixed 2 issues.',
  }),
  suggestCompileFixes: jest.fn().mockReturnValue([]),
  updateTestSnapshots: jest.fn().mockReturnValue({
    stage: 'fix',
    fixedCount: 0,
    issues: [],
    duration: 50,
    summary: 'No snapshots updated.',
  }),
}));

jest.mock('./utils/process-runner', () => ({
  ...jest.requireActual('./utils/process-runner'),
  validateProjectPath: jest.fn().mockReturnValue({ valid: true }),
}));

jest.mock('./utils/git-diff', () => ({
  isGitRepo: jest.fn().mockReturnValue(false),
  getCurrentBranch: jest.fn().mockReturnValue(null),
  getChangedFiles: jest.fn().mockReturnValue([]),
  filterByExtension: jest.fn().mockReturnValue([]),
}));

// Logger 모킹 (콘솔 출력 억제)
jest.mock('./utils/logger', () => ({
  logHeader: jest.fn(),
  logStageStart: jest.fn(),
  logStageResult: jest.fn(),
  logIssue: jest.fn(),
  logSummary: jest.fn(),
}));

describe('CodeReviewAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run all stages by default', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const report = agent.run();

    expect(report.stages).toHaveLength(3);
    expect(report.stages[0].stage).toBe('compile');
    expect(report.stages[1].stage).toBe('lint');
    expect(report.stages[2].stage).toBe('test');
    expect(report.passed).toBe(true);
  });

  it('should run only specified stages', () => {
    const agent = new CodeReviewAgent({
      projectPath: '/test',
      stages: ['compile', 'lint'],
    });
    const report = agent.run();

    expect(report.stages).toHaveLength(2);
    expect(report.stages.map((s) => s.stage)).toEqual(['compile', 'lint']);
  });

  it('should support fail-fast mode', () => {
    const { analyzeCompile } = require('./analyzers/compile-analyzer');
    analyzeCompile.mockReturnValueOnce({
      stage: 'compile',
      status: 'fail',
      issues: [{ stage: 'compile', severity: 'error', file: 'a.ts', message: 'Error' }],
      duration: 100,
      summary: 'Failed.',
    });

    const agent = new CodeReviewAgent({
      projectPath: '/test',
      failFast: true,
    });
    const report = agent.run();

    expect(report.passed).toBe(false);
    expect(report.stages).toHaveLength(3);
    expect(report.stages[0].status).toBe('fail');
    expect(report.stages[1].status).toBe('skip');
    expect(report.stages[2].status).toBe('skip');
  });

  it('should return config via getConfig', () => {
    const agent = new CodeReviewAgent({
      projectPath: '/test',
      verbose: true,
    });

    const config = agent.getConfig();

    expect(config.projectPath).toBe('/test');
    expect(config.verbose).toBe(true);
    expect(config.stages).toEqual(['compile', 'lint', 'test']);
  });

  it('should use custom commands when provided', () => {
    const { analyzeCompile } = require('./analyzers/compile-analyzer');

    const agent = new CodeReviewAgent({
      projectPath: '/test',
      stages: ['compile'],
      compileCommand: 'custom-compile-cmd',
    });
    agent.run();

    expect(analyzeCompile).toHaveBeenCalledWith('/test', 'custom-compile-cmd');
  });

  it('should calculate total duration', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const report = agent.run();

    expect(report.duration).toBe(600); // 100 + 200 + 300
  });

  it('should handle stage crash gracefully', () => {
    const { analyzeCompile } = require('./analyzers/compile-analyzer');
    analyzeCompile.mockImplementationOnce(() => {
      throw new Error('Unexpected crash');
    });

    const agent = new CodeReviewAgent({
      projectPath: '/test',
      stages: ['compile'],
    });
    const report = agent.run();

    expect(report.passed).toBe(false);
    expect(report.stages[0].status).toBe('fail');
    expect(report.stages[0].issues[0].message).toContain('Stage crashed');
  });

  it('should fail for invalid project path', () => {
    const { validateProjectPath } = require('./utils/process-runner');
    validateProjectPath.mockReturnValueOnce({ valid: false, reason: 'Path does not exist' });

    const agent = new CodeReviewAgent({ projectPath: '/nonexistent' });
    const report = agent.run();

    expect(report.passed).toBe(false);
    expect(report.stages[0].issues[0].message).toContain('Path does not exist');
  });

  it('should include fixReport when autoFix is enabled', () => {
    const agent = new CodeReviewAgent({
      projectPath: '/test',
      stages: ['lint'],
      autoFix: true,
    });
    const report = agent.run();

    expect(report.fixReport).toBeDefined();
    expect(report.fixReport?.lintFixedCount).toBeDefined();
  });

  it('should set default autoFix to false', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const config = agent.getConfig();
    expect(config.autoFix).toBe(false);
  });

  it('should set default diffOnly to false', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const config = agent.getConfig();
    expect(config.diffOnly).toBe(false);
  });
});
