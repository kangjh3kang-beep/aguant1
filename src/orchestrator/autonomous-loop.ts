/**
 * Autonomous Self-Healing Loop Engine
 *
 * 리뷰/테스트 실패 → 원인 분석 → AI 코드 수정 → 재검증을 반복하는
 * 자율 반복 루프입니다. 인간 개입 없이 프로덕션까지 완성합니다.
 *
 * 루프 흐름:
 *   Plan → Code → Review → (실패?) → AI Fix → Review → Test → (실패?) → AI Fix → ...
 *   → Security → Browser → Deploy → 완료!
 *
 * 인간 개입이 필요한 경우:
 *   - 최대 반복 횟수 초과
 *   - 아키텍처 수준 변경 필요
 *   - 보안 critical 이슈 (시크릿 유출 등)
 *   - 사용자가 humanGates로 지정한 단계
 */

import { TaskResult, TaskIssue, TaskPhase, PipelineState, PipelineConfig, ProjectSpec, DEFAULT_PIPELINE_CONFIG } from './types';
import { PipelineEngine } from './pipeline';

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
}

export const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  maxHealingCycles: 5,
  pauseOnHumanNeeded: true,
  humanRequiredSeverity: ['critical'],
  autoFixCategories: ['lint', 'type-error', 'test-failure', 'security-warning', 'import-error', 'syntax-error'],
  maxFixFilesPerCycle: 20,
  feedbackEnabled: true,
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
  summary: LoopSummary;
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

  constructor(
    project: ProjectSpec,
    pipelineConfig?: Partial<PipelineConfig>,
    autonomousConfig?: Partial<AutonomousConfig>,
  ) {
    this.project = project;
    this.pipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...pipelineConfig };
    this.config = { ...DEFAULT_AUTONOMOUS_CONFIG, ...autonomousConfig };

    this.state = {
      cycle: 0,
      maxCycles: this.config.maxHealingCycles,
      status: 'running',
      pipelineResults: [],
      feedbacks: [],
      fixHistory: [],
      humanNeededReasons: [],
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
    this.log('╔══════════════════════════════════════════════╗');
    this.log('║   ANTIGRAVITY AUTONOMOUS LOOP                ║');
    this.log('║   Self-Healing Code Pipeline                 ║');
    this.log('╚══════════════════════════════════════════════╝');
    this.log('');
    this.log(`  프로젝트:     ${this.project.name}`);
    this.log(`  최대 사이클:  ${this.config.maxHealingCycles}`);
    this.log(`  피드백 활성:  ${this.config.feedbackEnabled}`);
    this.log('');

    while (this.state.cycle < this.config.maxHealingCycles) {
      this.state.cycle++;
      this.log(`\n${'═'.repeat(50)}`);
      this.log(`  CYCLE ${this.state.cycle}/${this.config.maxHealingCycles}`);
      this.log('═'.repeat(50));

      // 1. 파이프라인 실행
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

      // 4. 인간 개입 필요 확인
      if (analysis.humanNeeded.length > 0) {
        this.state.humanNeededReasons.push(...analysis.humanNeeded);
        if (this.config.pauseOnHumanNeeded) {
          this.log(`\n  ⚠️  인간 개입 필요: ${analysis.humanNeeded.join(', ')}`);
          this.state.status = 'human-needed';
          break;
        }
      }

      // 5. 자동 수정 가능한 이슈 → 피드백 생성 → 다음 사이클에서 수정
      if (analysis.autoFixable.length > 0 && this.config.feedbackEnabled) {
        const feedbacks = this.buildFeedbacks(analysis.autoFixable, pipelineResult);
        this.state.feedbacks.push(...feedbacks);

        const fixAttempt: FixAttempt = {
          cycle: this.state.cycle,
          phase: analysis.failedPhase || 'review',
          issueCount: analysis.totalIssues,
          fixedCount: 0, // 다음 사이클에서 갱신
          remainingCount: analysis.totalIssues,
          description: `${analysis.autoFixable.length}건 자동 수정 시도`,
        };
        this.state.fixHistory.push(fixAttempt);

        this.log(`\n  🔄 자동 수정 ${analysis.autoFixable.length}건 → 다음 사이클에서 재검증`);

        // 피드백을 파이프라인 설정에 주입
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

    this.log('');
  }

  private log(message: string): void {
    console.log(message);
  }

  getState(): LoopState {
    return { ...this.state };
  }
}
