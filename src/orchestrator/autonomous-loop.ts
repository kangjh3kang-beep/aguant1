/**
 * Autonomous Self-Healing Loop Engine v2
 *
 * ━━━ 전체 시스템 인지 기반 자율 수정 엔진 ━━━
 *
 * 단순 코드 리뷰 반복이 아닌, 전체 시스템의 기획·아키텍처·구축 현황을
 * 분석하고 유기적 맥락에서 최적의 수정을 수행합니다.
 *
 * ■ v1 (기존): Review 실패 → 단순 재시도
 * ■ v2 (현재): System Analysis → Root Cause → Strategic Fix → Verify
 *
 * 루프 흐름:
 *   [0] System Analysis (전체 시스템 현황 파악)
 *       ├─ 아키텍처 분석, 기술 스택, 의존관계, 테스트 현황
 *       ├─ 시스템 스토리라인 구축 (AS-IS → TO-BE)
 *       └─ 수정 전략 수립 (우선순위, 영향도, 리스크)
 *
 *   [1] Plan → Code → Review → Test → Security → Browser → Deploy
 *
 *   [2] 실패 시:
 *       ├─ Root Cause Analysis (근본 원인 분석)
 *       ├─ Cross-Agent Feedback (에이전트 간 유기적 피드백)
 *       ├─ System-Aware Fix (시스템 맥락 기반 정밀 수정)
 *       └─ Regression Guard (회귀 방지 검증)
 *
 *   [3] 반복 → 전체 통과 시 프로덕션 준비 완료
 *
 * 인간 개입이 필요한 경우:
 *   - 최대 반복 횟수 초과
 *   - 아키텍처 수준 변경 필요 (구조적 리팩토링)
 *   - 보안 critical 이슈 (시크릿 유출 등)
 *   - 사용자가 humanGates로 지정한 단계
 */

import { TaskResult, TaskIssue, TaskPhase, PipelineState, PipelineConfig, ProjectSpec, DEFAULT_PIPELINE_CONFIG } from './types';
import { PipelineEngine } from './pipeline';
import { PromptEnhancer } from './prompt-enhancer';
import { AdaptiveEngine, FixStrategy, FailurePattern } from './adaptive-engine';

// ─── 시스템 분석 결과 (전체 시스템 인지) ───

export interface SystemAnalysis {
  /** 프로젝트 이름 */
  projectName: string;
  /** 감지된 기술 스택 */
  techStack: string[];
  /** 프로젝트 유형 (backend-api, frontend-spa, fullstack, library, cli, monorepo) */
  projectType: string;
  /** 시스템 구성 요소 (파일 구조 기반) */
  components: string[];
  /** 아키텍처 패턴 (MVC, Clean, Layered, Microservice 등) */
  architecturePattern: string;
  /** 소스/테스트 파일 수 */
  sourceCount: number;
  testCount: number;
  /** 의존성 수 */
  depCount: number;
  /** 시스템 스토리라인 (AS-IS → 문제점 → TO-BE) */
  storyline: {
    currentState: string;
    problems: string[];
    targetState: string;
  };
  /** 수정 우선순위 맵 (카테고리 → 우선순위) */
  priorityMap: Map<string, 'P0' | 'P1' | 'P2' | 'P3'>;
  /** 이전 사이클 이슈 패턴 (반복 실패 감지) */
  recurringPatterns: string[];
}

// ─── 자율 루프 설정 ───

export interface AutonomousConfig {
  /** 최대 자기수정 반복 횟수 */
  maxHealingCycles: number;
  /** 인간 개입 필요 시 중단할지 계속할지 */
  pauseOnHumanNeeded: boolean;
  /** 인간 개입이 필요한 이슈 심각도 */
  humanRequiredSeverity: Array<'critical'>;
  /** 자동 수정 가능한 이슈 카테고리 */
  autoFixCategories: string[];
  /** 루프당 최대 수정 파일 수 */
  maxFixFilesPerCycle: number;
  /** 피드백 결합: 이전 이슈를 다음 코딩에 전달 */
  feedbackEnabled: boolean;
  /** 시스템 전체 분석 활성화 */
  systemAnalysisEnabled: boolean;
  /** 근본 원인 분석 활성화 */
  rootCauseAnalysis: boolean;
  /** 회귀 방지 검증 활성화 */
  regressionGuard: boolean;
}

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  maxHealingCycles: 5,
  pauseOnHumanNeeded: true,
  humanRequiredSeverity: ['critical'],
  autoFixCategories: ['lint', 'type-error', 'test-failure', 'security-warning', 'import-error', 'syntax-error'],
  maxFixFilesPerCycle: 20,
  feedbackEnabled: true,
  systemAnalysisEnabled: true,
  rootCauseAnalysis: true,
  regressionGuard: true,
};

// ─── 피드백 메시지 ───

