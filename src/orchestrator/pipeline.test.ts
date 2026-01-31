/**
 * PipelineEngine — comprehensive unit tests
 *
 * Mocks all three dependency layers:
 *   ./task-manager      — task decomposition & status helpers
 *   ./sub-agents        — agent factory & base class
 *   ./shared-knowledge  — SharedKnowledgeBase, EventBus, ContextChain
 */

import {
  ProjectSpec,
  DEFAULT_PIPELINE_CONFIG,
  PipelineState,
  PipelineConfig,
  Task,
  TaskPhase,
  TaskResult,
  SubAgentInfo,
  SubAgentConfig,
} from './types';

// ─── Mock: task-manager ──────────────────────────────────

const mockDecomposeProject = jest.fn<Task[], [ProjectSpec, TaskPhase[]]>();
const mockGetReadyTasks = jest.fn<Task[], [Task[]]>();
const mockIsPhaseComplete = jest.fn<boolean, [Task[], TaskPhase]>();
const mockHasPhaseFailure = jest.fn<boolean, [Task[], TaskPhase]>();
const mockUpdateTaskStatus = jest.fn<Task, [Task, string, TaskResult?]>();
const mockRetryTask = jest.fn<Task | null, [Task]>();
const mockGetProgress = jest.fn();

jest.mock('./task-manager', () => ({
  decomposeProject: (...args: unknown[]) => mockDecomposeProject(args[0] as ProjectSpec, args[1] as TaskPhase[]),
  getReadyTasks: (...args: unknown[]) => mockGetReadyTasks(args[0] as Task[]),
  isPhaseComplete: (...args: unknown[]) => mockIsPhaseComplete(args[0] as Task[], args[1] as TaskPhase),
  hasPhaseFailure: (...args: unknown[]) => mockHasPhaseFailure(args[0] as Task[], args[1] as TaskPhase),
  updateTaskStatus: (...args: unknown[]) => mockUpdateTaskStatus(args[0] as Task, args[1] as string, args[2] as TaskResult | undefined),
  retryTask: (...args: unknown[]) => mockRetryTask(args[0] as Task),
  getProgress: (...args: unknown[]) => mockGetProgress(args[0]),
}));

// ─── Mock: sub-agents ────────────────────────────────────

const mockAgentRun = jest.fn<TaskResult, [Task, string]>();
const mockAgentGetInfo = jest.fn<SubAgentInfo, []>();
const mockAgentConnectKnowledge = jest.fn();

const mockCreateAgent = jest.fn();
const mockCreateDefaultAgentConfigs = jest.fn<SubAgentConfig[], []>();

jest.mock('./sub-agents', () => ({
  BaseSubAgent: jest.fn(),
  createAgent: (...args: unknown[]) => mockCreateAgent(args[0]),
  createDefaultAgentConfigs: () => mockCreateDefaultAgentConfigs(),
}));

// ─── Mock: shared-knowledge ──────────────────────────────

const mockKBAddInsight = jest.fn();
const mockKBGetInsights = jest.fn().mockReturnValue([]);
const mockKBGetByAgent = jest.fn().mockReturnValue([]);
const mockKBGetByCategory = jest.fn().mockReturnValue([]);
const mockKBGetByPhase = jest.fn().mockReturnValue([]);
const mockKBGetAll = jest.fn().mockReturnValue([]);
const mockKBSize = jest.fn().mockReturnValue(0);
const mockKBBuildSummary = jest.fn().mockReturnValue('Summary\nLine2\nLine3\nLine4');
const mockKBBuildContextForAgent = jest.fn().mockReturnValue('');

const mockEventBusOn = jest.fn();
const mockEventBusEmit = jest.fn();

const mockContextChainAddPhaseResult = jest.fn();
const mockContextChainGetPhaseResult = jest.fn();
const mockContextChainGetAll = jest.fn().mockReturnValue([]);
const mockContextChainBuildContextForNextPhase = jest.fn().mockReturnValue('');

