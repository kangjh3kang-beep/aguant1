import {
  SharedKnowledgeBase,
  EventBus,
  ContextChain,
  Insight,
  InsightCategory,
  InsightSeverity,
  EventType,
  AgentEvent,
  PhaseContext,
} from './shared-knowledge';
import { TaskPhase, AgentRole, TaskIssue } from './types';

// ─── Helpers ──────────────────────────────────────────────

function makeInsightInput(overrides: Partial<Omit<Insight, 'id' | 'timestamp'>> = {}) {
  return {
    category: 'code-pattern' as InsightCategory,
    severity: 'medium' as InsightSeverity,
    source: 'reviewer' as AgentRole,
    phase: 'review' as TaskPhase,
    title: 'Unused variable detected',
    description: 'Variable `tmp` is declared but never used.',
    affectedFiles: ['src/utils/helper.ts'],
    metadata: {},
    ...overrides,
  };
}

function makeEventInput(overrides: Partial<Omit<AgentEvent, 'timestamp'>> = {}) {
  return {
    type: 'insight:added' as EventType,
    source: 'reviewer' as AgentRole,
    phase: 'review' as TaskPhase,
    data: {},
    ...overrides,
  };
}

function makePhaseContextInput(overrides: Partial<Omit<PhaseContext, 'completedAt'>> = {}) {
  return {
    phase: 'plan' as TaskPhase,
    agent: 'planner' as AgentRole,
    summary: 'Architecture analysis completed.',
    keyFindings: ['Monolith architecture', 'No test coverage'],
    issues: [] as TaskIssue[],
    artifacts: ['docs/architecture.md'],
    metrics: { filesAnalyzed: 42 },
    ...overrides,
  };
}

// ─── SharedKnowledgeBase ──────────────────────────────────