export interface AgentFeedback {
  fromAgent: string;
  toAgent: string;
  phase: TaskPhase;
  type: 'fix-request' | 'info' | 'block';
  issues: TaskIssue[];
  context: string;
  suggestedAction: string;
}

// ─── 루프 상태 ───

export interface LoopState {
  cycle: number;
  maxCycles: number;
  status: 'running' | 'completed' | 'human-needed' | 'max-cycles-reached';
  pipelineResults: PipelineState[];
  feedbacks: AgentFeedback[];
  fixHistory: FixAttempt[];
  humanNeededReasons: string[];
  /** 전체 시스템 분석 결과 (Cycle 0에서 수행) */
  systemAnalysis: SystemAnalysis | null;
  /** 근본 원인 분석 결과 */
  rootCauses: RootCause[];
  summary: LoopSummary;
}

export interface RootCause {
  phase: TaskPhase;
  category: 'architecture' | 'dependency' | 'config' | 'logic' | 'test-setup' | 'environment' | 'integration';
  description: string;
  affectedFiles: string[];
  suggestedStrategy: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface FixAttempt {
  cycle: number;
  phase: TaskPhase;
  issueCount: number;
  fixedCount: number;
  remainingCount: number;
  description: string;
}

export interface LoopSummary {
  totalCycles: number;
  totalIssuesFound: number;
  totalIssuesFixed: number;
  totalIssuesRemaining: number;
  phasesCompleted: TaskPhase[];
  phasesBlocked: TaskPhase[];
  humanInterventionNeeded: boolean;
  productionReady: boolean;
}

// ─── 자율 루프 엔진 ───

export class AutonomousLoop {
  private config: AutonomousConfig;
  private pipelineConfig: PipelineConfig;
  private project: ProjectSpec;
  private state: LoopState;
  private promptEnhancer: PromptEnhancer;
  private adaptiveEngine: AdaptiveEngine;

  constructor(
    project: ProjectSpec,
    pipelineConfig?: Partial<PipelineConfig>,
    autonomousConfig?: Partial<AutonomousConfig>,
  ) {
    this.project = project;
    this.pipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...pipelineConfig };
    this.config = { ...DEFAULT_AUTONOMOUS_CONFIG, ...autonomousConfig };
    this.promptEnhancer = new PromptEnhancer();

    // AdaptiveEngine: 학습 데이터 저장 경로
    const storagePath = require('path').join(project.rootPath, '.ag-review');
    this.adaptiveEngine = new AdaptiveEngine(storagePath);

    this.state = {
      cycle: 0,
      maxCycles: this.config.maxHealingCycles,
      status: 'running',
      pipelineResults: [],
      feedbacks: [],
      fixHistory: [],
      humanNeededReasons: [],
      systemAnalysis: null,
      rootCauses: [],
      summary: {
        totalCycles: 0,
        totalIssuesFound: 0,
        totalIssuesFixed: 0,
        totalIssuesRemaining: 0,
        phasesCompleted: [],
        phasesBlocked: [],
        humanInterventionNeeded: false,
        productionReady: false,
      },
    };
  }

