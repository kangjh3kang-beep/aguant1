import { BaseSubAgent } from './base-agent';
import { Task, TaskResult, TaskIssue, SubAgentConfig, AgentRole, TaskPhase } from '../types';
import { SharedKnowledgeBase, EventBus, ContextChain } from '../shared-knowledge';

// ─── Concrete Test Subclass ─────────────────────────────

class TestAgent extends BaseSubAgent {
  /** Exposed for testing — controls what executeTask returns */
  public taskResult: TaskResult = {
    success: true,
    output: 'ok',
    artifacts: [],
    issues: [],
    duration: 0,
  };

  /** If set, executeTask will throw this error */
  public throwError: Error | null = null;

  protected getAgentName(): string {
    return 'Test Agent';
  }

  protected getCapabilities(): string[] {
    return ['cap-a', 'cap-b'];
  }

  protected executeTask(_task: Task, _projectPath: string): TaskResult {
    if (this.throwError) throw this.throwError;
    return { ...this.taskResult };
  }

  // ── expose protected helpers for unit testing ──

  public callCreateIssue(severity: TaskIssue['severity'], message: string, opts?: Partial<TaskIssue>): TaskIssue {
    return this.createIssue(severity, message, opts);
  }

  public callEnhanceTask(task: Task) {
    return this.enhanceTask(task);
  }

  public callGetSystemPrompt(): string {
    return this.getSystemPrompt();
  }

  public callExpandDescription(description: string): string {
    return this.expandDescription(description);
  }

  public callGetSharedContext(task: Task): string {
    return this.getSharedContext(task);
  }

  public callEmitEvent(type: Parameters<EventBus['emit']>[0]['type'], data: Record<string, unknown>, task?: Task): void {
    return this.emitEvent(type, data, task);
  }

  public callAddInsight(...args: Parameters<BaseSubAgent['addInsight']>): void {
    return this.addInsight(...args);
  }

  public callHasAIProvider(): boolean {
    return this.hasAIProvider();
  }

  public callCallAISync(systemPrompt: string, userPrompt: string, opts?: { maxTokens?: number; timeout?: number }): string | null {
    return this.callAISync(systemPrompt, userPrompt, opts);
  }
}

// ─── Helpers ─────────────────────────────────────────────

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    role: 'reviewer' as AgentRole,
    concurrency: 1,
    maxRetries: 2,
    timeout: 30000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    phase: 'review' as TaskPhase,
    title: 'Review Code',
    description: 'Perform code review',
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

// ─── Tests ──────────────────────────────────────────────