describe('SharedKnowledgeBase', () => {
  let kb: SharedKnowledgeBase;

  beforeEach(() => {
    kb = new SharedKnowledgeBase();
  });

  describe('addInsight', () => {
    it('should return an Insight with auto-generated id and timestamp', () => {
      const result = kb.addInsight(makeInsightInput());

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^insight-/);
      expect(result.timestamp).toBeDefined();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(result.title).toBe('Unused variable detected');
    });

    it('should generate unique ids for each insight', () => {
      const a = kb.addInsight(makeInsightInput({ title: 'A' }));
      const b = kb.addInsight(makeInsightInput({ title: 'B' }));

      expect(a.id).not.toBe(b.id);
    });

    it('should increment size after adding', () => {
      expect(kb.size()).toBe(0);
      kb.addInsight(makeInsightInput());
      expect(kb.size()).toBe(1);
      kb.addInsight(makeInsightInput());
      expect(kb.size()).toBe(2);
    });
  });

  describe('getByCategory', () => {
    it('should return insights matching the given category', () => {
      kb.addInsight(makeInsightInput({ category: 'vulnerability', title: 'XSS' }));
      kb.addInsight(makeInsightInput({ category: 'vulnerability', title: 'SQL Injection' }));
      kb.addInsight(makeInsightInput({ category: 'performance', title: 'Slow query' }));

      const vulns = kb.getByCategory('vulnerability');
      expect(vulns).toHaveLength(2);
      expect(vulns.map((i) => i.title)).toEqual(['XSS', 'SQL Injection']);
    });

    it('should return an empty array for a category with no insights', () => {
      expect(kb.getByCategory('accessibility')).toEqual([]);
    });
  });

  describe('getByAgent', () => {
    it('should return insights from the specified agent', () => {
      kb.addInsight(makeInsightInput({ source: 'tester', title: 'Coverage gap' }));
      kb.addInsight(makeInsightInput({ source: 'reviewer', title: 'Code smell' }));
      kb.addInsight(makeInsightInput({ source: 'tester', title: 'Flaky test' }));

      const testerInsights = kb.getByAgent('tester');
      expect(testerInsights).toHaveLength(2);
      expect(testerInsights.map((i) => i.title)).toEqual(['Coverage gap', 'Flaky test']);
    });

    it('should return an empty array for an agent with no insights', () => {
      expect(kb.getByAgent('deployer')).toEqual([]);
    });
  });

  describe('getByPhase', () => {
    it('should return insights from the specified phase', () => {
      kb.addInsight(makeInsightInput({ phase: 'code', title: 'A' }));
      kb.addInsight(makeInsightInput({ phase: 'test', title: 'B' }));
      kb.addInsight(makeInsightInput({ phase: 'code', title: 'C' }));

      const codeInsights = kb.getByPhase('code');
      expect(codeInsights).toHaveLength(2);
      expect(codeInsights.map((i) => i.title)).toEqual(['A', 'C']);
    });

    it('should return an empty array for a phase with no insights', () => {
      expect(kb.getByPhase('deploy')).toEqual([]);
    });
  });

  describe('getCritical', () => {
    it('should return insights with severity critical or high', () => {
      kb.addInsight(makeInsightInput({ severity: 'critical', title: 'RCE' }));
      kb.addInsight(makeInsightInput({ severity: 'high', title: 'SSRF' }));
      kb.addInsight(makeInsightInput({ severity: 'medium', title: 'Info leak' }));
      kb.addInsight(makeInsightInput({ severity: 'low', title: 'Verbose logs' }));
      kb.addInsight(makeInsightInput({ severity: 'info', title: 'Note' }));

      const critical = kb.getCritical();
      expect(critical).toHaveLength(2);
      expect(critical.map((i) => i.title)).toContain('RCE');
      expect(critical.map((i) => i.title)).toContain('SSRF');
    });

    it('should return an empty array when no critical/high insights exist', () => {
      kb.addInsight(makeInsightInput({ severity: 'low' }));
      expect(kb.getCritical()).toEqual([]);
    });
  });

  describe('getByFile', () => {
    it('should return insights whose affectedFiles contain a partial match', () => {
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/utils/helper.ts'], title: 'A' }));
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/api/handler.ts'], title: 'B' }));
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/utils/format.ts'], title: 'C' }));

      const results = kb.getByFile('src/utils');
      expect(results).toHaveLength(2);
      expect(results.map((i) => i.title)).toEqual(['A', 'C']);
    });

    it('should match when the query is a substring of an affected file', () => {
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/components/Button.tsx'], title: 'Button issue' }));

      expect(kb.getByFile('Button')).toHaveLength(1);
    });

    it('should match when an affected file is a substring of the query', () => {
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/api'], title: 'API issue' }));

      expect(kb.getByFile('src/api/routes/user.ts')).toHaveLength(1);
    });

    it('should return empty when no files match', () => {
      kb.addInsight(makeInsightInput({ affectedFiles: ['src/utils/helper.ts'] }));
      expect(kb.getByFile('nonexistent')).toEqual([]);
    });
  });

  describe('getAll and clear', () => {
    it('should return all insights via getAll', () => {
      kb.addInsight(makeInsightInput({ title: 'A' }));
      kb.addInsight(makeInsightInput({ title: 'B' }));

      const all = kb.getAll();
      expect(all).toHaveLength(2);
    });

    it('should reset everything on clear', () => {
      kb.addInsight(makeInsightInput({ category: 'vulnerability', source: 'security', phase: 'security' }));
      kb.addInsight(makeInsightInput({ category: 'performance', source: 'reviewer', phase: 'review' }));

      kb.clear();

      expect(kb.size()).toBe(0);
      expect(kb.getAll()).toEqual([]);
      expect(kb.getByCategory('vulnerability')).toEqual([]);
      expect(kb.getByAgent('security')).toEqual([]);
      expect(kb.getByPhase('security')).toEqual([]);
    });
  });

  describe('buildContextForAgent', () => {
    it('should include relevant category insights for the target agent', () => {
      kb.addInsight(makeInsightInput({
        category: 'vulnerability',
        severity: 'high',
        title: 'SQL Injection in login',
        description: 'User input not sanitized in login query.',
        affectedFiles: ['src/auth/login.ts'],
      }));
      kb.addInsight(makeInsightInput({
        category: 'code-pattern',
        title: 'Duplicated logic',
        description: 'Same validation repeated in 3 controllers.',
      }));

      // security agent is relevant to: vulnerability, dependency, code-pattern, architecture
      const ctx = kb.buildContextForAgent('security');

      expect(ctx).toContain('security Context');
      expect(ctx).toContain('SQL Injection in login');
      expect(ctx).toContain('Duplicated logic');
    });

    it('should always include critical issues section when critical insights exist', () => {
      kb.addInsight(makeInsightInput({
        category: 'architecture',
        severity: 'critical',
        source: 'planner',
        title: 'Circular dependency',
        description: 'Modules A and B have circular imports.',
      }));

      // tester is not directly relevant to 'architecture',
      // but critical issues are always shown
      const ctx = kb.buildContextForAgent('tester');
      expect(ctx).toContain('CRITICAL ISSUES');
      expect(ctx).toContain('Circular dependency');
    });

    it('should show total insight count', () => {
      kb.addInsight(makeInsightInput());
      kb.addInsight(makeInsightInput());
      kb.addInsight(makeInsightInput());

      const ctx = kb.buildContextForAgent('coder');
      expect(ctx).toContain('3개 인사이트');
    });
  });

  describe('buildSummary', () => {
    it('should produce a formatted summary with category and agent statistics', () => {
      kb.addInsight(makeInsightInput({ category: 'vulnerability', severity: 'critical', source: 'security' }));
      kb.addInsight(makeInsightInput({ category: 'vulnerability', severity: 'high', source: 'security' }));
      kb.addInsight(makeInsightInput({ category: 'performance', severity: 'medium', source: 'reviewer' }));

      const summary = kb.buildSummary();

      expect(summary).toContain('SharedKnowledgeBase Summary');
      expect(summary).toContain('총 인사이트: 3개');
      expect(summary).toContain('카테고리별:');
      expect(summary).toContain('에이전트별:');
      expect(summary).toContain('security: 2건');
      expect(summary).toContain('reviewer: 1건');
      // category labels
      expect(summary).toContain('보안 취약점');
      expect(summary).toContain('critical:1');
      expect(summary).toContain('high:1');
    });
  });
});