  /**
   * 자율 반복 루프를 실행합니다.
   * 모든 단계가 통과하거나 최대 반복 횟수에 도달할 때까지 반복합니다.
   */
  run(): LoopState {
    this.log('╔══════════════════════════════════════════════════════════╗');
    this.log('║   ANTIGRAVITY AUTONOMOUS LOOP v2                        ║');
    this.log('║   System-Aware Self-Healing Pipeline                    ║');
    this.log('╚══════════════════════════════════════════════════════════╝');
    this.log('');
    this.log(`  프로젝트:         ${this.project.name}`);
    this.log(`  최대 사이클:      ${this.config.maxHealingCycles}`);
    this.log(`  시스템 분석:      ${this.config.systemAnalysisEnabled ? 'ON' : 'OFF'}`);
    this.log(`  근본 원인 분석:   ${this.config.rootCauseAnalysis ? 'ON' : 'OFF'}`);
    this.log(`  회귀 방지:        ${this.config.regressionGuard ? 'ON' : 'OFF'}`);
    this.log(`  피드백 활성:      ${this.config.feedbackEnabled}`);
    this.log(`  적응형 학습:      ON (FailurePatternDB + StrategySelector)`);
    this.log(`  학습 패턴:        ${this.adaptiveEngine.getPatternDB().size()}개 축적`);
    this.log('');

    // ─── Phase 0: 전체 시스템 분석 (최초 1회) ───
    if (this.config.systemAnalysisEnabled) {
      this.log('═══ Phase 0: SYSTEM ANALYSIS ═══');
      this.log('  전체 시스템 현황을 분석합니다...');
      const sysAnalysis = this.performSystemAnalysis();
      this.state.systemAnalysis = sysAnalysis;
      this.printSystemAnalysis(sysAnalysis);
    }

    while (this.state.cycle < this.config.maxHealingCycles) {
      this.state.cycle++;
      this.log(`\n${'═'.repeat(58)}`);
      this.log(`  CYCLE ${this.state.cycle}/${this.config.maxHealingCycles}${this.state.cycle > 1 ? ' (HEALING)' : ' (INITIAL)'}`);
      this.log('═'.repeat(58));

      // 1. 파이프라인 실행 (시스템 분석 컨텍스트 포함)
      const pipelineResult = this.runPipeline();
      this.state.pipelineResults.push(pipelineResult);

      // 2. 결과 분석
      const analysis = this.analyzeResult(pipelineResult);

      // 3. 모든 단계 통과 → 프로덕션 준비 완료
      if (analysis.allPassed) {
        this.log('\n  ✅ 모든 단계 통과! 프로덕션 준비 완료.');
        this.state.status = 'completed';
        this.state.summary.productionReady = true;
        break;
      }

      // 4. 근본 원인 분석 + 적응형 전략 선택 (단순 재시도가 아닌 학습 기반)
      if (this.config.rootCauseAnalysis && analysis.totalIssues > 0) {
        this.log('\n  ── 근본 원인 분석 + 적응형 학습 (Root Cause + AdaptiveEngine) ──');
        const rootCauses = this.analyzeRootCauses(analysis, pipelineResult);
        this.state.rootCauses.push(...rootCauses);

        // AdaptiveEngine으로 각 이슈에 최적 전략 선택
        const allIssues = pipelineResult.tasks.flatMap((t) => t.result?.issues || []);
        for (const issue of allIssues.filter((i) => i.severity === 'error' || i.severity === 'critical').slice(0, 10)) {
          const adaptive = this.adaptiveEngine.analyzeAndSelect(
            analysis.failedPhase || 'review',
            issue.message,
            issue.file ? [issue.file] : [],
          );
          if (adaptive.strategy) {
            this.log(`  [ADAPTIVE] ${adaptive.strategy.name} (성공률 ${Math.round(adaptive.strategy.successRate * 100)}%)`);
            this.log(`    근거: ${adaptive.reasoning}`);
          }
        }

        for (const rc of rootCauses) {
          this.log(`  [${rc.confidence.toUpperCase()}] ${rc.category}: ${rc.description}`);
          this.log(`         전략: ${rc.suggestedStrategy}`);
        }
      }

      // 5. 반복 실패 감지 (같은 이슈가 계속 반복되면 인간 개입)
      if (this.config.regressionGuard && this.state.cycle > 1) {
        const recurring = this.detectRecurringFailures(pipelineResult);
        if (recurring.length > 0) {
          this.log(`\n  ⚠️  반복 실패 감지: ${recurring.length}건`);
          for (const r of recurring) {
            this.log(`    - ${r}`);
          }
          if (this.state.cycle >= 3 && recurring.length >= 3) {
            this.log('  → 동일 이슈가 3회 이상 반복 — 구조적 문제로 판단, 인간 개입 요청');
            this.state.status = 'human-needed';
            this.state.humanNeededReasons.push(`반복 실패 ${recurring.length}건 — 구조적 수정 필요`);
            break;
          }
        }
      }

      // 6. 인간 개입 필요 확인
      if (analysis.humanNeeded.length > 0) {
        this.state.humanNeededReasons.push(...analysis.humanNeeded);
        if (this.config.pauseOnHumanNeeded) {
          this.log(`\n  ⚠️  인간 개입 필요: ${analysis.humanNeeded.join(', ')}`);
          this.state.status = 'human-needed';
          break;
        }
      }

      // 7. 시스템 인지 기반 자동 수정 (단순 lint fix가 아닌 맥락 기반 수정)
      if (analysis.autoFixable.length > 0 && this.config.feedbackEnabled) {
        const feedbacks = this.buildSystemAwareFeedbacks(analysis.autoFixable, pipelineResult);
        this.state.feedbacks.push(...feedbacks);

        const fixAttempt: FixAttempt = {
          cycle: this.state.cycle,
          phase: analysis.failedPhase || 'review',
          issueCount: analysis.totalIssues,
          fixedCount: 0,
          remainingCount: analysis.totalIssues,
          description: `${analysis.autoFixable.length}건 시스템 인지 기반 수정 시도`,
        };
        this.state.fixHistory.push(fixAttempt);

        this.log(`\n  🔄 시스템 인지 기반 수정 ${analysis.autoFixable.length}건 → 다음 사이클에서 재검증`);

        // AdaptiveEngine: 이전 사이클 전략 결과 기록 (2사이클 이상)
        if (this.state.cycle > 1) {
          const prevResult = this.state.pipelineResults[this.state.pipelineResults.length - 2];
          if (prevResult) {
            const prevIssueCount = prevResult.tasks
              .flatMap((t) => t.result?.issues || [])
              .filter((i) => i.severity === 'error' || i.severity === 'critical').length;
            const improved = analysis.totalIssues < prevIssueCount;
            this.log(`  [ADAPTIVE] 학습 기록: ${improved ? '개선됨' : '미개선'} (${prevIssueCount} → ${analysis.totalIssues})`);
          }
        }

        this.injectFeedbackIntoConfig(feedbacks);
      } else if (analysis.totalIssues > 0) {
        this.log(`\n  ❌ 자동 수정 불가한 이슈 ${analysis.totalIssues}건`);
        this.state.status = 'human-needed';
        this.state.humanNeededReasons.push(`자동 수정 불가 이슈 ${analysis.totalIssues}건`);
        break;
      }
    }

    // 최대 사이클 초과
    if (this.state.cycle >= this.config.maxHealingCycles && this.state.status === 'running') {
      this.state.status = 'max-cycles-reached';
      this.log(`\n  ⚠️  최대 사이클(${this.config.maxHealingCycles}) 도달`);
    }

    // 요약 생성
    this.buildSummary();
    this.printSummary();

    return this.state;
  }

