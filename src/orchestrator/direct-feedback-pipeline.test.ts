/**
 * DirectFeedbackPipeline module comprehensive test suite
 *
 * Covers: PatchGenerator, PatchApplicator, PatchValidator,
 * FeedbackRouter, and DirectFeedbackPipeline classes.
 */

import fs from 'fs';
import { execSync } from 'child_process';

// ── Shared mock functions for CodeTransformer instances ──

const mockTransformFile = jest.fn();
const mockApplyPatches = jest.fn();
const mockFixFromIssues = jest.fn();

jest.mock('./code-transformer', () => ({
  CodeTransformer: jest.fn().mockImplementation(() => ({
    transformFile: mockTransformFile,
    applyPatches: mockApplyPatches,
    fixFromIssues: mockFixFromIssues,
  })),
}));

jest.mock('fs');
jest.mock('child_process');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import {
  PatchGenerator,
  PatchApplicator,
  PatchValidator,
  FeedbackRouter,
  DirectFeedbackPipeline,
  Patch,
} from './direct-feedback-pipeline';
import type { TaskIssue, PipelineState, Task, ProjectSpec, PipelineConfig } from './types';
import type { AgentFeedback } from './autonomous-loop';

// ── Test helpers ─────────────────────────────────────────

function makeIssue(overrides: Partial<TaskIssue> = {}): TaskIssue {
  return {
    severity: 'warning',
    message: 'test issue',
    autoFixable: false,
    ...overrides,
  };
}

function makePatch(overrides: Partial<Patch> = {}): Patch {
  return {
    id: 'patch-1',
    file: 'src/test.ts',
    type: 'transform',
    transformType: 'remove-console',
    sourceIssue: makeIssue(),
    confidence: 'high',
    description: 'test patch',
    ...overrides,
  };
}

function makePipelineState(issues: TaskIssue[] = []): PipelineState {
  const project: ProjectSpec = {
    name: 'test-project',
    description: 'test',
    rootPath: '/test/project',
    techStack: { language: 'typescript' },
    requirements: [],
  };
  const config: PipelineConfig = {
    phases: ['code', 'review'],
    autoFix: true,
    failFast: false,
    humanGates: [],
    maxIterations: 3,
    parallel: false,
  };
  const task: Task = {
    id: 'task-1',
    phase: 'review',
    title: 'Review',
    description: 'Code review',
    assignedAgent: 'reviewer',
    status: 'completed',
    dependencies: [],
    files: [],
    result: {
      success: true,
      output: '',
      artifacts: [],
      issues,
      duration: 100,
    },
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };
  return {
    id: 'pipeline-1',
    project,
    config,
    status: 'completed',
    currentPhase: 'review',
    iteration: 1,
    tasks: [task],
    agents: [],
    startedAt: new Date().toISOString(),
    logs: [],
  };
}

function makeFeedback(issues: TaskIssue[]): AgentFeedback {
  return {
    fromAgent: 'reviewer',
    toAgent: 'coder',
    phase: 'review',
    type: 'fix-request',
    issues,
    context: 'test context',
    suggestedAction: 'fix issues',
  };
}