jest.mock('./shared-knowledge', () => ({
  SharedKnowledgeBase: jest.fn().mockImplementation(() => ({
    addInsight: mockKBAddInsight,
    getInsights: mockKBGetInsights,
    getByAgent: mockKBGetByAgent,
    getByCategory: mockKBGetByCategory,
    getByPhase: mockKBGetByPhase,
    getAll: mockKBGetAll,
    getAllInsights: mockKBGetAll,
    size: mockKBSize,
    buildSummary: mockKBBuildSummary,
    buildContextForAgent: mockKBBuildContextForAgent,
    getCritical: jest.fn().mockReturnValue([]),
    getByFile: jest.fn().mockReturnValue([]),
    clear: jest.fn(),
  })),
  EventBus: jest.fn().mockImplementation(() => ({
    on: mockEventBusOn,
    emit: mockEventBusEmit,
    getLog: jest.fn().mockReturnValue([]),
    clear: jest.fn(),
  })),
  ContextChain: jest.fn().mockImplementation(() => ({
    addPhaseResult: mockContextChainAddPhaseResult,
    getPhaseResult: mockContextChainGetPhaseResult,
    getAll: mockContextChainGetAll,
    getAllContexts: mockContextChainGetAll,
    buildContextForNextPhase: mockContextChainBuildContextForNextPhase,
    clear: jest.fn(),
  })),
}));

// ─── Import under test (AFTER mocks) ────────────────────

import { PipelineEngine } from './pipeline';

// ─── Helpers ─────────────────────────────────────────────

const defaultProject: ProjectSpec = {
  name: 'test',
  description: 'test',
  rootPath: '/tmp/test',
  techStack: { language: 'typescript' },
  requirements: [],
};

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    phase: 'plan',
    title: 'Test Task',
    description: 'A test task',
    assignedAgent: 'planner',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeAgentInfo(role: string = 'planner'): SubAgentInfo {
  return {
    id: `${role}-1`,
    name: `${role.charAt(0).toUpperCase() + role.slice(1)}Agent`,
    role: role as SubAgentInfo['role'],
    status: 'idle',
    capabilities: ['test'],
    completedTasks: 0,
    failedTasks: 0,
    avgDuration: 0,
  };
}

function makeSuccessResult(): TaskResult {
  return {
    success: true,
    output: 'Task completed successfully',
    artifacts: ['artifact.ts'],
    issues: [],
    duration: 100,
  };
}

function makeFailureResult(): TaskResult {
  return {
    success: false,
    output: 'Task failed',
    artifacts: [],
    issues: [{ severity: 'error', message: 'Something broke', autoFixable: false }],
    duration: 50,
  };
}

/**
 * Sets up the default happy-path mocks for a given set of phases and tasks.
 */
function setupHappyPathMocks(tasks: Task[]): void {
  mockDecomposeProject.mockReturnValue(tasks);

  // getReadyTasks: first call returns tasks for current phase, second call returns [] to end the while loop
  let callCount = 0;
  mockGetReadyTasks.mockImplementation((allTasks: Task[]) => {
    callCount++;
    // On odd calls return tasks, on even calls return [] to exit the while loop
    if (callCount % 2 === 1) {
      return tasks.filter((t) => t.status === 'pending');
    }
    return [];
  });

  mockIsPhaseComplete.mockReturnValue(true);
  mockHasPhaseFailure.mockReturnValue(false);
  mockGetProgress.mockReturnValue({ total: tasks.length, completed: tasks.length, failed: 0, inProgress: 0, percent: 100 });

  mockUpdateTaskStatus.mockImplementation((task: Task, status: string, result?: TaskResult) => ({
    ...task,
    status: status as Task['status'],
    result,
  }));

  mockAgentRun.mockReturnValue(makeSuccessResult());
  mockAgentGetInfo.mockReturnValue(makeAgentInfo('planner'));
  mockAgentConnectKnowledge.mockReturnValue(undefined);

  mockCreateDefaultAgentConfigs.mockReturnValue([
    { role: 'planner', concurrency: 1, maxRetries: 3, timeout: 300000 },
  ] as SubAgentConfig[]);

  mockCreateAgent.mockReturnValue({
    run: mockAgentRun,
    getInfo: mockAgentGetInfo,
    connectKnowledge: mockAgentConnectKnowledge,
  });
}

// ─── Tests ───────────────────────────────────────────────