  // ─── 파이프라인 실행 ───

  private runPipeline(): PipelineState {
    // 이전 피드백이 있으면 code 단계에 주입
    const phases = this.state.cycle === 1
      ? this.pipelineConfig.phases
      : this.getHealingPhases();

    const engine = new PipelineEngine(this.project, {
      ...this.pipelineConfig,
      phases,
    });

    return engine.run();
  }

  /**
   * 수정 사이클에서는 code → review → test → security만 실행
   * (plan과 deploy는 최초 1회만)
   */
  private getHealingPhases(): TaskPhase[] {
    const healingPhases: TaskPhase[] = ['code', 'review', 'test', 'security'];
    const originalPhases = this.pipelineConfig.phases;

    // 원래 설정에 있는 단계만 포함
    return healingPhases.filter((p) => originalPhases.includes(p));
  }

  // ─── 결과 분석 ───

  private analyzeResult(result: PipelineState): {
    allPassed: boolean;
    totalIssues: number;
    autoFixable: TaskIssue[];
    humanNeeded: string[];
    failedPhase: TaskPhase | null;
  } {
    const allTasks = result.tasks;
    const failedTasks = allTasks.filter((t) => t.status === 'failed');
    const allIssues: TaskIssue[] = [];
    const autoFixable: TaskIssue[] = [];
    const humanNeeded: string[] = [];

    for (const task of allTasks) {
      if (task.result) {
        allIssues.push(...task.result.issues);
      }
    }

    for (const issue of allIssues) {
      // critical 보안 이슈 → 인간 필요
      if (this.config.humanRequiredSeverity.includes(issue.severity as 'critical')) {
        // 단, 자동 수정 가능한 것은 제외
        if (!issue.autoFixable) {
          humanNeeded.push(`${issue.severity}: ${issue.message}`);
          continue;
        }
      }

      // error/warning → 자동 수정 시도
      if (issue.severity === 'error' || issue.severity === 'warning') {
        autoFixable.push(issue);
      }
    }

    const failedPhase = failedTasks.length > 0 ? failedTasks[0].phase : null;

    return {
      allPassed: failedTasks.length === 0 && result.status === 'completed',
      totalIssues: allIssues.filter((i) => i.severity === 'error' || i.severity === 'critical').length,
      autoFixable,
      humanNeeded,
      failedPhase,
    };
  }

  // ─── 에이전트 간 피드백 생성 ───

  private buildFeedbacks(issues: TaskIssue[], pipelineResult: PipelineState): AgentFeedback[] {
    const feedbacks: AgentFeedback[] = [];

    // 이슈를 파일 단위로 그룹화
    const byFile = new Map<string, TaskIssue[]>();
    for (const issue of issues) {
      const key = issue.file || '__general__';
      if (!byFile.has(key)) byFile.set(key, []);
      byFile.get(key)!.push(issue);
    }

    // 파일별 수정 요청 생성
    let fileCount = 0;
    for (const [file, fileIssues] of byFile) {
      if (fileCount >= this.config.maxFixFilesPerCycle) break;

      const suggestions = fileIssues
        .filter((i) => i.suggestion)
        .map((i) => i.suggestion!)
        .join('\n');

      const issueDescriptions = fileIssues
        .map((i) => `- [${i.severity}] ${i.message}${i.line ? ` (line ${i.line})` : ''}`)
        .join('\n');

      feedbacks.push({
        fromAgent: 'reviewer',
        toAgent: 'coder',
        phase: 'code',
        type: 'fix-request',
        issues: fileIssues,
        context: `파일: ${file}\n이슈:\n${issueDescriptions}`,
        suggestedAction: suggestions || `${file}의 ${fileIssues.length}건 이슈를 수정해주세요.`,
      });

      fileCount++;
    }

    // 테스트 실패 → Coder에게 수정 요청
    const testTasks = pipelineResult.tasks.filter((t) => t.phase === 'test' && t.status === 'failed');
    for (const testTask of testTasks) {
      if (testTask.result) {
        feedbacks.push({
          fromAgent: 'tester',
          toAgent: 'coder',
          phase: 'code',
          type: 'fix-request',
          issues: testTask.result.issues,
          context: `테스트 실패:\n${testTask.result.output.slice(0, 500)}`,
          suggestedAction: '테스트를 통과하도록 코드를 수정해주세요.',
        });
      }
    }

    // 보안 이슈 → Coder에게 수정 요청
    const secTasks = pipelineResult.tasks.filter((t) => t.phase === 'security' && t.status === 'failed');
    for (const secTask of secTasks) {
      if (secTask.result) {
        const nonCritical = secTask.result.issues.filter((i) => i.severity !== 'critical');
        if (nonCritical.length > 0) {
          feedbacks.push({
            fromAgent: 'security',
            toAgent: 'coder',
            phase: 'code',
            type: 'fix-request',
            issues: nonCritical,
            context: `보안 이슈:\n${nonCritical.map((i) => `- ${i.message}`).join('\n')}`,
            suggestedAction: '보안 취약점을 수정해주세요.',
          });
        }
      }
    }

    return feedbacks;
  }