// ─── EventBus ─────────────────────────────────────────────

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe('on and emit', () => {
    it('should call the registered handler when a matching event is emitted', () => {
      const received: AgentEvent[] = [];
      bus.on('phase:started', (e) => received.push(e));

      bus.emit(makeEventInput({ type: 'phase:started' }));

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('phase:started');
      expect(received[0].timestamp).toBeDefined();
    });

    it('should not call handlers registered for a different event type', () => {
      const received: AgentEvent[] = [];
      bus.on('phase:completed', (e) => received.push(e));

      bus.emit(makeEventInput({ type: 'phase:started' }));

      expect(received).toHaveLength(0);
    });

    it('should support multiple handlers for the same event type', () => {
      let callCountA = 0;
      let callCountB = 0;
      bus.on('task:started', () => { callCountA++; });
      bus.on('task:started', () => { callCountB++; });

      bus.emit(makeEventInput({ type: 'task:started' }));

      expect(callCountA).toBe(1);
      expect(callCountB).toBe(1);
    });

    it('should not crash when a handler throws an error', () => {
      bus.on('issue:detected', () => { throw new Error('handler boom'); });
      const received: AgentEvent[] = [];
      bus.on('issue:detected', (e) => received.push(e));

      // Should not throw
      expect(() => bus.emit(makeEventInput({ type: 'issue:detected' }))).not.toThrow();
      // The second handler should still fire
      expect(received).toHaveLength(1);
    });

    it('should add a timestamp to emitted events', () => {
      const received: AgentEvent[] = [];
      bus.on('fix:applied', (e) => received.push(e));

      bus.emit(makeEventInput({ type: 'fix:applied' }));

      const ts = received[0].timestamp;
      expect(ts).toBeDefined();
      expect(new Date(ts).getTime()).not.toBeNaN();
    });
  });

  describe('event log', () => {
    it('should store emitted events in the log', () => {
      bus.emit(makeEventInput({ type: 'phase:started' }));
      bus.emit(makeEventInput({ type: 'phase:completed' }));

      const log = bus.getLog();
      expect(log).toHaveLength(2);
      expect(log[0].type).toBe('phase:started');
      expect(log[1].type).toBe('phase:completed');
    });

    it('should filter log by event type', () => {
      bus.emit(makeEventInput({ type: 'phase:started' }));
      bus.emit(makeEventInput({ type: 'phase:completed' }));
      bus.emit(makeEventInput({ type: 'phase:started' }));

      const filtered = bus.getLog({ type: 'phase:started' });
      expect(filtered).toHaveLength(2);
    });

    it('should filter log by source agent', () => {
      bus.emit(makeEventInput({ source: 'tester' }));
      bus.emit(makeEventInput({ source: 'reviewer' }));
      bus.emit(makeEventInput({ source: 'tester' }));

      const filtered = bus.getLog({ source: 'tester' });
      expect(filtered).toHaveLength(2);
    });

    it('should limit log results with the limit filter', () => {
      for (let i = 0; i < 10; i++) {
        bus.emit(makeEventInput({ data: { index: i } }));
      }

      const limited = bus.getLog({ limit: 3 });
      expect(limited).toHaveLength(3);
      // limit takes the last N entries
      expect(limited[0].data).toEqual({ index: 7 });
      expect(limited[2].data).toEqual({ index: 9 });
    });

    it('should cap the log at 1000 entries', () => {
      for (let i = 0; i < 1050; i++) {
        bus.emit(makeEventInput({ data: { i } }));
      }

      const log = bus.getLog();
      expect(log).toHaveLength(1000);
      // The earliest entries should have been trimmed
      expect((log[0].data as { i: number }).i).toBe(50);
    });
  });

  describe('clear', () => {
    it('should remove all handlers and log entries', () => {
      const received: AgentEvent[] = [];
      bus.on('phase:started', (e) => received.push(e));
      bus.emit(makeEventInput({ type: 'phase:started' }));

      bus.clear();

      // Log should be empty after clear
      expect(bus.getLog()).toEqual([]);

      // Handler should no longer fire after clear
      bus.emit(makeEventInput({ type: 'phase:started' }));
      expect(received).toHaveLength(1); // only the pre-clear call

      // But the event is still logged (emit always logs)
      expect(bus.getLog()).toHaveLength(1);
    });
  });
});