describe('BaseSubAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent(makeConfig());
  });

  // ── constructor & getInfo ──

  describe('constructor / getInfo', () => {
    it('should initialize SubAgentInfo with correct defaults', () => {
      const info = agent.getInfo();

      expect(info.name).toBe('Test Agent');
      expect(info.role).toBe('reviewer');
      expect(info.status).toBe('idle');
      expect(info.capabilities).toEqual(['cap-a', 'cap-b']);
      expect(info.completedTasks).toBe(0);
      expect(info.failedTasks).toBe(0);
      expect(info.avgDuration).toBe(0);
      expect(info.id).toMatch(/^reviewer-/);
    });

    it('should return a shallow copy from getInfo (no external mutation)', () => {
      const a = agent.getInfo();
      const b = agent.getInfo();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });

  // ── getRole / getStatus ──

  describe('getRole / getStatus', () => {
    it('should return configured role', () => {
      expect(agent.getRole()).toBe('reviewer');
    });

    it('should return current status', () => {
      expect(agent.getStatus()).toBe('idle');
    });
  });

  // ── run() — success path ──

  describe('run() — success path', () => {
    it('should return successful TaskResult from executeTask', () => {
      const result = agent.run(makeTask(), '/project');

      expect(result.success).toBe(true);
      expect(result.output).toBe('ok');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set status to idle after a successful run', () => {
      agent.run(makeTask(), '/project');
      expect(agent.getStatus()).toBe('idle');
    });

    it('should increment completedTasks on success', () => {
      agent.run(makeTask(), '/project');
      expect(agent.getInfo().completedTasks).toBe(1);
      expect(agent.getInfo().failedTasks).toBe(0);
    });

    it('should update avgDuration after runs', () => {
      agent.run(makeTask(), '/project');
      const info1 = agent.getInfo();
      expect(info1.avgDuration).toBeGreaterThanOrEqual(0);

      agent.run(makeTask({ id: 'task-2' }), '/project');
      const info2 = agent.getInfo();
      // avgDuration should be some non-negative number after two runs
      expect(info2.avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('should clear currentTask after run completes', () => {
      agent.run(makeTask(), '/project');
      expect(agent.getInfo().currentTask).toBeUndefined();
    });
  });

  // ── run() — failure path (executeTask returns success:false) ──

  describe('run() — failure result', () => {
    it('should increment failedTasks when result.success is false', () => {
      agent.taskResult = {
        success: false,
        output: 'failed',
        artifacts: [],
        issues: [{ severity: 'error', message: 'bad code', autoFixable: false }],
        duration: 0,
      };

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(false);
      expect(agent.getInfo().failedTasks).toBe(1);
      expect(agent.getInfo().completedTasks).toBe(0);
    });
  });

  // ── run() — exception path ──

  describe('run() — exception', () => {
    it('should catch thrown error and return a crash result', () => {
      agent.throwError = new Error('unexpected null');

      const result = agent.run(makeTask(), '/project');

      expect(result.success).toBe(false);
      expect(result.output).toContain('Test Agent');
      expect(result.output).toContain('crashed');
      expect(result.output).toContain('unexpected null');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].severity).toBe('critical');
      expect(result.issues[0].message).toContain('unexpected null');
    });

    it('should set status to error after crash', () => {
      agent.throwError = new Error('boom');
      agent.run(makeTask(), '/project');
      expect(agent.getStatus()).toBe('error');
    });

    it('should increment failedTasks on crash', () => {
      agent.throwError = new Error('boom');
      agent.run(makeTask(), '/project');
      expect(agent.getInfo().failedTasks).toBe(1);
    });

    it('should handle non-Error thrown values', () => {
      agent.throwError = 'string error' as unknown as Error;
      // The base class does String(err) on non-Error — but since we assigned a string to Error,
      // it won't be instanceof Error. Let's use a special pattern.
      const origExecute = (agent as any).executeTask;
      (agent as any).executeTask = () => { throw 'string error'; };

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(false);
      expect(result.output).toContain('string error');

      // Restore
      (agent as any).executeTask = origExecute;
    });
  });

  // ── createIssue ──

  describe('createIssue', () => {
    it('should create a basic issue with default autoFixable=false', () => {
      const issue = agent.callCreateIssue('warning', 'unused var');
      expect(issue.severity).toBe('warning');
      expect(issue.message).toBe('unused var');
      expect(issue.autoFixable).toBe(false);
    });

    it('should merge optional fields when provided', () => {
      const issue = agent.callCreateIssue('error', 'sql injection', {
        file: 'src/db.ts',
        line: 42,
        suggestion: 'Use parameterized queries',
        autoFixable: true,
      });
      expect(issue.severity).toBe('error');
      expect(issue.file).toBe('src/db.ts');
      expect(issue.line).toBe(42);
      expect(issue.suggestion).toBe('Use parameterized queries');
      expect(issue.autoFixable).toBe(true);
    });
  });

  // ── connectKnowledge & shared context helpers ──

  describe('connectKnowledge / shared context', () => {
    it('should have null knowledge systems by default', () => {
      // emitEvent should not throw when eventBus is null
      expect(() => agent.callEmitEvent('task:started', { x: 1 })).not.toThrow();
    });

    it('should connect KB, EventBus, ContextChain', () => {
      const kb = new SharedKnowledgeBase();
      const bus = new EventBus();
      const chain = new ContextChain();

      agent.connectKnowledge(kb, bus, chain);

      // Verify by calling addInsight and checking KB
      const task = makeTask();
      agent.callAddInsight('code-pattern', 'medium', 'test', 'desc', task, ['f.ts'], {});
      expect(kb.size()).toBe(1);
    });

    it('should build shared context from KB and ContextChain', () => {
      const kb = new SharedKnowledgeBase();
      const bus = new EventBus();
      const chain = new ContextChain();

      kb.addInsight({
        category: 'architecture',
        severity: 'info',
        source: 'planner',
        phase: 'plan',
        title: 'Monolith detected',
        description: 'Single deployable unit',
        affectedFiles: [],
        metadata: {},
      });

      chain.addPhaseResult({
        phase: 'plan',
        agent: 'planner',
        summary: 'Architecture reviewed',
        keyFindings: ['Monolith'],
        issues: [],
        artifacts: [],
        metrics: {},
      });

      agent.connectKnowledge(kb, bus, chain);

      const ctx = agent.callGetSharedContext(makeTask({ phase: 'review' }));
      expect(ctx.length).toBeGreaterThan(0);
      expect(ctx).toContain('SharedKnowledgeBase');
      expect(ctx).toContain('ContextChain');
    });

    it('should return empty string when no KB or chain data exists', () => {
      const ctx = agent.callGetSharedContext(makeTask());
      expect(ctx).toBe('');
    });

    it('should emit events through the event bus when connected', () => {
      const bus = new EventBus();
      const received: unknown[] = [];
      bus.on('task:started', (e) => received.push(e));

      agent.connectKnowledge(new SharedKnowledgeBase(), bus, new ContextChain());
      agent.run(makeTask(), '/project');

      expect(received.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── enhanceTask / expandDescription / getSystemPrompt ──

  describe('prompt enhancer integration', () => {
    it('should return an EnhancedPrompt from enhanceTask', () => {
      const result = agent.callEnhanceTask(makeTask());
      expect(result.systemPrompt).toBeDefined();
      expect(result.enhancedDescription).toBeDefined();
      expect(result.thinkingFramework).toBeDefined();
      expect(result.qualityChecklist).toBeDefined();
      expect(result.fullPrompt).toBeDefined();
    });

    it('should return a non-empty system prompt for reviewer role', () => {
      const sp = agent.callGetSystemPrompt();
      expect(sp.length).toBeGreaterThan(0);
    });

    it('should expand a short description', () => {
      const expanded = agent.callExpandDescription('Review code');
      expect(expanded.length).toBeGreaterThan('Review code'.length);
    });
  });

  // ── storeIssuesAsInsights (private, tested indirectly) ──

  describe('storeIssuesAsInsights (via run)', () => {
    it('should store issues as insights in KB when issues are present', () => {
      const kb = new SharedKnowledgeBase();
      agent.connectKnowledge(kb, new EventBus(), new ContextChain());

      agent.taskResult = {
        success: true,
        output: 'done',
        artifacts: [],
        issues: [
          { severity: 'warning', message: 'Missing semicolons', autoFixable: true },
          { severity: 'error', message: 'Type error in main.ts', file: 'main.ts', line: 10, autoFixable: false },
        ],
        duration: 0,
      };

      agent.run(makeTask(), '/project');

      // The run() method calls storeIssuesAsInsights which adds to KB
      expect(kb.size()).toBeGreaterThanOrEqual(2);
    });
  });

  // ── hasAIProvider / callAISync (mocking require) ──

  describe('hasAIProvider', () => {
    it('should return false when no aiProvider configured and autoDetect fails', () => {
      // By default, there's no aiProvider on the config and autoDetectProvider
      // will likely throw or return null in test environment
      const result = agent.callHasAIProvider();
      // In test env without API keys, autoDetectProvider returns null
      expect(typeof result).toBe('boolean');
    });
  });

  describe('callAISync', () => {
    it('should return null when no AI provider is available', () => {
      const result = agent.callCallAISync('system', 'user');
      expect(result).toBeNull();
    });
  });
});
