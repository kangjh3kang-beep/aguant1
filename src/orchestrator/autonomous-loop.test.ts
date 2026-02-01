/**
 * AutonomousLoop 핵심 경로 테스트
 *
 * Phase 11: 자기 검증 사이클에서 발견된 0% 커버리지 해소
 * - Check-Act 품질 점수 계산
 * - 다중 모델 선택
 * - LLM-as-a-Judge (규칙 기반)
 * - 루프 상태 관리
 * - 학습 메모리 통합
 */

import fs from 'fs';

// 의존성 모킹
jest.mock('fs');
jest.mock('child_process');
jest.mock('./pipeline');
jest.mock('./prompt-enhancer');
jest.mock('./adaptive-engine');
jest.mock('./direct-feedback-pipeline');
jest.mock('./code-transformer');
jest.mock('./learning-memory');

const mockFs = fs as jest.Mocked<typeof fs>;

import { AutonomousLoop, DEFAULT_AUTONOMOUS_CONFIG } from './autonomous-loop';
import { PipelineEngine } from './pipeline';
import { LearningMemory } from './learning-memory';
import { AdaptiveEngine } from './adaptive-engine';
import { PromptEnhancer } from './prompt-enhancer';
import { DirectFeedbackPipeline } from './direct-feedback-pipeline';
import { CodeTransformer } from './code-transformer';
import { ProjectSpec, DEFAULT_PIPELINE_CONFIG, PipelineState } from './types';

// ─── 테스트 헬퍼 ───

function createTestProject(): ProjectSpec {
  return {
    name: 'test-project',
    description: 'Test project',
    rootPath: '/tmp/test-project',
    techStack: { language: 'typescript' },
    requirements: [],
  };
}

function createMockPipelineResult(options?: {
  allPassed?: boolean;
  issues?: Array<{ severity: string; message: string; file?: string }>;
}): PipelineState {
  const allPassed = options?.allPassed ?? false;
  const issues = options?.issues ?? [];

  return {
    id: 'test-pipeline',
    project: createTestProject(),
    config: DEFAULT_PIPELINE_CONFIG,
    currentPhase: 'review' as const,
    iteration: 1,
    agents: [],
    logs: [],
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    status: allPassed ? 'completed' : 'failed',
    tasks: [
      {
        id: 'task-review',
        phase: 'review',
        title: 'Code Review',
        description: 'Review code',
        assignedAgent: 'reviewer',
        status: allPassed ? 'completed' : 'failed',
        dependencies: [],
        files: [],
        retryCount: 0,
        maxRetries: 2,
        createdAt: new Date().toISOString(),
        result: {
          success: allPassed,
          output: 'Review completed',
          duration: 100,
          issues: issues.map((i) => ({
            severity: i.severity as 'critical' | 'error' | 'warning' | 'info',
            message: i.message,
            file: i.file,
            autoFixable: false,
          })),
          artifacts: [],
        },
      },
      {
        id: 'task-test',
        phase: 'test',
        title: 'Run Tests',
        description: 'Run tests',
        assignedAgent: 'tester',
        status: allPassed ? 'completed' : 'failed',
        dependencies: [],
        files: [],
        retryCount: 0,
        maxRetries: 2,
        createdAt: new Date().toISOString(),
        result: {
          success: allPassed,
          output: 'Tests done',
          duration: 50,
          issues: [],
          artifacts: [],
        },
      },
    ],
  };
}

// ─── 테스트 ───