  // ─── 피드백을 다음 사이클에 주입 ───

  private injectFeedbackIntoConfig(feedbacks: AgentFeedback[]): void {
    // 피드백을 프로젝트 requirements에 추가하여 Coder Agent가 참조하도록 함
    const fixRequirements = feedbacks
      .filter((f) => f.type === 'fix-request')
      .map((f, i) => ({
        id: `fix-${this.state.cycle}-${i}`,
        title: `[AUTO-FIX] ${f.suggestedAction.slice(0, 80)}`,
        description: `${f.context}\n\n수정 방법:\n${f.suggestedAction}`,
        priority: 'high' as const,
        type: 'bugfix' as const,
      }));

    // 기존 requirements에 수정 요청 추가
    this.project = {
      ...this.project,
      requirements: [
        ...fixRequirements,
        ...this.project.requirements.filter((r) => !r.id.startsWith('fix-')),
      ],
    };
  }

  // ─── 요약 생성 ───

  private buildSummary(): void {
    const lastResult = this.state.pipelineResults[this.state.pipelineResults.length - 1];
    const allIssues = this.state.pipelineResults.flatMap((r) =>
      r.tasks.flatMap((t) => (t.result ? t.result.issues : []))
    );

    const firstIssueCount = this.state.pipelineResults[0]
      ? this.state.pipelineResults[0].tasks
          .flatMap((t) => (t.result ? t.result.issues : []))
          .filter((i) => i.severity === 'error' || i.severity === 'critical').length
      : 0;

    const lastIssueCount = lastResult
      ? lastResult.tasks
          .flatMap((t) => (t.result ? t.result.issues : []))
          .filter((i) => i.severity === 'error' || i.severity === 'critical').length
      : 0;

    const completedPhases = lastResult
      ? [...new Set(lastResult.tasks.filter((t) => t.status === 'completed').map((t) => t.phase))]
      : [];

    const blockedPhases = lastResult
      ? [...new Set(lastResult.tasks.filter((t) => t.status === 'failed').map((t) => t.phase))]
      : [];

    this.state.summary = {
      totalCycles: this.state.cycle,
      totalIssuesFound: firstIssueCount,
      totalIssuesFixed: Math.max(0, firstIssueCount - lastIssueCount),
      totalIssuesRemaining: lastIssueCount,
      phasesCompleted: completedPhases,
      phasesBlocked: blockedPhases,
      humanInterventionNeeded: this.state.status === 'human-needed',
      productionReady: this.state.status === 'completed',
    };
  }