// ─── ContextChain ─────────────────────────────────────────

describe('ContextChain', () => {
  let chain: ContextChain;

  beforeEach(() => {
    chain = new ContextChain();
  });

  describe('addPhaseResult', () => {
    it('should append to chain with auto-generated completedAt timestamp', () => {
      chain.addPhaseResult(makePhaseContextInput());

      const all = chain.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].completedAt).toBeDefined();
      expect(new Date(all[0].completedAt).getTime()).not.toBeNaN();
      expect(all[0].phase).toBe('plan');
    });
  });

  describe('getPhaseResult', () => {
    it('should find context by phase name', () => {
      chain.addPhaseResult(makePhaseContextInput({ phase: 'plan' }));
      chain.addPhaseResult(makePhaseContextInput({ phase: 'code', agent: 'coder', summary: 'Code written.' }));

      const code = chain.getPhaseResult('code');
      expect(code).toBeDefined();
      expect(code!.summary).toBe('Code written.');
    });

    it('should return undefined for a phase not in the chain', () => {
      chain.addPhaseResult(makePhaseContextInput({ phase: 'plan' }));

      expect(chain.getPhaseResult('deploy')).toBeUndefined();
    });
  });

  describe('buildContextForNextPhase', () => {
    it('should return empty string when chain is empty', () => {
      expect(chain.buildContextForNextPhase('code')).toBe('');
    });

    it('should include summaries and key findings from all previous phases', () => {
      chain.addPhaseResult(makePhaseContextInput({
        phase: 'plan',
        agent: 'planner',
        summary: 'Analyzed architecture.',
        keyFindings: ['Monorepo structure', 'Missing CI config'],
      }));
      chain.addPhaseResult(makePhaseContextInput({
        phase: 'code',
        agent: 'coder',
        summary: 'Implemented features.',
        keyFindings: ['Created 5 new files'],
        artifacts: ['src/new-module.ts'],
        metrics: { linesAdded: 320 },
      }));

      const ctx = chain.buildContextForNextPhase('review');

      expect(ctx).toContain('ContextChain');
      expect(ctx).toContain('PLAN');
      expect(ctx).toContain('Analyzed architecture.');
      expect(ctx).toContain('Monorepo structure');
      expect(ctx).toContain('Missing CI config');
      expect(ctx).toContain('CODE');
      expect(ctx).toContain('Implemented features.');
      expect(ctx).toContain('src/new-module.ts');
      expect(ctx).toContain('linesAdded=320');
    });

    it('should include critical/error issues from previous phases', () => {
      const criticalIssue: TaskIssue = {
        severity: 'critical',
        message: 'Memory leak in event handler',
        file: 'src/events.ts',
        line: 42,
        autoFixable: false,
      };
      const warningIssue: TaskIssue = {
        severity: 'warning',
        message: 'Unused import',
        autoFixable: true,
      };

      chain.addPhaseResult(makePhaseContextInput({
        phase: 'review',
        agent: 'reviewer',
        issues: [criticalIssue, warningIssue],
      }));

      const ctx = chain.buildContextForNextPhase('test');

      expect(ctx).toContain('CRITICAL');
      expect(ctx).toContain('Memory leak in event handler');
      // Warning is not critical/error so should not appear in the issues section
      expect(ctx).not.toContain('Unused import');
    });

    it('should include the phase-specific directive for the next phase', () => {
      chain.addPhaseResult(makePhaseContextInput({ phase: 'plan' }));

      const ctx = chain.buildContextForNextPhase('code');

      // The code directive mentions architecture
      expect(ctx).toContain('CODE Phase');
      expect(ctx).toContain('아키텍처');
    });

    it('should include metrics from previous phases', () => {
      chain.addPhaseResult(makePhaseContextInput({
        phase: 'test',
        agent: 'tester',
        metrics: { coverage: 87, passed: 120, failed: 3 },
      }));

      const ctx = chain.buildContextForNextPhase('security');

      expect(ctx).toContain('coverage=87');
      expect(ctx).toContain('passed=120');
      expect(ctx).toContain('failed=3');
    });
  });

  describe('getAll and clear', () => {
    it('should return a copy of the chain via getAll', () => {
      chain.addPhaseResult(makePhaseContextInput({ phase: 'plan' }));
      chain.addPhaseResult(makePhaseContextInput({ phase: 'code' }));

      const all = chain.getAll();
      expect(all).toHaveLength(2);

      // Modifying the returned array should not affect the chain
      all.pop();
      expect(chain.getAll()).toHaveLength(2);
    });

    it('should remove all entries on clear', () => {
      chain.addPhaseResult(makePhaseContextInput({ phase: 'plan' }));
      chain.addPhaseResult(makePhaseContextInput({ phase: 'code' }));

      chain.clear();

      expect(chain.getAll()).toEqual([]);
      expect(chain.getPhaseResult('plan')).toBeUndefined();
    });
  });
});
