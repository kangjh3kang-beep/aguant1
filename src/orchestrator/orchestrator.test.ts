import { Orchestrator } from './orchestrator';
import { PipelineEngine } from './pipeline';
import { createAgent } from './sub-agents';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('{}'),
  readdirSync: jest.fn().mockReturnValue([]),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('child_process', () => ({
  execSync: jest.fn().mockReturnValue(''),
}));

// 기존 코드리뷰 에이전트 모킹
jest.mock('../agent', () => ({
  CodeReviewAgent: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockReturnValue({
      projectPath: '/test',
      timestamp: new Date().toISOString(),
      stages: [],
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      passed: true,
      duration: 100,
    }),
    getTrendReport: jest.fn().mockReturnValue(''),
  })),
}));

jest.mock('../report-generator', () => ({
  formatReportAsText: jest.fn().mockReturnValue('Report text'),
}));

jest.mock('../utils/review-history', () => ({
  saveToHistory: jest.fn(),
  compareWithPrevious: jest.fn().mockReturnValue([]),
  analyzeTrend: jest.fn().mockReturnValue({ totalRuns: 0 }),
  formatTrendReport: jest.fn().mockReturnValue(''),
}));

describe('Orchestrator', () => {
  it('should create via quickStart', () => {
    const orchestrator = Orchestrator.quickStart('/test/project', 'Test project');
    const config = orchestrator.getConfig();

    expect(config.project.name).toBe('project');
    expect(config.project.rootPath).toBe('/test/project');
    expect(config.pipeline.phases).toHaveLength(7);
  });

  it('should run full pipeline', () => {
    const orchestrator = Orchestrator.quickStart('/test/project');
    const state = orchestrator.run();

    expect(state.status).toBeDefined();
    expect(['completed', 'failed']).toContain(state.status);
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.logs.length).toBeGreaterThan(0);
  });

  it('should run specific phases', () => {
    const orchestrator = Orchestrator.quickStart('/test/project');
    const state = orchestrator.runPhase(['plan', 'review']);

    expect(state.tasks.some((t) => t.phase === 'plan')).toBe(true);
    expect(state.tasks.some((t) => t.phase === 'review')).toBe(true);
    expect(state.tasks.some((t) => t.phase === 'deploy')).toBe(false);
  });
});

describe('createAgent', () => {
  it('should create agents for all roles', () => {
    const roles = ['planner', 'coder', 'reviewer', 'tester', 'security', 'browser', 'deployer'] as const;

    for (const role of roles) {
      const agent = createAgent({ role, concurrency: 1, maxRetries: 3, timeout: 60000 });
      expect(agent.getRole()).toBe(role);
      expect(agent.getInfo().name).toBeDefined();
      expect(agent.getInfo().capabilities.length).toBeGreaterThan(0);
    }
  });

  it('should throw for unknown role', () => {
    expect(() => createAgent({ role: 'unknown' as never, concurrency: 1, maxRetries: 3, timeout: 60000 }))
      .toThrow('Unknown agent role');
  });
});

describe('PipelineEngine', () => {
  it('should format logs', () => {
    const project = {
      name: 'test',
      description: 'Test',
      rootPath: '/test',
      techStack: { language: 'typescript' as const },
      requirements: [],
    };
    const engine = new PipelineEngine(project, { phases: ['plan'], autoFix: false, failFast: false, humanGates: [], maxIterations: 1, parallel: false });
    engine.run();

    const logs = engine.formatLogs();
    expect(logs).toContain('Antigravity');
    expect(logs).toContain('test');
  });
});