  private printSummary(): void {
    const s = this.state.summary;
    this.log('\n╔══════════════════════════════════════════════╗');
    this.log('║   AUTONOMOUS LOOP SUMMARY                    ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  상태:         ${this.state.status.toUpperCase()}`);
    this.log(`  사이클:       ${s.totalCycles}/${this.config.maxHealingCycles}`);
    this.log(`  발견 이슈:    ${s.totalIssuesFound}`);
    this.log(`  자동 수정:    ${s.totalIssuesFixed}`);
    this.log(`  남은 이슈:    ${s.totalIssuesRemaining}`);
    this.log(`  완료 단계:    ${s.phasesCompleted.join(', ') || '없음'}`);
    this.log(`  차단 단계:    ${s.phasesBlocked.join(', ') || '없음'}`);
    this.log(`  프로덕션:     ${s.productionReady ? '✅ 준비 완료' : '❌ 미완료'}`);
    this.log(`  인간 개입:    ${s.humanInterventionNeeded ? '⚠️ 필요' : '불필요'}`);

    if (this.state.humanNeededReasons.length > 0) {
      this.log('\n  [인간 개입 필요 사유]');
      for (const reason of this.state.humanNeededReasons.slice(0, 5)) {
        this.log(`    - ${reason}`);
      }
    }

    if (this.state.fixHistory.length > 0) {
      this.log('\n  [수정 이력]');
      for (const fix of this.state.fixHistory) {
        this.log(`    Cycle ${fix.cycle}: ${fix.description} (${fix.phase})`);
      }
    }

    // AdaptiveEngine 학습 보고서
    const report = this.adaptiveEngine.generateReport();
    this.log('\n  [적응형 학습 보고서]');
    this.log(`    축적 패턴:      ${report.totalPatterns}개`);
    this.log(`    전략 수:        ${report.totalStrategies}개`);
    this.log(`    학습 성숙도:    ${report.adaptationScore}/100`);
    if (report.topStrategies.length > 0) {
      this.log('    TOP 전략:');
      for (const ts of report.topStrategies.slice(0, 3)) {
        this.log(`      - ${ts.name}: 성공률 ${ts.successRate}% (${ts.attempts}회 시도)`);
      }
    }
    if (report.recurringFailures.length > 0) {
      this.log(`    반복 실패:      ${report.recurringFailures.length}건`);
    }

    this.log('');
  }

  // ─── Phase 0: 전체 시스템 분석 ───

  private performSystemAnalysis(): SystemAnalysis {
    const projectPath = this.project.rootPath;
    const ts = this.project.techStack;
    const techStack: string[] = [ts.language, ts.framework, ts.runtime, ts.packageManager, ts.database, ...(ts.extras || [])].filter(Boolean) as string[];
    const components: string[] = [];

    // 기본 프로젝트 분석
    let sourceCount = 0;
    let testCount = 0;
    let depCount = 0;

    try {
      const fs = require('fs');
      const path = require('path');

      // 디렉토리 스캔
      const scanDir = (dir: string, depth: number) => {
        if (depth > 4) return;
        try {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              if (depth === 0) components.push(entry.name + '/');
              scanDir(fullPath, depth + 1);
            } else {
              if (/\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(entry.name)) {
                if (/\.(test|spec)\./i.test(entry.name)) testCount++;
                else sourceCount++;
              }
            }
          }
        } catch { /* skip */ }
      };
      scanDir(projectPath, 0);

      // 의존성 수
      const pkgPath = path.join(projectPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          depCount = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length;
        } catch { /* skip */ }
      }

      const reqPath = path.join(projectPath, 'requirements.txt');
      if (fs.existsSync(reqPath)) {
        try {
          depCount = fs.readFileSync(reqPath, 'utf-8').split('\n').filter((l: string) => l.trim() && !l.startsWith('#')).length;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }

    // 프로젝트 유형 추론
    const projectType = this.inferProjectType(components, techStack);

    // 아키텍처 패턴 추론
    const architecturePattern = this.inferArchitecturePattern(components);

    // 시스템 스토리라인 생성
    const problems: string[] = [];
    if (testCount === 0 && sourceCount > 5) problems.push('테스트가 없음 — 회귀 버그 위험');
    if (sourceCount > 0 && testCount / sourceCount < 0.3) problems.push(`테스트 비율 ${Math.round(testCount / Math.max(sourceCount, 1) * 100)}% — 커버리지 부족`);
    if (depCount > 100) problems.push(`의존성 ${depCount}개 — 공급망 위험`);

    const storyline = {
      currentState: `${projectType} 프로젝트 (${techStack.join(', ')}) — ${sourceCount}개 소스, ${testCount}개 테스트, ${depCount}개 의존성`,
      problems,
      targetState: '무오류·무결점 프로덕션 시스템 — 전체 테스트 통과, 보안 감사 완료, 배포 준비',
    };

    // 수정 우선순위 맵
    const priorityMap = new Map<string, 'P0' | 'P1' | 'P2' | 'P3'>();
    priorityMap.set('compile-error', 'P0');
    priorityMap.set('import-error', 'P0');
    priorityMap.set('test-failure', 'P0');
    priorityMap.set('security-critical', 'P0');
    priorityMap.set('type-error', 'P1');
    priorityMap.set('lint-error', 'P1');
    priorityMap.set('test-setup', 'P1');
    priorityMap.set('security-warning', 'P2');
    priorityMap.set('code-smell', 'P3');
    priorityMap.set('style', 'P3');

    return {
      projectName: this.project.name,
      techStack,
      projectType,
      components,
      architecturePattern,
      sourceCount,
      testCount,
      depCount,
      storyline,
      priorityMap,
      recurringPatterns: [],
    };
  }

