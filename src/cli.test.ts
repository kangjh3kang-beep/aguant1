/**
 * Tests for cli.ts
 *
 * cli.ts calls program.parse() at module scope. We use jest.isolateModules()
 * to re-execute it per test. Mock factories read from shared state vars
 * so they work correctly inside isolated module scopes.
 */

// ─── Shared mock state (read by mock factories) ─────────────
let _loadConfigResult: { config: unknown; errors: unknown[] } = { config: null, errors: [] };
let _mockRun = jest.fn();
let _runProcessResults: Array<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> = [];
let _runProcessIndex = 0;
let _loadHistoryResult: unknown = { entries: [] };
let _analyzeTrendResult: unknown = { totalRuns: 0 };
let _formatTrendResult = '';
let _orchestratorState: unknown = {};
let _autonomousState: unknown = {};

// ─── Mock factories ──────────────────────────────────────────
jest.mock('./agent', () => ({
  CodeReviewAgent: jest.fn().mockImplementation(() => ({
    run: (...args: unknown[]) => _mockRun(...args),
  })),
}));

jest.mock('./report-generator', () => ({
  formatReportAsText: jest.fn(() => 'report text'),
  formatReportAsJson: jest.fn(() => '{"json":true}'),
}));

jest.mock('./utils/config-loader', () => ({
  loadConfig: jest.fn(() => _loadConfigResult),
}));

jest.mock('./utils/process-runner', () => ({
  runProcess: jest.fn(() => {
    const r = _runProcessResults[_runProcessIndex];
    _runProcessIndex++;
    return r;
  }),
}));

jest.mock('./utils/review-history', () => ({
  loadHistory: jest.fn(() => _loadHistoryResult),
  analyzeTrend: jest.fn(() => _analyzeTrendResult),
  formatTrendReport: jest.fn(() => _formatTrendResult),
}));

jest.mock('./orchestrator', () => ({
  Orchestrator: {
    quickStart: jest.fn(() => ({
      getConfig: () => ({
        pipeline: { phases: [], failFast: false, maxIterations: 3, humanGates: [], parallel: true },
        project: {},
      }),
      run: () => _orchestratorState,
    })),
  },
}));

jest.mock('./orchestrator/autonomous-loop', () => ({
  AutonomousLoop: jest.fn().mockImplementation(() => ({
    run: () => _autonomousState,
  })),
}));

// ─── Helpers ────────────────────────────────────────────────
function pr(stdout: string, exitCode = 0) {
  return { stdout, stderr: '', exitCode, timedOut: false };
}
function prErr(stderr: string, exitCode = 1) {
  return { stdout: '', stderr, exitCode, timedOut: false };
}

