/**
 * AdaptiveEngine, FailurePatternDB, StrategySelector 핵심 모듈 테스트
 *
 * FailurePatternDB: 실패 패턴 기록/조회/유사 검색/반복 패턴
 * StrategySelector: 카테고리 기반 전략 선택, 히스토리 기반 재사용, 성공률 추적
 * AdaptiveEngine: 분석→분류→전략 선택 체인, 전략 실행, 보고서 생성
 */

import fs from 'fs';

jest.mock('fs');
jest.mock('child_process');
jest.mock('./code-transformer', () => ({
  CodeTransformer: jest.fn().mockImplementation(() => ({
    transformProject: jest.fn().mockReturnValue({ changed: 0, errors: [], files: [] }),
    transformFile: jest.fn().mockReturnValue({ success: false, appliedCount: 0, changes: [] }),
  })),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

import {
  FailurePatternDB,
  StrategySelector,
  AdaptiveEngine,
  FailurePattern,
  FailureCategory,
} from './adaptive-engine';
import type { TaskPhase } from './types';

// ──────────────────────────────────────────────────────────
// FailurePatternDB
// ──────────────────────────────────────────────────────────

describe('FailurePatternDB', () => {
  let db: FailurePatternDB;
  const storagePath = '/tmp/test-patterns.json';

  beforeEach(() => {
    jest.clearAllMocks();
    // Empty DB — no file on disk
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => {});
    (mockFs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
    db = new FailurePatternDB(storagePath);
  });

  // ── record ──────────────────────────────────────────────

  it('record() creates a new pattern and returns it', () => {
    const pattern = db.record('compile-error', 'code', 'compilation failed at line 42', ['src/index.ts']);

    expect(pattern).toBeDefined();
    expect(pattern.id).toMatch(/^fp-/);
    expect(pattern.category).toBe('compile-error');
    expect(pattern.phase).toBe('code');
    expect(pattern.occurrences).toBe(1);
    expect(pattern.affectedFiles).toContain('src/index.ts');
    expect(pattern.strategyHistory).toEqual([]);
    expect(db.size()).toBe(1);
  });

  it('record() increments occurrences for same signature', () => {
    const p1 = db.record('compile-error', 'code', 'compilation failed at line 42', ['a.ts']);
    const p2 = db.record('compile-error', 'code', 'compilation failed at line 99', ['b.ts']);

    // normalizeSignature replaces line numbers so these should collapse
    expect(p2.id).toBe(p1.id);
    expect(p2.occurrences).toBe(2);
    expect(p2.affectedFiles).toContain('a.ts');
    expect(p2.affectedFiles).toContain('b.ts');
    expect(db.size()).toBe(1);
  });

  it('record() creates distinct patterns for different signatures', () => {
    db.record('compile-error', 'code', 'compilation failed', []);
    db.record('lint-error', 'review', 'eslint error no-unused-vars', []);

    expect(db.size()).toBe(2);
  });

  it('record() truncates originalMessage to 500 chars', () => {
    const longMsg = 'x'.repeat(1000);
    const pattern = db.record('compile-error', 'code', longMsg, []);
    expect(pattern.originalMessage.length).toBe(500);
  });

  it('record() persists by calling fs.writeFileSync', () => {
    db.record('compile-error', 'code', 'error TS2345', []);
    expect(mockFs.writeFileSync).toHaveBeenCalled();
  });

  // ── findBySignature ─────────────────────────────────────

  it('findBySignature() returns matching pattern', () => {
    const p = db.record('type-error', 'code', 'type is not assignable', []);
    const found = db.findBySignature(p.signature);
    expect(found).toBeDefined();
    expect(found!.id).toBe(p.id);
  });

  it('findBySignature() returns undefined for unknown signature', () => {
    expect(db.findBySignature('nonexistent-signature')).toBeUndefined();
  });

  // ── getByCategory ───────────────────────────────────────

  it('getByCategory() returns only patterns of the given category', () => {
    db.record('compile-error', 'code', 'compilation failed', []);
    db.record('lint-error', 'review', 'eslint error', []);
    db.record('compile-error', 'code', 'another compilation issue', []);

    const compileErrors = db.getByCategory('compile-error');
    expect(compileErrors.length).toBe(2);
    compileErrors.forEach((p) => expect(p.category).toBe('compile-error'));
  });

  it('getByCategory() returns empty array when no patterns match', () => {
    db.record('compile-error', 'code', 'compilation failed', []);
    expect(db.getByCategory('security-vulnerability')).toEqual([]);
  });

  // ── findSimilar ─────────────────────────────────────────

  it('findSimilar() returns patterns with overlapping keywords', () => {
    db.record('type-error', 'code', 'cannot assign string value to number property', []);
    db.record('compile-error', 'code', 'webpack compilation totally different', []);

    const similar = db.findSimilar('string value assign number', 5);
    expect(similar.length).toBeGreaterThanOrEqual(1);
    // The first pattern has more keyword overlap
    expect(similar[0].category).toBe('type-error');
  });

  it('findSimilar() returns empty when no keywords overlap', () => {
    db.record('compile-error', 'code', 'webpack compilation failed', []);
    const similar = db.findSimilar('zzz yyy xxx', 5);
    expect(similar).toEqual([]);
  });

  it('findSimilar() respects maxResults limit', () => {
    for (let i = 0; i < 10; i++) {
      db.record('compile-error', 'code', `compilation webpack chunk error variant${i}`, []);
    }
    const similar = db.findSimilar('compilation webpack chunk error variant', 3);
    expect(similar.length).toBeLessThanOrEqual(3);
  });

  // ── getRecurring ────────────────────────────────────────

  it('getRecurring() returns patterns with occurrences >= threshold', () => {
    // Record same signature 4 times
    for (let i = 0; i < 4; i++) {
      db.record('lint-error', 'review', 'eslint error: no-unused-vars', []);
    }
    // Record a different one once
    db.record('compile-error', 'code', 'unique compilation error', []);

    const recurring = db.getRecurring(3);
    expect(recurring.length).toBe(1);
    expect(recurring[0].occurrences).toBe(4);
  });

  it('getRecurring() returns empty if nothing exceeds threshold', () => {
    db.record('compile-error', 'code', 'error once', []);
    expect(db.getRecurring(5)).toEqual([]);
  });

  it('getRecurring() sorts by occurrences descending', () => {
    // Pattern A: 5 occurrences
    for (let i = 0; i < 5; i++) {
      db.record('compile-error', 'code', 'repeated compilation error alpha', []);
    }
    // Pattern B: 3 occurrences
    for (let i = 0; i < 3; i++) {
      db.record('lint-error', 'review', 'repeated lint error beta', []);
    }

    const recurring = db.getRecurring(2);
    expect(recurring.length).toBe(2);
    expect(recurring[0].occurrences).toBeGreaterThanOrEqual(recurring[1].occurrences);
  });

  // ── recordStrategyResult ────────────────────────────────

  it('recordStrategyResult() appends to strategyHistory', () => {
    const p = db.record('type-error', 'code', 'TS2345 type error', []);
    db.recordStrategyResult(p.id, 'type-assertion-fix', 'Type Fix', true, 'fixed successfully');

    const updated = db.findBySignature(p.signature)!;
    expect(updated.strategyHistory.length).toBe(1);
    expect(updated.strategyHistory[0].success).toBe(true);
    expect(updated.strategyHistory[0].strategyId).toBe('type-assertion-fix');
    expect(updated.strategyHistory[0].strategyName).toBe('Type Fix');
    expect(updated.strategyHistory[0].details).toBe('fixed successfully');
  });

  it('recordStrategyResult() silently ignores unknown patternId', () => {
    // Should not throw
    db.recordStrategyResult('nonexistent-id', 's1', 'Strategy', false, 'details');
    expect(db.size()).toBe(0);
  });

  // ── getAll / size ───────────────────────────────────────

  it('getAll() returns all stored patterns', () => {
    db.record('compile-error', 'code', 'error one', []);
    db.record('lint-error', 'review', 'error two', []);
    expect(db.getAll().length).toBe(2);
  });

  it('size() returns 0 for empty DB', () => {
    expect(db.size()).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────
// StrategySelector
// ──────────────────────────────────────────────────────────

describe('StrategySelector', () => {
  let selector: StrategySelector;

  beforeEach(() => {
    jest.clearAllMocks();
    selector = new StrategySelector();
  });

  // Helper to build a minimal FailurePattern
  function makePattern(overrides: Partial<FailurePattern> = {}): FailurePattern {
    return {
      id: 'fp-test-001',
      category: 'compile-error',
      phase: 'code' as TaskPhase,
      signature: 'test-sig',
      originalMessage: 'compilation failed',
      affectedFiles: [],
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      occurrences: 1,
      strategyHistory: [],
      ...overrides,
    };
  }

  // ── initDefaultStrategies ───────────────────────────────

  it('initializes with default strategies', () => {
    const all = selector.getAll();
    expect(all.length).toBeGreaterThanOrEqual(18);
    // Every strategy starts with 50% successRate and 0 attempts
    all.forEach((s) => {
      expect(s.successRate).toBe(0.5);
      expect(s.totalAttempts).toBe(0);
    });
  });

  // ── selectStrategy: category matching ───────────────────

  it('selectStrategy() returns a strategy matching the pattern category', () => {
    const pattern = makePattern({ category: 'lint-error', originalMessage: 'eslint error' });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('lint-error');
  });

  it('selectStrategy() prefers pattern-matched strategy over generic category match', () => {
    const pattern = makePattern({
      category: 'compile-error',
      originalMessage: 'Cannot find module "lodash"',
    });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    // compile-dep-install matches "cannot find module" pattern
    expect(strategy!.id).toBe('compile-dep-install');
  });

  it('selectStrategy() for type-error category', () => {
    const pattern = makePattern({ category: 'type-error', originalMessage: 'TS2345 type error' });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('type-error');
  });

  it('selectStrategy() for dependency-missing category', () => {
    const pattern = makePattern({
      category: 'dependency-missing',
      originalMessage: 'Cannot find module "express"',
    });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('dependency-missing');
  });

  it('selectStrategy() for security-vulnerability category', () => {
    const pattern = makePattern({
      category: 'security-vulnerability',
      originalMessage: 'vulnerability CVE-2024-12345 found',
    });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('security-vulnerability');
  });

  it('selectStrategy() for test-failure category', () => {
    const pattern = makePattern({
      category: 'test-failure',
      originalMessage: 'expected "foo" received "bar"',
    });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('test-failure');
  });

  it('selectStrategy() returns null when no category matches', () => {
    // 'unknown' has no default strategies
    const pattern = makePattern({ category: 'unknown', originalMessage: 'something random' });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).toBeNull();
  });

  // ── selectStrategy: excludeIds ──────────────────────────

  it('selectStrategy() excludes specified strategy IDs', () => {
    const pattern = makePattern({
      category: 'compile-error',
      originalMessage: 'Cannot find module "xyz"',
    });

    // Exclude the top-priority compile strategy
    const strategy = selector.selectStrategy(pattern, ['compile-dep-install']);
    expect(strategy).not.toBeNull();
    expect(strategy!.id).not.toBe('compile-dep-install');
  });

  it('selectStrategy() returns null when all candidates are excluded', () => {
    const pattern = makePattern({ category: 'dependency-conflict', originalMessage: 'ERESOLVE conflict' });
    // Only one dep-conflict strategy exists
    const strategy = selector.selectStrategy(pattern, ['dep-resolve-conflict']);
    expect(strategy).toBeNull();
  });

  // ── selectStrategy: success-rate sorting ────────────────

  it('selectStrategy() prefers higher successRate when attempts >= 3', () => {
    // Manually bump attempts for two lint strategies
    const allStrategies = selector.getAll();
    const lintAutofix = allStrategies.find((s) => s.id === 'lint-autofix')!;
    const lintRuleConfig = allStrategies.find((s) => s.id === 'lint-rule-config')!;

    // Make lint-rule-config have higher success rate with enough attempts
    lintAutofix.totalAttempts = 5;
    lintAutofix.successCount = 1;
    lintAutofix.successRate = 0.2;

    lintRuleConfig.totalAttempts = 5;
    lintRuleConfig.successCount = 4;
    lintRuleConfig.successRate = 0.8;

    const pattern = makePattern({ category: 'lint-error', originalMessage: 'eslint error rule' });
    const strategy = selector.selectStrategy(pattern);

    expect(strategy).not.toBeNull();
    // Higher success rate should win when diff > 0.1
    expect(strategy!.id).toBe('lint-rule-config');
  });

  // ── selectFromHistory ───────────────────────────────────

  it('selectFromHistory() returns previously successful strategy', () => {
    const pattern = makePattern({
      strategyHistory: [
        { strategyId: 'compile-dep-install', strategyName: 'Dep Install', appliedAt: '2025-01-01', success: false, details: '' },
        { strategyId: 'compile-type-fix', strategyName: 'Type Fix', appliedAt: '2025-01-02', success: true, details: '' },
      ],
    });

    const strategy = selector.selectFromHistory(pattern);
    expect(strategy).not.toBeNull();
    expect(strategy!.id).toBe('compile-type-fix');
  });

  it('selectFromHistory() prefers most recent success', () => {
    const pattern = makePattern({
      strategyHistory: [
        { strategyId: 'compile-dep-install', strategyName: 'Dep Install', appliedAt: '2025-01-01', success: true, details: '' },
        { strategyId: 'compile-type-fix', strategyName: 'Type Fix', appliedAt: '2025-01-02', success: true, details: '' },
      ],
    });

    const strategy = selector.selectFromHistory(pattern);
    expect(strategy).not.toBeNull();
    // Most recent success (reversed order) should be compile-type-fix
    expect(strategy!.id).toBe('compile-type-fix');
  });

  it('selectFromHistory() returns null when no successes in history', () => {
    const pattern = makePattern({
      strategyHistory: [
        { strategyId: 'compile-dep-install', strategyName: 'Install', appliedAt: '2025-01-01', success: false, details: '' },
      ],
    });

    expect(selector.selectFromHistory(pattern)).toBeNull();
  });

  it('selectFromHistory() returns null for empty history', () => {
    const pattern = makePattern({ strategyHistory: [] });
    expect(selector.selectFromHistory(pattern)).toBeNull();
  });

  // ── updateResult ────────────────────────────────────────

  it('updateResult() updates successRate correctly on success', () => {
    selector.updateResult('compile-dep-install', true);
    const strategy = selector.getAll().find((s) => s.id === 'compile-dep-install')!;

    expect(strategy.totalAttempts).toBe(1);
    expect(strategy.successCount).toBe(1);
    expect(strategy.successRate).toBe(1.0);
  });

  it('updateResult() updates successRate correctly on failure', () => {
    selector.updateResult('compile-dep-install', false);
    const strategy = selector.getAll().find((s) => s.id === 'compile-dep-install')!;

    expect(strategy.totalAttempts).toBe(1);
    expect(strategy.successCount).toBe(0);
    expect(strategy.successRate).toBe(0);
  });

  it('updateResult() accumulates across multiple calls', () => {
    selector.updateResult('lint-autofix', true);
    selector.updateResult('lint-autofix', true);
    selector.updateResult('lint-autofix', false);

    const strategy = selector.getAll().find((s) => s.id === 'lint-autofix')!;
    expect(strategy.totalAttempts).toBe(3);
    expect(strategy.successCount).toBe(2);
    expect(strategy.successRate).toBeCloseTo(2 / 3);
  });

  it('updateResult() silently ignores unknown strategyId', () => {
    // Should not throw
    selector.updateResult('nonexistent-strategy', true);
  });

  // ── getTopStrategies ────────────────────────────────────

  it('getTopStrategies() returns only strategies with >= 2 attempts', () => {
    selector.updateResult('lint-autofix', true);
    selector.updateResult('lint-autofix', true);
    selector.updateResult('compile-dep-install', true);
    // lint-autofix has 2 attempts, compile-dep-install has 1

    const top = selector.getTopStrategies(10);
    expect(top.length).toBe(1);
    expect(top[0].id).toBe('lint-autofix');
  });

  it('getTopStrategies() sorts by successRate descending', () => {
    // Strategy A: 100% success (2 attempts)
    selector.updateResult('lint-autofix', true);
    selector.updateResult('lint-autofix', true);

    // Strategy B: 50% success (2 attempts)
    selector.updateResult('compile-dep-install', true);
    selector.updateResult('compile-dep-install', false);

    const top = selector.getTopStrategies(10);
    expect(top.length).toBe(2);
    expect(top[0].successRate).toBeGreaterThanOrEqual(top[1].successRate);
    expect(top[0].id).toBe('lint-autofix');
  });

  it('getTopStrategies() returns empty when no strategy has enough attempts', () => {
    expect(selector.getTopStrategies(5)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────
// AdaptiveEngine
// ──────────────────────────────────────────────────────────

describe('AdaptiveEngine', () => {
  let engine: AdaptiveEngine;
  const storagePath = '/tmp/test-adaptive';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.writeFileSync.mockImplementation(() => {});
    (mockFs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
    engine = new AdaptiveEngine(storagePath);
  });

  // ── classifyFailure (via analyzeAndSelect) ──────────────

  describe('failure classification', () => {
    const classifyCases: Array<[string, FailureCategory]> = [
      ['error TS2345: Argument of type string is not assignable', 'type-error'],
      ['Cannot find module "express"', 'dependency-missing'],
      ['compilation failed with errors', 'compile-error'],
      ['ERESOLVE unable to resolve dependency tree', 'dependency-conflict'],
      ['test failed: expected 1 received 2', 'test-failure'],
      ['vulnerability CVE-2024-12345 in lodash', 'security-vulnerability'],
      ['eslint error: no-unused-vars', 'lint-error'],
      ['ECONNREFUSED 127.0.0.1:5432', 'test-setup'],
      ['permission denied EACCES', 'permission-error'],
      ['network timeout connecting to api', 'network-error'],
      ['env variable not set DATABASE_URL', 'config-error'],
      ['command not found: docker', 'environment-error'],
      ['TypeError: undefined is not a function', 'runtime-error'],
      ['circular dependency detected in modules', 'architecture-violation'],
      ['integration api error http 500', 'integration-error'],
      ['some completely unknown gibberish zzzqqq', 'unknown'],
    ];

    it.each(classifyCases)(
      'classifies "%s" as %s',
      (errorMessage, expectedCategory) => {
        const { pattern } = engine.analyzeAndSelect('code', errorMessage, []);
        expect(pattern.category).toBe(expectedCategory);
      },
    );
  });

  // ── analyzeAndSelect: strategy selection chain ──────────

  it('analyzeAndSelect() returns a strategy for a known category', () => {
    const { strategy, reasoning } = engine.analyzeAndSelect(
      'code',
      'Cannot find module "lodash"',
      ['src/app.ts'],
    );

    expect(strategy).not.toBeNull();
    expect(strategy!.category).toBe('dependency-missing');
    expect(reasoning).toBeTruthy();
  });

  it('analyzeAndSelect() reuses previous successful strategy', () => {
    // First call — records pattern and selects strategy
    const result1 = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);
    expect(result1.strategy).not.toBeNull();

    // Record a success for this strategy on this pattern
    engine.recordResult(
      result1.pattern.id,
      result1.strategy!.id,
      result1.strategy!.name,
      true,
      'fixed',
    );

    // Second call with same error — should reuse the successful strategy
    const result2 = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);
    expect(result2.strategy).not.toBeNull();
    expect(result2.reasoning).toContain('성공');
  });

  it('analyzeAndSelect() excludes previously failed strategies', () => {
    // First call
    const result1 = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);
    const firstStrategyId = result1.strategy!.id;

    // Record a failure
    engine.recordResult(result1.pattern.id, firstStrategyId, result1.strategy!.name, false, 'failed');

    // Second call — should exclude the failed strategy
    const result2 = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);
    if (result2.strategy) {
      // If there is another strategy, it should be a different one
      // (or same if no alternatives, but reasoning mentions exclusion)
      expect(result2.reasoning).toContain('제외');
    }
  });

  it('analyzeAndSelect() returns null strategy when all have failed', () => {
    // Get all compile-error strategies
    const compileStrategies = engine.getSelector().getAll().filter((s) => s.category === 'compile-error');

    // Record pattern
    const result = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);

    // Mark ALL compile-error strategies as failed on this pattern
    for (const s of compileStrategies) {
      engine.getPatternDB().recordStrategyResult(result.pattern.id, s.id, s.name, false, 'fail');
    }

    // Now try again — should have no strategy
    const result2 = engine.analyzeAndSelect('code', 'compilation failed tsc error', []);
    expect(result2.strategy).toBeNull();
    expect(result2.reasoning).toContain('찾지 못했습니다');
  });

  // ── recordResult ────────────────────────────────────────

  it('recordResult() updates both patternDB and selector', () => {
    const { pattern, strategy } = engine.analyzeAndSelect('code', 'eslint error no-unused-vars', []);
    expect(strategy).not.toBeNull();

    engine.recordResult(pattern.id, strategy!.id, strategy!.name, true, 'auto-fixed');

    // Check patternDB
    const updated = engine.getPatternDB().findBySignature(pattern.signature);
    expect(updated!.strategyHistory.length).toBe(1);
    expect(updated!.strategyHistory[0].success).toBe(true);

    // Check selector
    const updatedStrategy = engine.getSelector().getAll().find((s) => s.id === strategy!.id)!;
    expect(updatedStrategy.totalAttempts).toBe(1);
    expect(updatedStrategy.successCount).toBe(1);
  });

  // ── executeStrategy ─────────────────────────────────────

  it('executeStrategy() calls StrategyExecutor and records result', () => {
    const { pattern, strategy } = engine.analyzeAndSelect(
      'code',
      'eslint error: semi',
      ['src/index.ts'],
    );
    expect(strategy).not.toBeNull();

    const result = engine.executeStrategy(strategy!, pattern, '/tmp/project');

    // Result shape
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('output');
    expect(result).toHaveProperty('commands');
    expect(typeof result.success).toBe('boolean');

    // Verify result was recorded on the pattern
    const updatedPattern = engine.getPatternDB().findBySignature(pattern.signature);
    expect(updatedPattern!.strategyHistory.length).toBeGreaterThanOrEqual(1);
  });

  // ── generateReport ──────────────────────────────────────

  it('generateReport() returns a valid LearningReport with empty data', () => {
    const report = engine.generateReport();

    expect(report).toHaveProperty('totalPatterns');
    expect(report).toHaveProperty('totalStrategies');
    expect(report).toHaveProperty('topStrategies');
    expect(report).toHaveProperty('recurringFailures');
    expect(report).toHaveProperty('adaptationScore');

    expect(report.totalPatterns).toBe(0);
    expect(report.totalStrategies).toBeGreaterThanOrEqual(18);
    expect(report.topStrategies).toEqual([]);
    expect(report.recurringFailures).toEqual([]);
    expect(report.adaptationScore).toBeGreaterThanOrEqual(0);
    expect(report.adaptationScore).toBeLessThanOrEqual(100);
  });

  it('generateReport() reflects recorded patterns and strategy results', () => {
    // Record several patterns
    engine.analyzeAndSelect('code', 'error TS2345 type not assignable', ['a.ts']);
    engine.analyzeAndSelect('code', 'error TS2345 type not assignable', ['b.ts']);
    engine.analyzeAndSelect('review', 'eslint error no-unused-vars', []);

    // Record some strategy results (enough to appear in top)
    const selector = engine.getSelector();
    selector.updateResult('type-assertion-fix', true);
    selector.updateResult('type-assertion-fix', true);

    const report = engine.generateReport();
    expect(report.totalPatterns).toBe(2);
    expect(report.topStrategies.length).toBeGreaterThanOrEqual(1);

    // Recurring (2 occurrences with threshold 2)
    expect(report.recurringFailures.length).toBeGreaterThanOrEqual(1);
  });

  it('generateReport() adaptationScore increases with data', () => {
    const emptyScore = engine.generateReport().adaptationScore;

    // Add patterns and successes
    for (let i = 0; i < 5; i++) {
      engine.analyzeAndSelect('code', `error variant ${i} unique ${Math.random()}`, []);
    }

    const selector = engine.getSelector();
    for (let i = 0; i < 10; i++) {
      selector.updateResult('lint-autofix', true);
    }

    const populatedScore = engine.generateReport().adaptationScore;
    expect(populatedScore).toBeGreaterThan(emptyScore);
  });

  // ── formatLearningLog ───────────────────────────────────

  it('formatLearningLog() returns a string with header', () => {
    const log = engine.formatLearningLog();
    expect(log).toContain('AdaptiveEngine Learning Log');
  });

  it('formatLearningLog() includes entries after analyzeAndSelect', () => {
    engine.analyzeAndSelect('code', 'compilation failed', []);

    const log = engine.formatLearningLog();
    expect(log).toContain('strategy-select');
  });

  it('formatLearningLog() includes entries after recordResult', () => {
    const { pattern, strategy } = engine.analyzeAndSelect('code', 'eslint error', []);
    engine.recordResult(pattern.id, strategy!.id, strategy!.name, true, 'ok');

    const log = engine.formatLearningLog();
    expect(log).toContain('strategy-success');
  });

  // ── getPatternDB / getSelector ──────────────────────────

  it('getPatternDB() returns the internal FailurePatternDB', () => {
    expect(engine.getPatternDB()).toBeInstanceOf(FailurePatternDB);
  });

  it('getSelector() returns the internal StrategySelector', () => {
    expect(engine.getSelector()).toBeInstanceOf(StrategySelector);
  });

  // ── Edge cases ──────────────────────────────────────────

  it('handles empty error message gracefully', () => {
    const { pattern, strategy } = engine.analyzeAndSelect('code', '', []);
    expect(pattern).toBeDefined();
    expect(pattern.category).toBe('unknown');
    // unknown category has no strategies
    expect(strategy).toBeNull();
  });

  it('handles very long error message without crashing', () => {
    const longMsg = 'compilation failed '.repeat(500);
    const { pattern } = engine.analyzeAndSelect('code', longMsg, []);
    expect(pattern).toBeDefined();
    expect(pattern.originalMessage.length).toBe(500);
  });
});