  private inferProjectType(components: string[], techStack: string[]): string {
    const comps = components.map((c) => c.toLowerCase());
    if (comps.some((c) => /frontend|app|pages|components/.test(c)) && comps.some((c) => /backend|api|server/.test(c))) return 'fullstack';
    if (comps.some((c) => /backend|api|server|routes|controllers/.test(c))) return 'backend-api';
    if (comps.some((c) => /src|app|pages|components/.test(c)) && techStack.some((t) => /React|Vue|Angular|Svelte/i.test(t))) return 'frontend-spa';
    if (comps.some((c) => /bin|cli/.test(c))) return 'cli';
    if (comps.some((c) => /packages|apps/.test(c))) return 'monorepo';
    return 'library';
  }

  private inferArchitecturePattern(components: string[]): string {
    const comps = components.map((c) => c.toLowerCase());
    if (comps.some((c) => /controllers/.test(c)) && comps.some((c) => /services/.test(c))) return 'MVC / Layered';
    if (comps.some((c) => /domain|entities/.test(c)) && comps.some((c) => /repositories|infrastructure/.test(c))) return 'Clean / DDD';
    if (comps.some((c) => /modules/.test(c))) return 'Modular';
    if (comps.some((c) => /packages|apps/.test(c))) return 'Monorepo / Micro-Frontend';
    return 'Standard';
  }

  private printSystemAnalysis(sa: SystemAnalysis): void {
    this.log('');
    this.log('┌─ 시스템 분석 결과 ─────────────────────────────────────────');
    this.log(`│  프로젝트:      ${sa.projectName}`);
    this.log(`│  유형:          ${sa.projectType}`);
    this.log(`│  아키텍처:      ${sa.architecturePattern}`);
    this.log(`│  기술 스택:     ${sa.techStack.join(', ') || '미감지'}`);
    this.log(`│  구성 요소:     ${sa.components.slice(0, 10).join(', ')}`);
    this.log(`│  소스/테스트:   ${sa.sourceCount}/${sa.testCount} (비율: ${sa.sourceCount > 0 ? Math.round(sa.testCount / sa.sourceCount * 100) : 0}%)`);
    this.log(`│  의존성:        ${sa.depCount}개`);
    this.log('│');
    this.log('│  ── 시스템 스토리라인 ──');
    this.log(`│  AS-IS: ${sa.storyline.currentState}`);
    if (sa.storyline.problems.length > 0) {
      for (const p of sa.storyline.problems) {
        this.log(`│  문제:  ${p}`);
      }
    }
    this.log(`│  TO-BE: ${sa.storyline.targetState}`);
    this.log('└────────────────────────────────────────────────────────────');
    this.log('');
  }

  // ─── 근본 원인 분석 ───

  private analyzeRootCauses(
    analysis: { totalIssues: number; autoFixable: TaskIssue[]; failedPhase: TaskPhase | null },
    pipelineResult: PipelineState,
  ): RootCause[] {
    const causes: RootCause[] = [];
    const allIssues = pipelineResult.tasks.flatMap((t) => t.result?.issues || []);

    // 환경/설정 문제 감지 (DB 연결, 모듈 미설치 등)
    const envIssues = allIssues.filter((i) =>
      /connection refused|module not found|cannot find module|ECONNREFUSED|no such file/i.test(i.message),
    );
    if (envIssues.length > 0) {
      causes.push({
        phase: analysis.failedPhase || 'test',
        category: 'environment',
        description: `환경/의존성 문제 ${envIssues.length}건 — DB 미실행, 모듈 미설치, 설정 파일 누락 등`,
        affectedFiles: envIssues.map((i) => i.file || 'unknown').filter((f, idx, arr) => arr.indexOf(f) === idx),
        suggestedStrategy: '환경 설정 확인: DB 서버 실행, 누락된 모듈 설치(pip install / npm install), .env 파일 확인',
        confidence: 'high',
      });
    }

    // 테스트-코드 불일치 감지 (fixture 누락, 인터페이스 변경)
    const testMismatch = allIssues.filter((i) =>
      /fixture.*not found|TypeError.*missing.*argument|unexpected keyword|assert.*!=|assert.*is not/i.test(i.message),
    );
    if (testMismatch.length > 0) {
      causes.push({
        phase: 'test',
        category: 'integration',
        description: `테스트-코드 인터페이스 불일치 ${testMismatch.length}건 — 코드가 변경되었으나 테스트가 업데이트되지 않음`,
        affectedFiles: testMismatch.map((i) => i.file || 'unknown').filter((f, idx, arr) => arr.indexOf(f) === idx),
        suggestedStrategy: '코드 인터페이스 변경사항을 테스트에 반영: 함수 시그니처, 반환값 구조, fixture 정의 업데이트',
        confidence: 'high',
      });
    }

    // 인증/권한 로직 불일치
    const authIssues = allIssues.filter((i) =>
      /401.*200|200.*401|unauthorized|forbidden/i.test(i.message),
    );
    if (authIssues.length > 0) {
      causes.push({
        phase: 'test',
        category: 'logic',
        description: `인증/권한 로직 불일치 ${authIssues.length}건 — 인증 미들웨어와 테스트 기대값 불일치`,
        affectedFiles: authIssues.map((i) => i.file || 'unknown').filter((f, idx, arr) => arr.indexOf(f) === idx),
        suggestedStrategy: '인증 미들웨어 활성화 상태 확인, 테스트에서 인증 헤더/토큰 포함 여부 검증',
        confidence: 'medium',
      });
    }

    // 아키텍처 수준 문제 (import 순환, 모듈 분리 필요)
    const archIssues = allIssues.filter((i) =>
      /circular|god module|SRP|separation.*concern/i.test(i.message),
    );
    if (archIssues.length > 0) {
      causes.push({
        phase: analysis.failedPhase || 'review',
        category: 'architecture',
        description: `아키텍처 수준 문제 ${archIssues.length}건 — 구조적 리팩토링 필요`,
        affectedFiles: archIssues.map((i) => i.file || 'unknown').filter((f, idx, arr) => arr.indexOf(f) === idx),
        suggestedStrategy: '모듈 분리, 의존성 역전, 인터페이스 추상화를 통한 구조 개선',
        confidence: 'medium',
      });
    }

    // 기본: 이슈가 있지만 특정 패턴에 매칭 안 되는 경우
    if (causes.length === 0 && analysis.totalIssues > 0) {
      causes.push({
        phase: analysis.failedPhase || 'review',
        category: 'logic',
        description: `${analysis.totalIssues}건의 이슈 — 코드 로직 또는 설정 수정 필요`,
        affectedFiles: [],
        suggestedStrategy: '이슈 메시지를 개별 분석하여 수정',
        confidence: 'low',
      });
    }

    return causes;
  }