describe('cli', () => {
  let consoleSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  const originalArgv = process.argv;

  beforeEach(() => {
    // Reset shared state
    _loadConfigResult = { config: null, errors: [] };
    _mockRun = jest.fn().mockReturnValue({ passed: true, duration: 100, stages: [] });
    _runProcessResults = [];
    _runProcessIndex = 0;
    _loadHistoryResult = { entries: [] };
    _analyzeTrendResult = { totalRuns: 0 };
    _formatTrendResult = '';
    _orchestratorState = { status: 'completed' };
    _autonomousState = { status: 'completed' };

    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function runCli(args: string[]) {
    process.argv = ['node', 'ag-review', ...args];
    jest.isolateModules(() => {
      require('./cli');
    });
  }

  describe('review command', () => {
    it('exits with 0 on passing review', () => {
      _mockRun.mockReturnValue({ passed: true, duration: 1000, stages: [] });
      runCli(['review', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 on failed review', () => {
      _mockRun.mockReturnValue({ passed: false, duration: 500, stages: [] });
      runCli(['review', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('exits with 2 on config validation errors', () => {
      _loadConfigResult = {
        config: null,
        errors: [{ field: 'stages', message: 'invalid' }],
      };
      runCli(['review', '-p', '/test/project']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Config validation errors'));
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('handles fatal errors', () => {
      _mockRun.mockImplementation(() => { throw new Error('crash'); });
      runCli(['review', '-p', '/test/project']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Fatal error'));
      expect(exitSpy).toHaveBeenCalledWith(2);
    });

    it('passes json format flag', () => {
      _mockRun.mockReturnValue({ passed: true, duration: 100, stages: [] });
      runCli(['review', '-p', '/test/project', '--json']);
      // Should output JSON format
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('json'));
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('check command', () => {
    it('exits with 0 on pass', () => {
      _mockRun.mockReturnValue({ passed: true, duration: 200, stages: [] });
      runCli(['check', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 on fail', () => {
      _mockRun.mockReturnValue({ passed: false, duration: 200, stages: [] });
      runCli(['check', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('fix command', () => {
    it('exits with 0 on success', () => {
      _mockRun.mockReturnValue({ passed: true, duration: 300, stages: [] });
      runCli(['fix', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('preview command', () => {
    it('exits with 0 on pass', () => {
      _mockRun.mockReturnValue({ passed: true, duration: 100, stages: [] });
      runCli(['preview', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('history command', () => {
    it('displays history entries', () => {
      _loadHistoryResult = {
        entries: [{
          timestamp: '2024-01-01T00:00:00Z', passed: true,
          errorCount: 0, warningCount: 1, duration: 1000,
          gitBranch: 'main',
          stages: [{ stage: 'compile', status: 'pass', issueCount: 0, duration: 500 }],
        }],
      };
      runCli(['history', '-p', '/test/project']);
      const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allOutput).toContain('Review History');
    });

    it('shows message when no history', () => {
      _loadHistoryResult = { entries: [] };
      runCli(['history', '-p', '/test/project']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No review history'));
    });

    it('outputs JSON when --json flag is set', () => {
      _loadHistoryResult = {
        entries: [{ timestamp: 'x', passed: true, errorCount: 0, warningCount: 0, duration: 0, stages: [] }],
      };
      runCli(['history', '-p', '/test/project', '--json']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('['));
    });
  });

  describe('trend command', () => {
    it('displays trend report', () => {
      _analyzeTrendResult = { totalRuns: 5, passRate: 80, direction: 'improving' };
      _formatTrendResult = 'Trend: improving';
      runCli(['trend', '-p', '/test/project']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Trend'));
    });

    it('shows message when no history for trend', () => {
      _analyzeTrendResult = { totalRuns: 0 };
      runCli(['trend', '-p', '/test/project']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No review history'));
    });
  });

  describe('team command', () => {
    it('displays team info', () => {
      runCli(['team']);
      const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(allOutput).toContain('ANTIGRAVITY');
      expect(allOutput).toContain('Planner Agent');
      expect(allOutput).toContain('Pipeline');
    });
  });

  describe('update command', () => {
    it('runs update successfully', () => {
      _runProcessResults = [pr('main\n'), pr('ok'), pr('ok'), pr('ok')];
      runCli(['update']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('업데이트가 완료'));
    });

    it('handles git pull failure', () => {
      // process.exit is mocked (no-op), so execution continues — provide enough results
      _runProcessResults = [pr('main\n'), prErr('error'), pr('ok'), pr('ok')];
      runCli(['update']);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Git pull 실패'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('handles npm install failure', () => {
      _runProcessResults = [pr('main\n'), pr('ok'), prErr('err'), pr('ok')];
      runCli(['update']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('npm install 실패'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('handles build failure', () => {
      _runProcessResults = [pr('main\n'), pr('ok'), pr('ok'), prErr('err')];
      runCli(['update']);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('빌드 실패'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('orchestrate command', () => {
    it('exits with 0 on completed', () => {
      _orchestratorState = { status: 'completed' };
      runCli(['orchestrate', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 on failure', () => {
      _orchestratorState = { status: 'failed' };
      runCli(['orchestrate', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('autonomous command', () => {
    it('exits with 0 on completed', () => {
      _autonomousState = { status: 'completed' };
      runCli(['autonomous', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('exits with 1 on failure', () => {
      _autonomousState = { status: 'failed' };
      runCli(['autonomous', '-p', '/test/project']);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