describe('PipelineEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKBSize.mockReturnValue(0);
    mockKBGetByPhase.mockReturnValue([]);
    mockKBBuildSummary.mockReturnValue('Summary\nLine2\nLine3\nLine4');
  });

  // ═══════════════════════════════════════════════════════
  // 1. Constructor
  // ═══════════════════════════════════════════════════════

  describe('constructor', () => {
    it('should create a pipeline with default config when no config is provided', () => {
      const tasks = [makeTask()];
      setupHappyPathMocks(tasks);

      const engine = new PipelineEngine(defaultProject);
      const state = engine.getState();

      expect(state.status).toBe('idle');
      expect(state.project.name).toBe('test');
      expect(state.config.phases).toEqual(DEFAULT_PIPELINE_CONFIG.phases);
      expect(state.config.maxIterations).toBe(DEFAULT_PIPELINE_CONFIG.maxIterations);
      expect(state.config.failFast).toBe(DEFAULT_PIPELINE_CONFIG.failFast);
      expect(state.config.autoFix).toBe(DEFAULT_PIPELINE_CONFIG.autoFix);
    });

    it('should merge custom config with defaults', () => {
      const tasks = [makeTask()];
      setupHappyPathMocks(tasks);

      const customConfig: Partial<PipelineConfig> = {
        phases: ['plan', 'code'],
        failFast: true,
        maxIterations: 5,
      };

      const engine = new PipelineEngine(defaultProject, customConfig);
      const state = engine.getState();

      expect(state.config.phases).toEqual(['plan', 'code']);
      expect(state.config.failFast).toBe(true);
      expect(state.config.maxIterations).toBe(5);
      // Defaults preserved for unspecified fields
      expect(state.config.autoFix).toBe(DEFAULT_PIPELINE_CONFIG.autoFix);
    });

    it('should initialize agents via createDefaultAgentConfigs and createAgent', () => {
      const tasks = [makeTask()];
      setupHappyPathMocks(tasks);

      new PipelineEngine(defaultProject);

      expect(mockCreateDefaultAgentConfigs).toHaveBeenCalledTimes(1);
      expect(mockCreateAgent).toHaveBeenCalledTimes(1);
      expect(mockAgentConnectKnowledge).toHaveBeenCalledTimes(1);
    });

    it('should decompose project into tasks', () => {
      const tasks = [makeTask(), makeTask({ id: 'task-2', title: 'Second Task' })];
      setupHappyPathMocks(tasks);

      const engine = new PipelineEngine(defaultProject);
      const state = engine.getState();

      expect(mockDecomposeProject).toHaveBeenCalledWith(defaultProject, expect.any(Array));
      expect(state.tasks).toHaveLength(2);
    });

    it('should set initial state fields correctly', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject);
      const state = engine.getState();

      expect(state.id).toMatch(/^pipeline-/);
      expect(state.iteration).toBe(0);
      expect(state.logs).toEqual([]);
      expect(state.startedAt).toBeDefined();
      expect(state.completedAt).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // 2. run() — happy path
  // ═══════════════════════════════════════════════════════

  describe('run() — happy path', () => {
    it('should execute all phases and return completed state', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner' });
      setupHappyPathMocks([task]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('completed');
      expect(result.completedAt).toBeDefined();
    });

    it('should log pipeline start information', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();
      const state = engine.getState();

      const messages = state.logs.map((l) => l.message);
      expect(messages).toContain('Pipeline started');
      expect(messages.some((m) => m.includes('Project: test'))).toBe(true);
      expect(messages.some((m) => m.includes('Phases:'))).toBe(true);
      expect(messages.some((m) => m.includes('Knowledge sharing: ENABLED'))).toBe(true);
    });

    it('should emit phase:started events for each phase', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();

      // At minimum: one initial pipeline start emit + one for the plan phase
      expect(mockEventBusEmit).toHaveBeenCalled();
      const emitCalls = mockEventBusEmit.mock.calls.map((c) => c[0]);
      const phaseStarted = emitCalls.filter((e) => e.type === 'phase:started');
      expect(phaseStarted.length).toBeGreaterThanOrEqual(1);
    });

    it('should call agent.run for each ready task', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner' });
      setupHappyPathMocks([task]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();

      expect(mockAgentRun).toHaveBeenCalled();
    });

    it('should store phase context via ContextChain after each phase', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();

      expect(mockContextChainAddPhaseResult).toHaveBeenCalled();
      const contextArg = mockContextChainAddPhaseResult.mock.calls[0][0];
      expect(contextArg.phase).toBe('plan');
      expect(contextArg.agent).toBe('planner');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 3. run() — failure scenarios
  // ═══════════════════════════════════════════════════════

  describe('run() — failure scenarios', () => {
    it('should set status to failed when phase has failures and failFast is true', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner' });
      setupHappyPathMocks([task]);

      // Override: phase has failure
      mockHasPhaseFailure.mockReturnValue(true);
      mockIsPhaseComplete.mockReturnValue(false);
      mockGetProgress.mockReturnValue({ total: 1, completed: 0, failed: 1, inProgress: 0, percent: 0 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: true,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('failed');
    });

    it('should set status to failed when getProgress reports failed tasks at the end', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner' });
      setupHappyPathMocks([task]);

      // Phase itself passes, but final progress shows failures
      mockHasPhaseFailure.mockReturnValue(false);
      mockIsPhaseComplete.mockReturnValue(true);
      mockGetProgress.mockReturnValue({ total: 2, completed: 1, failed: 1, inProgress: 0, percent: 50 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('failed');
    });

    it('should set status to failed when an exception is thrown during execution', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner' });
      setupHappyPathMocks([task]);

      // getReadyTasks throws to simulate a crash
      mockGetReadyTasks.mockImplementation(() => {
        throw new Error('Unexpected crash');
      });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('failed');
      const errorLogs = result.logs.filter((l) => l.level === 'error');
      expect(errorLogs.some((l) => l.message.includes('Pipeline crashed'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 4. run() — retry logic
  // ═══════════════════════════════════════════════════════

  describe('run() — retry logic', () => {
    it('should retry failed tasks when failFast is false and iterations remain', () => {
      const task = makeTask({ phase: 'plan', assignedAgent: 'planner', status: 'failed' });
      const retriedTask = makeTask({ phase: 'plan', assignedAgent: 'planner', id: 'task-1', retryCount: 1 });
      setupHappyPathMocks([task]);

      // Phase has failure on first check
      mockHasPhaseFailure.mockReturnValue(true);
      mockIsPhaseComplete.mockReturnValue(false);

      // retryTask returns a reset task
      mockRetryTask.mockReturnValue(retriedTask);

      // After retry, agent succeeds
      mockAgentRun.mockReturnValue(makeSuccessResult());

      mockGetProgress.mockReturnValue({ total: 1, completed: 1, failed: 0, inProgress: 0, percent: 100 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      // Manually set the task to 'failed' so retryFailedTasks finds it
      (engine as unknown as { state: PipelineState }).state.tasks = [
        { ...task, status: 'failed' },
      ];

      engine.run();

      expect(mockRetryTask).toHaveBeenCalled();
    });

    it('should log max retries exceeded when retryTask returns null', () => {
      const failedTask = makeTask({ phase: 'plan', assignedAgent: 'planner', status: 'failed', retryCount: 3 });
      setupHappyPathMocks([failedTask]);

      mockHasPhaseFailure.mockReturnValue(true);
      mockIsPhaseComplete.mockReturnValue(false);
      mockRetryTask.mockReturnValue(null);
      mockGetProgress.mockReturnValue({ total: 1, completed: 0, failed: 1, inProgress: 0, percent: 0 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      // Inject the failed task into state
      (engine as unknown as { state: PipelineState }).state.tasks = [failedTask];

      const result = engine.run();

      const errorLogs = result.logs.filter((l) => l.level === 'error');
      expect(errorLogs.some((l) => l.message.includes('Max retries exceeded'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 5. run() — human gates
  // ═══════════════════════════════════════════════════════

  describe('run() — human gates', () => {
    it('should pause and return when a phase is a human gate', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: ['plan'],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('paused');
      const warnLogs = result.logs.filter((l) => l.level === 'warn');
      expect(warnLogs.some((l) => l.message.includes('Human gate'))).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  // 6. getState()
  // ═══════════════════════════════════════════════════════

  describe('getState()', () => {
    it('should return a copy of the current state', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject);
      const state1 = engine.getState();
      const state2 = engine.getState();

      expect(state1).toEqual(state2);
      // Should be a copy, not the same reference
      expect(state1).not.toBe(state2);
    });

    it('should reflect status changes after run()', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      expect(engine.getState().status).toBe('idle');

      engine.run();

      expect(engine.getState().status).toBe('completed');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 7. Accessor methods
  // ═══════════════════════════════════════════════════════

  describe('getKnowledgeBase(), getEventBus(), getContextChain()', () => {
    it('should return a non-null SharedKnowledgeBase instance', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject);
      const kb = engine.getKnowledgeBase();

      expect(kb).toBeDefined();
      expect(kb).not.toBeNull();
      expect(typeof kb.addInsight).toBe('function');
      expect(typeof kb.size).toBe('function');
    });

    it('should return a non-null EventBus instance', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject);
      const bus = engine.getEventBus();

      expect(bus).toBeDefined();
      expect(bus).not.toBeNull();
      expect(typeof bus.on).toBe('function');
      expect(typeof bus.emit).toBe('function');
    });

    it('should return a non-null ContextChain instance', () => {
      setupHappyPathMocks([makeTask()]);

      const engine = new PipelineEngine(defaultProject);
      const chain = engine.getContextChain();

      expect(chain).toBeDefined();
      expect(chain).not.toBeNull();
      expect(typeof chain.addPhaseResult).toBe('function');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 8. formatLogs()
  // ═══════════════════════════════════════════════════════

  describe('formatLogs()', () => {
    it('should return a non-empty formatted string', () => {
      setupHappyPathMocks([makeTask()]);
      mockGetProgress.mockReturnValue({ total: 1, completed: 1, failed: 0, inProgress: 0, percent: 100 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();
      const formatted = engine.formatLogs();

      expect(formatted.length).toBeGreaterThan(0);
      expect(formatted).toContain('Antigravity');
      expect(formatted).toContain('test');
      expect(formatted).toContain('[Agents]');
      expect(formatted).toContain('[Tasks]');
      expect(formatted).toContain('[Knowledge Base]');
      expect(formatted).toContain('[Execution Log]');
    });

    it('should include project name and status in formatted output', () => {
      setupHappyPathMocks([makeTask()]);
      mockGetProgress.mockReturnValue({ total: 1, completed: 1, failed: 0, inProgress: 0, percent: 100 });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      engine.run();
      const formatted = engine.formatLogs();

      expect(formatted).toContain('Project:    test');
      expect(formatted).toContain('COMPLETED');
    });
  });

  // ═══════════════════════════════════════════════════════
  // 9. Multi-phase execution
  // ═══════════════════════════════════════════════════════

  describe('multi-phase execution', () => {
    it('should execute multiple phases in order', () => {
      const planTask = makeTask({ id: 'task-plan', phase: 'plan', assignedAgent: 'planner' });
      const codeTask = makeTask({ id: 'task-code', phase: 'code', assignedAgent: 'coder' });

      const allTasks = [planTask, codeTask];

      mockDecomposeProject.mockReturnValue(allTasks);

      // getReadyTasks alternates: return matching tasks then empty
      let readyCallCount = 0;
      mockGetReadyTasks.mockImplementation((tasks: Task[]) => {
        readyCallCount++;
        if (readyCallCount === 1) return [planTask];
        if (readyCallCount === 3) return [codeTask];
        return [];
      });

      mockIsPhaseComplete.mockReturnValue(true);
      mockHasPhaseFailure.mockReturnValue(false);
      mockGetProgress.mockReturnValue({ total: 2, completed: 2, failed: 0, inProgress: 0, percent: 100 });

      mockUpdateTaskStatus.mockImplementation((task: Task, status: string, result?: TaskResult) => ({
        ...task,
        status: status as Task['status'],
        result,
      }));

      mockAgentRun.mockReturnValue(makeSuccessResult());
      mockAgentGetInfo.mockReturnValue(makeAgentInfo('planner'));

      mockCreateDefaultAgentConfigs.mockReturnValue([
        { role: 'planner', concurrency: 1, maxRetries: 3, timeout: 300000 },
        { role: 'coder', concurrency: 1, maxRetries: 3, timeout: 300000 },
      ] as SubAgentConfig[]);

      mockCreateAgent.mockReturnValue({
        run: mockAgentRun,
        getInfo: mockAgentGetInfo,
        connectKnowledge: mockAgentConnectKnowledge,
      });

      const engine = new PipelineEngine(defaultProject, {
        phases: ['plan', 'code'],
        humanGates: [],
        failFast: false,
        maxIterations: 3,
        autoFix: true,
        parallel: false,
      });

      const result = engine.run();

      expect(result.status).toBe('completed');
      // ContextChain should have been called for both phases
      expect(mockContextChainAddPhaseResult).toHaveBeenCalledTimes(2);
    });
  });
});