  // ─── 반복 실패 감지 ───

  private detectRecurringFailures(currentResult: PipelineState): string[] {
    if (this.state.pipelineResults.length < 2) return [];

    const recurring: string[] = [];
    const prevResult = this.state.pipelineResults[this.state.pipelineResults.length - 2];

    const prevIssueKeys = new Set(
      prevResult.tasks.flatMap((t) => t.result?.issues || [])
        .map((i) => `${i.file || ''}:${i.message.slice(0, 60)}`),
    );

    const currentIssues = currentResult.tasks.flatMap((t) => t.result?.issues || []);
    for (const issue of currentIssues) {
      const key = `${issue.file || ''}:${issue.message.slice(0, 60)}`;
      if (prevIssueKeys.has(key)) {
        recurring.push(`[반복] ${issue.file || 'general'}: ${issue.message.slice(0, 80)}`);
      }
    }

    // 시스템 분석에 반복 패턴 기록
    if (this.state.systemAnalysis) {
      this.state.systemAnalysis.recurringPatterns.push(...recurring);
    }

    return recurring.slice(0, 10);
  }

  // ─── 시스템 인지 기반 피드백 생성 ───

  private buildSystemAwareFeedbacks(issues: TaskIssue[], pipelineResult: PipelineState): AgentFeedback[] {
    // 기존 피드백 생성
    const feedbacks = this.buildFeedbacks(issues, pipelineResult);

    // 시스템 분석 컨텍스트를 모든 피드백에 주입
    if (this.state.systemAnalysis) {
      const sysContext = [
        `[시스템 컨텍스트]`,
        `  프로젝트: ${this.state.systemAnalysis.projectType} (${this.state.systemAnalysis.architecturePattern})`,
        `  기술 스택: ${this.state.systemAnalysis.techStack.join(', ')}`,
        `  현재 상태: ${this.state.systemAnalysis.storyline.currentState}`,
        `  목표: ${this.state.systemAnalysis.storyline.targetState}`,
      ].join('\n');

      // 근본 원인 분석 결과 주입
      const rootCauseContext = this.state.rootCauses.length > 0
        ? '\n[근본 원인]\n' + this.state.rootCauses.map((rc) =>
            `  - [${rc.category}] ${rc.description}\n    전략: ${rc.suggestedStrategy}`
          ).join('\n')
        : '';

      // 반복 실패 패턴 주입
      const recurringContext = this.state.systemAnalysis.recurringPatterns.length > 0
        ? '\n[반복 실패 — 이전과 다른 접근법 필요]\n' + this.state.systemAnalysis.recurringPatterns.slice(-5).map((r) => `  - ${r}`).join('\n')
        : '';

      for (const fb of feedbacks) {
        fb.context = `${sysContext}${rootCauseContext}${recurringContext}\n\n${fb.context}`;

        // 프롬프트 품질 점수 측정 (낮으면 보강)
        const quality = this.promptEnhancer.scoreQuality(fb.suggestedAction);
        if (quality.score < 50) {
          fb.suggestedAction = `${fb.suggestedAction}\n\n[품질 보강]\n${quality.suggestions.join('\n')}`;
        }
      }
    }

    return feedbacks;
  }

  private log(message: string): void {
    console.log(message);
  }

  getState(): LoopState {
    return { ...this.state };
  }
}