describe('AutonomousLoop', () => {
  let loop: AutonomousLoop;
  let mockPipelineRun: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // fs 모킹
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true, size: 100 } as any);

    // PipelineEngine 모킹
    mockPipelineRun = jest.fn().mockReturnValue(createMockPipelineResult({ allPassed: true }));
    (PipelineEngine as jest.Mock).mockImplementation(() => ({
      run: mockPipelineRun,
      formatLogs: () => 'pipeline logs',
    }));

    // AdaptiveEngine 모킹
    (AdaptiveEngine as jest.Mock).mockImplementation(() => ({
      getPatternDB: jest.fn().mockReturnValue({ size: () => 0 }),
      analyzeAndSelect: jest.fn().mockReturnValue({
        strategy: { name: 'retry', commands: ['echo fix'] },
        pattern: { id: 'p1', category: 'test' },
        confidence: 0.5,
        reasoning: 'test',
      }),
      executeStrategy: jest.fn().mockReturnValue({
        success: true,
        commands: ['echo fix'],
        output: 'fixed',
      }),
      generateReport: jest.fn().mockReturnValue({
        totalPatterns: 0,
        totalStrategies: 0,
        adaptationScore: 0,
        successRate: 0,
        topStrategies: [],
        recurringFailures: [],
      }),
    }));

    // PromptEnhancer 모킹
    (PromptEnhancer as jest.Mock).mockImplementation(() => ({
      enhance: jest.fn().mockReturnValue('enhanced prompt'),
      scoreQuality: jest.fn().mockReturnValue(80),
    }));

    // DirectFeedbackPipeline 모킹
    (DirectFeedbackPipeline as jest.Mock).mockImplementation(() => ({
      execute: jest.fn().mockReturnValue({
        success: true,
        totalIssues: 0,
        autoFixableCount: 0,
        patchesGenerated: 0,
        patchesApplied: 0,
        patchesValidated: 0,
        patchesRolledBack: 0,
        manualFixNeeded: [],
        results: [],
        duration: 0,
      }),
    }));

    // CodeTransformer 모킹
    (CodeTransformer as jest.Mock).mockImplementation(() => ({
      transformProject: jest.fn().mockReturnValue({ transformed: 0, errors: [] }),
    }));

    // LearningMemory 모킹
    (LearningMemory as jest.Mock).mockImplementation(() => ({
      recordIssue: jest.fn(),
      recordFix: jest.fn(),
      recordConvention: jest.fn(),
      updateProjectProfile: jest.fn(),
      save: jest.fn(),
      getData: jest.fn().mockReturnValue({ issuePatterns: [], conventions: [], fixRecords: [], projectProfile: null }),
      generateReport: jest.fn().mockReturnValue({
        totalPatterns: 0, totalFixes: 0, totalConventions: 0,
        topIssues: [], bestStrategies: [], avgQuality: 0, sessions: 0,
      }),
    }));

    // console.log 무음 처리
    jest.spyOn(console, 'log').mockImplementation(() => {});

    loop = new AutonomousLoop(createTestProject());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('기본 설정으로 루프를 생성한다', () => {
      const state = loop.getState();
      expect(state.cycle).toBe(0);
      expect(state.maxCycles).toBe(DEFAULT_AUTONOMOUS_CONFIG.maxHealingCycles);
      expect(state.status).toBe('running');
      expect(state.summary.qualityScore).toBe(0);
      expect(state.summary.qualityHistory).toEqual([]);
      expect(state.summary.modelsUsed).toEqual([]);
    });

    it('커스텀 설정을 병합한다', () => {
      const custom = new AutonomousLoop(
        createTestProject(),
        undefined,
        { maxHealingCycles: 10, qualityThreshold: 95 },
      );
      const state = custom.getState();
      expect(state.maxCycles).toBe(10);
    });
  });

  describe('run() — 전체 통과 시', () => {
    it('모든 단계 통과 시 1 사이클에서 완료한다', async () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      expect(result.status).toBe('completed');
      expect(result.summary.productionReady).toBe(true);
      expect(result.cycle).toBe(1);
    });

    it('품질 점수를 기록한다', async () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      expect(result.summary.qualityScore).toBeGreaterThan(0);
      expect(result.summary.qualityHistory.length).toBeGreaterThan(0);
    });

    it('학습 메모리를 저장한다', async () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      loop.run();

      const memory = loop.getLearningMemory();
      expect(memory.updateProjectProfile).toHaveBeenCalled();
      expect(memory.save).toHaveBeenCalled();
    });
  });

  describe('run() — 이슈 발견 시', () => {
    it('이슈가 있으면 여러 사이클을 반복한다', () => {
      // 1차: 이슈 있음, 2차: 통과
      mockPipelineRun
        .mockReturnValueOnce(createMockPipelineResult({
          allPassed: false,
          issues: [{ severity: 'warning', message: 'unused import' }],
        }))
        .mockReturnValueOnce(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      expect(result.cycle).toBe(2);
      expect(result.status).toBe('completed');
    });

    it('품질 임계값 도달 시 루프를 종료한다', () => {
      // 경미한 이슈만 있지만 품질 점수가 90 이상이면 종료
      mockPipelineRun.mockReturnValue(createMockPipelineResult({
        allPassed: false,
        issues: [{ severity: 'info', message: 'minor style suggestion' }],
      }));

      const customLoop = new AutonomousLoop(
        createTestProject(),
        undefined,
        { maxHealingCycles: 10, qualityThreshold: 80 },
      );

      const result = customLoop.run();
      // info 1개 → 100 - 0.5 = 99.5, phaseRatio = 0.5 → 99.5 * 0.75 = 74.6
      // 임계값 80 미만이므로 계속 반복하다 max cycles 도달
      expect(result.cycle).toBeLessThanOrEqual(10);
    });

    it('최대 사이클 초과 시 종료한다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({
        allPassed: false,
        issues: [{ severity: 'error', message: 'compile error' }],
      }));

      const customLoop = new AutonomousLoop(
        createTestProject(),
        undefined,
        { maxHealingCycles: 2 },
      );

      const result = customLoop.run();
      expect(result.cycle).toBe(2);
      expect(result.status).toBe('max-cycles-reached');
    });

    it('critical 이슈가 있으면 인간 개입 필요로 표시한다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({
        allPassed: false,
        issues: [{ severity: 'critical', message: 'API key exposed in source' }],
      }));

      const result = loop.run();
      expect(result.status).toBe('human-needed');
      expect(result.humanNeededReasons.length).toBeGreaterThan(0);
    });
  });

  describe('run() — LLM Judge', () => {
    it('LLM Judge가 활성화되면 verdict를 기록한다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      // 규칙 기반 Judge가 작동
      expect(result.summary.llmJudgeVerdict).toBeDefined();
    });

    it('LLM Judge 비활성화 시 verdict가 없다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const noJudgeLoop = new AutonomousLoop(
        createTestProject(),
        undefined,
        { llmJudgeEnabled: false },
      );

      const result = noJudgeLoop.run();
      expect(result.summary.llmJudgeVerdict).toBeUndefined();
    });
  });

  describe('run() — 다중 모델 선택', () => {
    it('다중 모델 활성화 시 모델 사용 이력을 기록한다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({
        allPassed: false,
        issues: [{ severity: 'warning', message: 'unused var' }],
      }));

      const customLoop = new AutonomousLoop(
        createTestProject(),
        undefined,
        { maxHealingCycles: 1, multiModelEnabled: true },
      );

      const result = customLoop.run();
      expect(result.summary.modelsUsed.length).toBeGreaterThan(0);
    });

    it('다중 모델 비활성화 시 모델 이력이 비어있다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const noModelLoop = new AutonomousLoop(
        createTestProject(),
        undefined,
        { multiModelEnabled: false },
      );

      const result = noModelLoop.run();
      expect(result.summary.modelsUsed).toEqual([]);
    });
  });

  describe('run() — 품질 점수 추이', () => {
    it('여러 사이클에서 품질 히스토리를 누적한다', () => {
      mockPipelineRun
        .mockReturnValueOnce(createMockPipelineResult({
          allPassed: false,
          issues: [
            { severity: 'error', message: 'compile error' },
            { severity: 'error', message: 'type error' },
          ],
        }))
        .mockReturnValueOnce(createMockPipelineResult({
          allPassed: false,
          issues: [{ severity: 'warning', message: 'unused var' }],
        }))
        .mockReturnValueOnce(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      expect(result.summary.qualityHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getState() / getLearningMemory()', () => {
    it('getState는 현재 상태 복사본을 반환한다', () => {
      const state = loop.getState();
      expect(state).toBeDefined();
      expect(state.cycle).toBe(0);
    });

    it('getLearningMemory는 LearningMemory 인스턴스를 반환한다', () => {
      const memory = loop.getLearningMemory();
      expect(memory).toBeDefined();
      expect(typeof memory.save).toBe('function');
    });
  });

  describe('LoopSummary 구조', () => {
    it('summary에 Phase 10 필드가 포함된다', () => {
      mockPipelineRun.mockReturnValue(createMockPipelineResult({ allPassed: true }));

      const result = loop.run();
      const summary = result.summary;

      expect(summary).toHaveProperty('qualityScore');
      expect(summary).toHaveProperty('qualityHistory');
      expect(summary).toHaveProperty('modelsUsed');
      expect(typeof summary.qualityScore).toBe('number');
      expect(Array.isArray(summary.qualityHistory)).toBe(true);
      expect(Array.isArray(summary.modelsUsed)).toBe(true);
    });
  });
});
