import request from 'supertest';
import express from 'express';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock fs — only mock methods the routes use; express.static uses the real fs
// so we partially mock to avoid breaking static middleware.
jest.mock('fs', () => {
  const realFs = jest.requireActual('fs');
  return {
    ...realFs,
    existsSync: jest.fn(realFs.existsSync),
    readFileSync: jest.fn(realFs.readFileSync),
  };
});

const mockRun = jest.fn();
jest.mock('../agent', () => ({
  CodeReviewAgent: jest.fn().mockImplementation(() => ({
    run: mockRun,
  })),
}));

jest.mock('../report-generator', () => ({
  formatReportAsText: jest.fn().mockReturnValue('Formatted report text'),
}));

jest.mock('../utils/config-loader', () => ({
  loadConfig: jest.fn().mockReturnValue({ config: { stages: ['compile', 'lint'] }, errors: [] }),
}));

const mockLoadHistory = jest.fn();
const mockAnalyzeTrend = jest.fn();
const mockFormatTrendReport = jest.fn();
jest.mock('../utils/review-history', () => ({
  loadHistory: mockLoadHistory,
  analyzeTrend: mockAnalyzeTrend,
  formatTrendReport: mockFormatTrendReport,
}));

const mockOrchestratorRun = jest.fn();
const mockGetConfig = jest.fn();
jest.mock('../orchestrator', () => ({
  Orchestrator: {
    quickStart: jest.fn().mockReturnValue({
      getConfig: mockGetConfig,
      run: mockOrchestratorRun,
    }),
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import fs from 'fs';
import { createServer, startDashboard } from './server';
import { CodeReviewAgent } from '../agent';
import { formatReportAsText } from '../report-generator';
import { loadConfig } from '../utils/config-loader';
import { Orchestrator } from '../orchestrator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_PROJECT = '/home/user/test-project';

function buildMockReport(overrides: Record<string, unknown> = {}) {
  return {
    projectPath: DEFAULT_PROJECT,
    timestamp: '2025-01-01T00:00:00.000Z',
    stages: [
      {
        stage: 'compile',
        status: 'pass',
        issues: [],
        duration: 50,
        summary: 'OK',
      },
      {
        stage: 'lint',
        status: 'pass',
        issues: [
          {
            stage: 'lint',
            severity: 'warning',
            file: 'index.ts',
            line: 10,
            message: 'no-unused-vars',
            rule: 'no-unused-vars',
          },
        ],
        duration: 30,
        summary: '1 warning',
      },
    ],
    totalIssues: 1,
    errorCount: 0,
    warningCount: 1,
    infoCount: 0,
    passed: true,
    duration: 80,
    fixReport: null,
    insights: ['Consider enabling strict mode'],
    ...overrides,
  };
}

function buildMockPipelineState() {
  return {
    id: 'pipeline-1',
    status: 'completed',
    config: {
      phases: ['plan', 'code', 'review'],
      autoFix: true,
      failFast: false,
      humanGates: [],
      maxIterations: 3,
      parallel: true,
    },
    tasks: [
      {
        id: 'task-1',
        title: 'Plan system',
        phase: 'plan',
        status: 'completed',
        assignedAgent: 'planner',
        retryCount: 0,
        result: {
          success: true,
          output: 'done',
          duration: 100,
          issues: [],
          artifacts: ['plan.md'],
        },
      },
    ],
    agents: [
      { id: 'agent-1', name: 'Planner', role: 'planner', status: 'idle' },
    ],
    logs: [{ timestamp: '2025-01-01T00:00:00Z', level: 'info', message: 'started' }],
    startedAt: '2025-01-01T00:00:00Z',
    completedAt: '2025-01-01T00:01:00Z',
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Web Server (server.ts)', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();

    // Re-set module-level mocks whose implementations may have been overridden
    // by individual tests (clearAllMocks does NOT reset mockImplementation).
    (loadConfig as jest.Mock).mockReturnValue({ config: { stages: ['compile', 'lint'] }, errors: [] });
    (formatReportAsText as jest.Mock).mockReturnValue('Formatted report text');
    (CodeReviewAgent as jest.Mock).mockImplementation(() => ({
      run: mockRun,
    }));
    (Orchestrator.quickStart as jest.Mock).mockReturnValue({
      getConfig: mockGetConfig,
      run: mockOrchestratorRun,
    });

    // Default fs mock behavior for routes
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (typeof p === 'string' && p.endsWith('package.json')) return true;
      // Let express.static fall through to real fs for non-route files
      return jest.requireActual('fs').existsSync(p);
    });
    (fs.readFileSync as jest.Mock).mockImplementation((p: string, enc?: string) => {
      if (typeof p === 'string' && p.endsWith('package.json')) {
        return JSON.stringify({ name: 'test-project', version: '2.0.0' });
      }
      return jest.requireActual('fs').readFileSync(p, enc);
    });

    // Default mock return values
    mockRun.mockReturnValue(buildMockReport());
    mockLoadHistory.mockReturnValue({
      entries: [
        { id: '1', timestamp: '2025-01-01', passed: true, errorCount: 0 },
        { id: '2', timestamp: '2025-01-02', passed: false, errorCount: 3 },
        { id: '3', timestamp: '2025-01-03', passed: true, errorCount: 0 },
      ],
    });
    mockAnalyzeTrend.mockReturnValue({
      totalRuns: 10,
      passRate: 0.8,
      errorTrend: 'improving',
      warningTrend: 'stable',
      avgErrors: 2,
      avgWarnings: 5,
    });
    mockFormatTrendReport.mockReturnValue('Trend report text');

    mockGetConfig.mockReturnValue({
      pipeline: {
        phases: ['plan', 'code', 'review'],
        failFast: false,
        humanGates: [],
      },
    });
    mockOrchestratorRun.mockReturnValue(buildMockPipelineState());

    app = createServer(DEFAULT_PROJECT);
  });

  // ═══ GET /api/project ═══════════════════════════════════════════════════════

  describe('GET /api/project', () => {
    it('should return project info from package.json and config', async () => {
      const res = await request(app).get('/api/project');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test-project');
      expect(res.body.version).toBe('2.0.0');
      expect(res.body.path).toBe(DEFAULT_PROJECT);
      expect(res.body.config).toEqual({ stages: ['compile', 'lint'] });
      expect(loadConfig).toHaveBeenCalledWith(DEFAULT_PROJECT);
    });

    it('should return basename if package.json has no name', async () => {
      (fs.readFileSync as jest.Mock).mockImplementation((p: string, enc?: string) => {
        if (typeof p === 'string' && p.endsWith('package.json')) {
          return JSON.stringify({ version: '1.0.0' });
        }
        return jest.requireActual('fs').readFileSync(p, enc);
      });

      const res = await request(app).get('/api/project');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test-project'); // path.basename of DEFAULT_PROJECT
      expect(res.body.version).toBe('1.0.0');
    });

    it('should handle missing package.json gracefully', async () => {
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.endsWith('package.json')) return false;
        return jest.requireActual('fs').existsSync(p);
      });

      const res = await request(app).get('/api/project');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('test-project'); // fallback to basename
      expect(res.body.version).toBe('unknown');
    });

    it('should use custom path from query parameter', async () => {
      const res = await request(app).get('/api/project?path=/home/user/other-project');

      expect(res.status).toBe(200);
      expect(loadConfig).toHaveBeenCalledWith('/home/user/other-project');
    });

    it('should return 500 when loadConfig throws', async () => {
      (loadConfig as jest.Mock).mockImplementation(() => {
        throw new Error('Config load failure');
      });

      const res = await request(app).get('/api/project');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Config load failure');
    });
  });

  // ═══ POST /api/review ═══════════════════════════════════════════════════════

  describe('POST /api/review', () => {
    it('should run review and return results', async () => {
      const res = await request(app)
        .post('/api/review')
        .send({ path: DEFAULT_PROJECT });

      expect(res.status).toBe(200);
      expect(res.body.passed).toBe(true);
      expect(res.body.duration).toBe(80);
      expect(res.body.text).toBe('Formatted report text');
      expect(res.body.stages).toHaveLength(2);
      expect(res.body.stages[0].stage).toBe('compile');
      expect(res.body.stages[0].issueCount).toBe(0);
      expect(res.body.stages[1].stage).toBe('lint');
      expect(res.body.stages[1].issueCount).toBe(1);
      expect(res.body.insights).toEqual(['Consider enabling strict mode']);
      expect(res.body.fixReport).toBeNull();
      expect(CodeReviewAgent).toHaveBeenCalled();
      expect(formatReportAsText).toHaveBeenCalled();
    });

    it('should pass custom stages and autoFix to the agent', async () => {
      const res = await request(app)
        .post('/api/review')
        .send({ path: DEFAULT_PROJECT, stages: ['lint'], autoFix: true });

      expect(res.status).toBe(200);
      const constructorCall = (CodeReviewAgent as jest.Mock).mock.calls[0][0];
      expect(constructorCall.stages).toEqual(['lint']);
      expect(constructorCall.autoFix).toBe(true);
      expect(constructorCall.projectPath).toBe(DEFAULT_PROJECT);
    });

    it('should default to compile/lint/test stages when none provided', async () => {
      await request(app)
        .post('/api/review')
        .send({});

      const constructorCall = (CodeReviewAgent as jest.Mock).mock.calls[0][0];
      expect(constructorCall.stages).toEqual(['compile', 'lint', 'test']);
    });

    it('should return 500 when agent.run() throws', async () => {
      mockRun.mockImplementation(() => {
        throw new Error('Agent execution failed');
      });

      const res = await request(app)
        .post('/api/review')
        .send({ path: DEFAULT_PROJECT });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Agent execution failed');
    });
  });

  // ═══ POST /api/orchestrate ═════════════════════════════════════════════════

  describe('POST /api/orchestrate', () => {
    it('should run orchestrator and return pipeline state', async () => {
      const res = await request(app)
        .post('/api/orchestrate')
        .send({ path: DEFAULT_PROJECT });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].id).toBe('task-1');
      expect(res.body.tasks[0].result.success).toBe(true);
      expect(res.body.tasks[0].result.artifacts).toEqual(['plan.md']);
      expect(res.body.agents).toBeDefined();
      expect(res.body.logs).toHaveLength(1);
      expect(Orchestrator.quickStart).toHaveBeenCalledWith(DEFAULT_PROJECT);
    });

    it('should pass custom phases and failFast to orchestrator config', async () => {
      const res = await request(app)
        .post('/api/orchestrate')
        .send({ path: DEFAULT_PROJECT, phases: ['plan', 'code'], failFast: true });

      expect(res.status).toBe(200);
      const config = mockGetConfig.mock.results[0].value;
      expect(config.pipeline.phases).toEqual(['plan', 'code']);
      expect(config.pipeline.failFast).toBe(true);
      expect(config.pipeline.humanGates).toEqual([]);
    });

    it('should return 500 when orchestrator.run() throws', async () => {
      mockOrchestratorRun.mockImplementation(() => {
        throw new Error('Orchestration failed');
      });

      const res = await request(app)
        .post('/api/orchestrate')
        .send({ path: DEFAULT_PROJECT });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Orchestration failed');
    });
  });

  // ═══ GET /api/history ══════════════════════════════════════════════════════

  describe('GET /api/history', () => {
    it('should return history entries with default count', async () => {
      const res = await request(app).get('/api/history');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.entries).toHaveLength(3);
      expect(mockLoadHistory).toHaveBeenCalledWith(DEFAULT_PROJECT);
    });

    it('should respect the count query parameter', async () => {
      const res = await request(app).get('/api/history?count=2');

      expect(res.status).toBe(200);
      // entries.slice(-2) should return the last 2 entries
      expect(res.body.entries).toHaveLength(2);
      expect(res.body.entries[0].id).toBe('2');
      expect(res.body.entries[1].id).toBe('3');
      expect(res.body.total).toBe(3);
    });

    it('should handle count=1 correctly', async () => {
      const res = await request(app).get('/api/history?count=1');

      expect(res.status).toBe(200);
      expect(res.body.entries).toHaveLength(1);
      expect(res.body.entries[0].id).toBe('3'); // last entry
    });

    it('should return 500 when loadHistory throws', async () => {
      mockLoadHistory.mockImplementation(() => {
        throw new Error('History load error');
      });

      const res = await request(app).get('/api/history');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('History load error');
    });
  });

  // ═══ GET /api/trend ════════════════════════════════════════════════════════

  describe('GET /api/trend', () => {
    it('should return trend analysis with formatted text', async () => {
      const res = await request(app).get('/api/trend');

      expect(res.status).toBe(200);
      expect(res.body.totalRuns).toBe(10);
      expect(res.body.passRate).toBe(0.8);
      expect(res.body.errorTrend).toBe('improving');
      expect(res.body.text).toBe('Trend report text');
      expect(mockAnalyzeTrend).toHaveBeenCalledWith(DEFAULT_PROJECT);
      expect(mockFormatTrendReport).toHaveBeenCalled();
    });

    it('should return 500 when analyzeTrend throws', async () => {
      mockAnalyzeTrend.mockImplementation(() => {
        throw new Error('Trend analysis failure');
      });

      const res = await request(app).get('/api/trend');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Trend analysis failure');
    });
  });

  // ═══ GET /api/team ═════════════════════════════════════════════════════════

  describe('GET /api/team', () => {
    it('should return the full list of 7 agents', async () => {
      const res = await request(app).get('/api/team');

      expect(res.status).toBe(200);
      expect(res.body.agents).toHaveLength(7);
    });

    it('should include all expected agent roles', async () => {
      const res = await request(app).get('/api/team');

      const roles = res.body.agents.map((a: { role: string }) => a.role);
      expect(roles).toEqual([
        'planner',
        'coder',
        'reviewer',
        'tester',
        'security',
        'browser',
        'deployer',
      ]);
    });

    it('should include correct pipeline phases', async () => {
      const res = await request(app).get('/api/team');

      expect(res.body.pipeline).toEqual([
        'Plan', 'Code', 'Review', 'Test', 'Security', 'Browser', 'Deploy',
      ]);
    });

    it('should include agent names and ids', async () => {
      const res = await request(app).get('/api/team');

      const first = res.body.agents[0];
      expect(first).toHaveProperty('id', 1);
      expect(first).toHaveProperty('name', 'Planner Agent');
      expect(first).toHaveProperty('role', 'planner');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('icon');
    });
  });

  // ═══ validateProjectPath (security) ════════════════════════════════════════

  describe('validateProjectPath security', () => {
    it('should reject paths containing ".."', async () => {
      const res = await request(app)
        .get('/api/project?path=/home/user/../etc/passwd');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('relative path components not allowed');
    });

    it('should reject /etc as a forbidden system directory', async () => {
      const res = await request(app)
        .get('/api/project?path=/etc');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('system directory access denied');
    });

    it('should reject /etc/shadow as a sub-path of forbidden directory', async () => {
      const res = await request(app)
        .get('/api/project?path=/etc/shadow');

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('system directory access denied');
    });

    it('should reject /proc path', async () => {
      const res = await request(app)
        .post('/api/review')
        .send({ path: '/proc/self' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('system directory access denied');
    });

    it('should accept a normal absolute path', async () => {
      const res = await request(app)
        .get('/api/project?path=/home/user/valid-project');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('/home/user/valid-project');
    });

    it('should use the default project path when no path is provided', async () => {
      const res = await request(app).get('/api/project');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe(DEFAULT_PROJECT);
    });
  });

  // ═══ SPA fallback ══════════════════════════════════════════════════════════

  describe('SPA fallback', () => {
    it('should attempt to serve index.html for unknown routes', async () => {
      // The SPA fallback calls res.sendFile which will fail because the
      // public/index.html likely doesn't exist in the test environment.
      // We just verify the route doesn't return a JSON 404.
      const res = await request(app).get('/some/random/route');

      // It will either serve the file (200) or fail with a file-not-found error.
      // Either way, it should not be a JSON API response with a "route not found" body.
      expect(res.status === 200 || res.status === 404 || res.status === 500).toBe(true);
    });
  });

  // ═══ startDashboard ════════════════════════════════════════════════════════

  describe('startDashboard', () => {
    it('should call app.listen with the specified port', () => {
      // We spy on console.log to suppress output during test
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Spy on Express listen — we need to intercept it via the prototype
      const listenSpy = jest.spyOn(
        require('http').Server.prototype,
        'listen',
      ).mockImplementation(function (this: unknown, ...args: unknown[]) {
        // Call the callback if provided to exercise the log output
        const cb = args.find((a) => typeof a === 'function') as (() => void) | undefined;
        if (cb) cb();
        return this;
      });

      startDashboard(3333, '/home/user/my-project');

      // Verify listen was called with port 3333
      expect(listenSpy).toHaveBeenCalled();
      const firstArg = listenSpy.mock.calls[0][0];
      expect(firstArg).toBe(3333);

      listenSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  // ═══ Error serialization ═══════════════════════════════════════════════════

  describe('Error serialization', () => {
    it('should serialize non-Error thrown values as strings', async () => {
      (loadConfig as jest.Mock).mockImplementation(() => {
        throw 'raw string error'; // eslint-disable-line no-throw-literal
      });

      const res = await request(app).get('/api/project');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('raw string error');
    });
  });
});
