import { CodeReviewAgent } from './agent';
import { analyzeCompile } from './analyzers/compile-analyzer';
import { validateProjectPath } from './utils/process-runner';
import { saveToHistory } from './utils/review-history';

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

jest.mock('./analyzers/runtime-analyzer', () => ({
  analyzeRuntime: jest.fn().mockReturnValue({
    stage: 'runtime',
    status: 'pass',
    issues: [],
    duration: 150,
    summary: 'Runtime health check passed.',
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

// 학습 루프 모킹
jest.mock('./utils/review-history', () => ({
  saveToHistory: jest.fn().mockReturnValue({ id: 'test-id' }),
  compareWithPrevious: jest.fn().mockReturnValue([
    'Errors reduced: 5 -> 0 (5 fixed)',
  ]),
  analyzeTrend: jest.fn().mockReturnValue({
    totalRuns: 3,
    passRate: 67,
    errorTrend: 'improving',
    warningTrend: 'stable',
    durationTrend: 'stable',
    avgErrors: 3,
    avgWarnings: 1,
    avgDuration: 500,
    recentErrors: 1,
    recentWarnings: 1,
    recentDuration: 500,
    recurringIssues: [],
    improvements: ['Errors: 5 -> 0'],
    regressions: [],
  }),
  formatTrendReport: jest.fn().mockReturnValue('Trend Report Text'),
}));

const mockedAnalyzeCompile = jest.mocked(analyzeCompile);
const mockedValidateProjectPath = jest.mocked(validateProjectPath);
const mockedSaveToHistory = jest.mocked(saveToHistory);

describe('CodeReviewAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should run all stages by default', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const report = agent.run();

    expect(report.stages).toHaveLength(4);
    expect(report.stages[0].stage).toBe('compile');
    expect(report.stages[1].stage).toBe('lint');
    expect(report.stages[2].stage).toBe('test');
    expect(report.stages[3].stage).toBe('runtime');
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
    mockedAnalyzeCompile.mockReturnValueOnce({
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
    expect(report.stages).toHaveLength(4);
    expect(report.stages[0].status).toBe('fail');
    expect(report.stages[1].status).toBe('skip');
    expect(report.stages[2].status).toBe('skip');
    expect(report.stages[3].status).toBe('skip');
  });

  it('should return config via getConfig', () => {
    const agent = new CodeReviewAgent({
      projectPath: '/test',
      verbose: true,
    });

    const config = agent.getConfig();

    expect(config.projectPath).toBe('/test');
    expect(config.verbose).toBe(true);
    expect(config.stages).toEqual(['compile', 'lint', 'test', 'runtime']);
  });

  it('should use custom commands when provided', () => {
    const agent = new CodeReviewAgent({
      projectPath: '/test',
      stages: ['compile'],
      compileCommand: 'custom-compile-cmd',
    });
    agent.run();

    expect(mockedAnalyzeCompile).toHaveBeenCalledWith('/test', 'custom-compile-cmd');
  });

  it('should calculate total duration', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const report = agent.run();

    expect(report.duration).toBe(750); // 100 + 200 + 300 + 150
  });

  it('should handle stage crash gracefully', () => {
    mockedAnalyzeCompile.mockImplementationOnce(() => {
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
    mockedValidateProjectPath.mockReturnValueOnce({ valid: false, reason: 'Path does not exist' });

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

  it('should save to history after run (learning loop)', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    agent.run();

    expect(mockedSaveToHistory).toHaveBeenCalledWith('/test', expect.any(Object));
  });

  it('should include insights in report from learning loop', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const report = agent.run();

    expect(report.insights).toBeDefined();
    expect(report.insights).toContain('Errors reduced: 5 -> 0 (5 fixed)');
  });

  it('should return trend analysis via getTrend', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const trend = agent.getTrend();

    expect(trend.totalRuns).toBe(3);
    expect(trend.passRate).toBe(67);
    expect(trend.errorTrend).toBe('improving');
  });

  it('should return formatted trend report via getTrendReport', () => {
    const agent = new CodeReviewAgent({ projectPath: '/test' });
    const text = agent.getTrendReport();

    expect(text).toBe('Trend Report Text');
  });

  it('should not fail if learning loop throws', () => {
    mockedSaveToHistory.mockImplementationOnce(() => {
      throw new Error('Disk full');
    });

    const agent = new CodeReviewAgent({ projectPath: '/test' });
    // Should not throw - learning failures are non-critical
    const report = agent.run();

    expect(report.passed).toBe(true);
  });
});