const PROJECT_PATH = '/test/project';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PatchGenerator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('PatchGenerator', () => {
  let generator: PatchGenerator;

  beforeEach(() => {
    jest.clearAllMocks();
    generator = new PatchGenerator(PROJECT_PATH);
  });

  it('returns empty array for an empty issues list', () => {
    const patches = generator.generatePatches([]);
    expect(patches).toEqual([]);
  });

  it('generates remove-unused-import transform for unused import message', () => {
    const issue = makeIssue({
      message: "'fs' is declared but its value is never read",
      file: 'src/utils.ts',
      autoFixable: true,
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('transform');
    expect(patches[0].transformType).toBe('remove-unused-import');
    expect(patches[0].confidence).toBe('high');
    expect(patches[0].file).toBe('src/utils.ts');
    expect(patches[0].sourceIssue).toBe(issue);
  });

  it('generates remove-console transform for console.log in production', () => {
    const issue = makeIssue({
      message: 'console.log found in production code — remove console',
      file: 'src/app.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('remove-console');
    expect(patches[0].confidence).toBe('high');
  });

  it('generates replace-any-type transform for no-explicit-any', () => {
    const issue = makeIssue({
      message: 'Unexpected any. Specify a different type. (@typescript-eslint/no-explicit-any)',
      file: 'src/handler.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('replace-any-type');
    expect(patches[0].confidence).toBe('medium');
  });

  it('generates fix-empty-catch transform for empty catch block', () => {
    const issue = makeIssue({
      message: 'Empty catch block (no-empty)',
      file: 'src/service.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('fix-empty-catch');
    expect(patches[0].confidence).toBe('high');
  });

  it('generates extract-hardcoded-secret transform for hardcoded password', () => {
    const issue = makeIssue({
      message: 'Hardcoded password detected in source file',
      file: 'src/config.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('extract-hardcoded-secret');
  });

  it('generates remove-non-null-assertion transform', () => {
    const issue = makeIssue({
      message: 'Forbidden non-null assertion (no-non-null-assertion)',
      file: 'src/parser.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('remove-non-null-assertion');
    expect(patches[0].confidence).toBe('medium');
  });

  it('generates replace patch from suggestion with inline code', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('line1\nconst x: any = 5;\nline3\n' as never);

    const issue = makeIssue({
      message: 'Use a specific type instead of any',
      file: 'src/module.ts',
      line: 2,
      suggestion: '`const x: number = 5;`',
      autoFixable: true,
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].type).toBe('replace');
    expect(patches[0].line).toBe(2);
    expect(patches[0].newCode).toBe('const x: number = 5;');
    expect(patches[0].oldCode).toBe('const x: any = 5;');
    expect(patches[0].confidence).toBe('high');
  });

  it('generates replace patch from suggestion with fenced code block', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('line1\nold code\nline3\n' as never);

    const issue = makeIssue({
      message: 'Fix this code',
      file: 'src/file.ts',
      line: 2,
      suggestion: '```ts\nnew code here\n```',
      autoFixable: false,
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].newCode).toBe('new code here');
    expect(patches[0].confidence).toBe('medium');
  });

  it('generates add-missing-import transform for cannot-find-module', () => {
    const issue = makeIssue({
      message: "Cannot find module 'lodash'",
      file: 'src/helpers.ts',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].transformType).toBe('add-missing-import');
    expect(patches[0].description).toContain('lodash');
  });

  it('returns empty array when no pattern matches the issue', () => {
    const issue = makeIssue({
      message: 'Some unrecognized complex architecture issue',
    });
    const patches = generator.generatePatches([issue]);
    expect(patches).toEqual([]);
  });

  it('handles file-read error gracefully in suggestion branch', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('ENOENT: file not found');
    });

    const issue = makeIssue({
      message: 'Fix this line',
      file: 'src/broken.ts',
      line: 1,
      suggestion: '`fixed()`',
    });
    const patches = generator.generatePatches([issue]);

    expect(patches).toHaveLength(1);
    expect(patches[0].oldCode).toBe('');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PatchApplicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('PatchApplicator', () => {
  let applicator: PatchApplicator;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransformFile.mockReset();
    mockApplyPatches.mockReset();
    applicator = new PatchApplicator(PROJECT_PATH);
  });

  it('applies transform patch via CodeTransformer.transformFile', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 2, changes: [] });

    const patch = makePatch({ type: 'transform', transformType: 'remove-console' });
    const result = applicator.apply(patch);

    expect(result.applied).toBe(true);
    expect(result.validated).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(mockTransformFile).toHaveBeenCalledWith('src/test.ts', ['remove-console']);
  });

  it('marks transform patch as not-applied when appliedCount is 0', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 0, changes: [] });

    const patch = makePatch({ type: 'transform', transformType: 'fix-empty-catch' });
    const result = applicator.apply(patch);

    expect(result.applied).toBe(false);
    expect(result.validated).toBe(true);
  });

  it('applies line patch via CodeTransformer.applyPatches', () => {
    mockApplyPatches.mockReturnValue({
      applied: 1,
      failed: 0,
      results: [{
        patch: { file: 'src/test.ts', line: 5, oldCode: 'old', newCode: 'new', description: '' },
        success: true,
      }],
    });

    const patch = makePatch({ type: 'replace', line: 5, oldCode: 'old', newCode: 'new' });
    const result = applicator.apply(patch);

    expect(result.applied).toBe(true);
    expect(mockApplyPatches).toHaveBeenCalledTimes(1);
  });

  it('returns error for line patch missing line or newCode', () => {
    const patch = makePatch({ type: 'replace', line: undefined, newCode: undefined });
    const result = applicator.apply(patch);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('line');
  });

  it('catches exception and returns error result', () => {
    mockTransformFile.mockImplementation(() => {
      throw new Error('internal boom');
    });

    const patch = makePatch({ type: 'transform', transformType: 'remove-console' });
    const result = applicator.apply(patch);

    expect(result.applied).toBe(false);
    expect(result.error).toContain('internal boom');
  });

  it('applyAll groups same-file transform patches into one transformFile call', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const patches: Patch[] = [
      makePatch({ id: 'p1', file: 'src/a.ts', type: 'transform', transformType: 'remove-console' }),
      makePatch({ id: 'p2', file: 'src/a.ts', type: 'transform', transformType: 'fix-empty-catch' }),
    ];
    const results = applicator.applyAll(patches);

    expect(results).toHaveLength(2);
    expect(mockTransformFile).toHaveBeenCalledTimes(1);
    expect(mockTransformFile).toHaveBeenCalledWith('src/a.ts', ['remove-console', 'fix-empty-catch']);
  });

  it('applyAll processes line patches separately from transform patches', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });
    mockApplyPatches.mockReturnValue({
      applied: 1,
      failed: 0,
      results: [{
        patch: { file: 'src/b.ts', line: 10, oldCode: '', newCode: 'new code', description: '' },
        success: true,
      }],
    });

    const patches: Patch[] = [
      makePatch({ id: 'p1', file: 'src/a.ts', type: 'transform', transformType: 'remove-console' }),
      makePatch({ id: 'p2', file: 'src/b.ts', type: 'replace', line: 10, newCode: 'new code' }),
    ];
    const results = applicator.applyAll(patches);

    expect(results).toHaveLength(2);
    expect(mockTransformFile).toHaveBeenCalledTimes(1);
    expect(mockApplyPatches).toHaveBeenCalledTimes(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  PatchValidator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('PatchValidator', () => {
  let validator: PatchValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PatchValidator(PROJECT_PATH);
  });

  describe('validate (full)', () => {
    it('returns valid when both TypeScript and lint checks pass', () => {
      mockExecSync.mockReturnValue('' as never);
      const result = validator.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('collects TypeScript errors when tsc fails with TS error codes', () => {
      const tsError = new Error('tsc failed') as Error & { stdout: string };
      tsError.stdout = [
        'src/file.ts(10,5): error TS2345: Argument of type string is not assignable',
        'src/file.ts(20,1): error TS2304: Cannot find name Foo',
      ].join('\n');

      mockExecSync
        .mockImplementationOnce(() => { throw tsError; })
        .mockReturnValueOnce('' as never);

      const result = validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain('error TS2345');
      expect(result.errors[1]).toContain('error TS2304');
    });

    it('collects lint errors when eslint fails', () => {
      const lintError = new Error(
        '1:1  error  Unexpected var  no-var\n2:5  warning  Missing semicolon  semi',
      );

      mockExecSync
        .mockReturnValueOnce('' as never)
        .mockImplementationOnce(() => { throw lintError; });

      const result = validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('treats tsc failure without TS error codes as valid', () => {
      const execError = new Error('Command not found: npx');
      mockExecSync
        .mockImplementationOnce(() => { throw execError; })
        .mockReturnValueOnce('' as never);

      const result = validator.validate();
      expect(result.valid).toBe(true);
    });

    it('accumulates errors from both TypeScript and lint failures', () => {
      const tsError = new Error('ts') as Error & { stdout: string };
      tsError.stdout = 'src/x.ts(1,1): error TS1234: oops';
      const lintError = new Error('1:1  error  Bad code  some-rule');

      mockExecSync
        .mockImplementationOnce(() => { throw tsError; })
        .mockImplementationOnce(() => { throw lintError; });

      const result = validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('quickValidate', () => {
    it('returns valid for file with balanced brackets', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('function foo() { return [1, (2 + 3)]; }' as never);

      const result = validator.quickValidate('src/file.ts');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns bracket-mismatch error for unbalanced brackets', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('function foo() { return [1, 2; }' as never);

      const result = validator.quickValidate('src/file.ts');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('괄호 불일치'))).toBe(true);
    });

    it('returns error for non-existent file', () => {
      mockFs.existsSync.mockReturnValue(false);
      const result = validator.quickValidate('src/missing.ts');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('파일 없음');
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  FeedbackRouter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FeedbackRouter', () => {
  let router: FeedbackRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransformFile.mockReset();
    mockApplyPatches.mockReset();
    mockFixFromIssues.mockReset();
    mockFixFromIssues.mockReturnValue({ success: true, appliedCount: 0, changes: [] });
    router = new FeedbackRouter(PROJECT_PATH);
  });

  it('routeFeedback generates and applies patches for auto-fixable issues', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const issues: TaskIssue[] = [
      makeIssue({
        message: "unused import 'path' declared but never read",
        file: 'src/a.ts',
        autoFixable: true,
      }),
    ];
    const result = router.routeFeedback([makeFeedback(issues)]);

    expect(result.totalIssues).toBe(1);
    expect(result.autoFixableCount).toBe(1);
    expect(result.patchesGenerated).toBeGreaterThanOrEqual(1);
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('routeFeedback routes non-auto-fixable issues to manualFixNeeded', () => {
    const issues: TaskIssue[] = [
      makeIssue({ message: 'Complex refactoring needed for better abstraction', autoFixable: false }),
    ];
    const result = router.routeFeedback([makeFeedback(issues)]);

    expect(result.manualFixNeeded).toHaveLength(1);
    expect(result.autoFixableCount).toBe(0);
  });

  it('routeFeedback detects auto-fixable issues by message pattern even if autoFixable is false', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const issues: TaskIssue[] = [
      makeIssue({
        message: 'console.info should not be in production code',
        file: 'src/logger.ts',
        autoFixable: false,
      }),
    ];
    const result = router.routeFeedback([makeFeedback(issues)]);

    expect(result.autoFixableCount).toBe(1);
    expect(result.manualFixNeeded).toHaveLength(0);
  });

  it('fixFromPipelineResult extracts issues from task results', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const issues: TaskIssue[] = [
      makeIssue({
        message: 'Empty catch block (no-empty)',
        file: 'src/service.ts',
        autoFixable: true,
      }),
    ];
    const state = makePipelineState(issues);
    const result = router.fixFromPipelineResult(state);

    expect(result.totalIssues).toBe(1);
    expect(result.autoFixableCount).toBe(1);
    expect(result.patchesGenerated).toBeGreaterThanOrEqual(1);
  });

  it('fixFromPipelineResult returns early with zero counts when no auto-fixable issues', () => {
    const issues: TaskIssue[] = [
      makeIssue({ message: 'Complex structural problem', autoFixable: false }),
    ];
    const state = makePipelineState(issues);
    const result = router.fixFromPipelineResult(state);

    expect(result.success).toBe(true);
    expect(result.autoFixableCount).toBe(0);
    expect(result.patchesGenerated).toBe(0);
    expect(result.patchesApplied).toBe(0);
    expect(result.manualFixNeeded).toHaveLength(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DirectFeedbackPipeline (integration facade)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('DirectFeedbackPipeline', () => {
  let pipeline: DirectFeedbackPipeline;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransformFile.mockReset();
    mockApplyPatches.mockReset();
    mockFixFromIssues.mockReset();
    mockFixFromIssues.mockReturnValue({ success: true, appliedCount: 0, changes: [] });
    pipeline = new DirectFeedbackPipeline(PROJECT_PATH);
  });

  it('execute delegates to FeedbackRouter.fixFromPipelineResult', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const issues: TaskIssue[] = [
      makeIssue({
        message: "unused import declared but never read",
        file: 'src/x.ts',
        autoFixable: true,
      }),
    ];
    const state = makePipelineState(issues);
    const result = pipeline.execute(state);

    expect(result).toHaveProperty('totalIssues', 1);
    expect(result).toHaveProperty('patchesGenerated');
    expect(result).toHaveProperty('patchesApplied');
    expect(result).toHaveProperty('duration');
  });

  it('executeFromFeedback delegates to FeedbackRouter.routeFeedback', () => {
    mockTransformFile.mockReturnValue({ success: true, appliedCount: 1, changes: [] });

    const issues: TaskIssue[] = [
      makeIssue({
        message: 'Unexpected any (no-explicit-any)',
        file: 'src/y.ts',
        autoFixable: true,
      }),
    ];
    const result = pipeline.executeFromFeedback([makeFeedback(issues)]);

    expect(result.totalIssues).toBe(1);
    expect(result.autoFixableCount).toBe(1);
  });

  it('validateProject delegates to PatchValidator.validate', () => {
    mockExecSync.mockReturnValue('' as never);
    const result = pipeline.validateProject();

    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result.valid).toBe(true);
  });

  it('getFeedbackRouter returns a FeedbackRouter instance', () => {
    const router = pipeline.getFeedbackRouter();
    expect(router).toBeInstanceOf(FeedbackRouter);
  });

  it('execute returns success true with zero patches when only manual issues exist', () => {
    const issues: TaskIssue[] = [
      makeIssue({ message: 'Needs architectural redesign', autoFixable: false }),
    ];
    const state = makePipelineState(issues);
    const result = pipeline.execute(state);

    expect(result.success).toBe(true);
    expect(result.patchesApplied).toBe(0);
    expect(result.manualFixNeeded).toHaveLength(1);
  });
});
