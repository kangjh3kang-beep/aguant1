import { AgentConfig, ReviewReport, ReviewStage, StageResult, FixReport, DEFAULT_CONFIG } from './types';
import { analyzeCompile } from './analyzers/compile-analyzer';
import { analyzeLint } from './analyzers/lint-analyzer';
import { analyzeTest } from './analyzers/test-analyzer';
import { analyzeRuntime } from './analyzers/runtime-analyzer';
import { autoFixLint, suggestCompileFixes, updateTestSnapshots } from './analyzers/auto-fixer';
import { generateReport } from './report-generator';
import { logHeader, logStageStart, logStageResult, logIssue, logSummary } from './utils/logger';
import { validateProjectPath } from './utils/process-runner';
import { getChangedFiles, filterByExtension, getCurrentBranch, isGitRepo } from './utils/git-diff';
import { saveToHistory, compareWithPrevious, analyzeTrend, formatTrendReport } from './utils/review-history';

type StageExecutor = (projectPath: string, command?: string) => StageResult;

const STAGE_EXECUTORS: Record<ReviewStage, StageExecutor> = {
  compile: analyzeCompile,
  lint: analyzeLint,
  test: analyzeTest,
  runtime: analyzeRuntime,
};

/**
 * Antigravity 코드리뷰 에이전트
 *
 * 프로젝트에 대해 컴파일 -> 린트 -> 테스트 파이프라인을 자동 실행하고
 * 자동 수정 및 통합 리뷰 리포트를 생성합니다.
 */
export class CodeReviewAgent {
  private config: AgentConfig;

  constructor(config: Partial<AgentConfig> & { projectPath: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      stages: config.stages ?? (DEFAULT_CONFIG.stages as ReviewStage[]),
    };
  }

  /**
   * 전체 코드리뷰 파이프라인을 실행합니다.
   */
  run(): ReviewReport {
    const { projectPath, stages, verbose, failFast, autoFix, diffOnly, baseBranch } = this.config;

    // 프로젝트 경로 검증
    const pathCheck = validateProjectPath(projectPath);
    if (!pathCheck.valid) {
      return generateReport(projectPath, [{
        stage: 'compile',
        status: 'fail',
        issues: [{
          stage: 'compile',
          severity: 'error',
          file: projectPath,
          message: pathCheck.reason ?? 'Invalid project path',
        }],
        duration: 0,
        summary: pathCheck.reason ?? 'Invalid project path',
      }]);
    }

    if (verbose) {
      logHeader(projectPath);
    }

    // Git diff 기반 변경 파일 분석
    let gitBranch: string | undefined;
    let changedFiles: string[] | undefined;

    if (diffOnly || baseBranch) {
      if (isGitRepo(projectPath)) {
        gitBranch = getCurrentBranch(projectPath) ?? undefined;
        const diff = getChangedFiles(projectPath, { baseBranch });
        const codeFiles = filterByExtension(diff, ['.ts', '.tsx', '.js', '.jsx']);
        changedFiles = codeFiles.map((f) => f.path);

        if (verbose && changedFiles.length > 0) {
          console.log(`  Changed files (${changedFiles.length}):`);
          for (const f of changedFiles.slice(0, 20)) {
            console.log(`    - ${f}`);
          }
          if (changedFiles.length > 20) {
            console.log(`    ... and ${changedFiles.length - 20} more`);
          }
          console.log('');
        }

        if (changedFiles.length === 0) {
          if (verbose) {
            console.log('  No changed files detected. Skipping review.\n');
          }
          const report = generateReport(projectPath, []);
          report.gitBranch = gitBranch;
          report.changedFiles = [];
          return report;
        }
      }
    }

    const stageResults: StageResult[] = [];

    for (const stage of stages) {
      if (verbose) {
        logStageStart(stage);
      }

      let result: StageResult;
      try {
        result = this.executeStage(stage);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        result = {
          stage,
          status: 'fail',
          issues: [{
            stage,
            severity: 'error',
            file: projectPath,
            message: `Stage crashed: ${message}`,
          }],
          duration: 0,
          summary: `Stage ${stage} crashed unexpectedly: ${message}`,
        };
      }

      stageResults.push(result);

      if (verbose) {
        logStageResult(stage, result.status, result.duration);
        for (const issue of result.issues) {
          logIssue(issue.severity, issue.file, issue.line, issue.message);
        }
      }

      if (failFast && result.status === 'fail') {
        const remaining = stages.slice(stages.indexOf(stage) + 1);
        for (const skipped of remaining) {
          stageResults.push({
            stage: skipped,
            status: 'skip',
            issues: [],
            duration: 0,
            summary: `Skipped due to fail-fast (${stage} failed).`,
          });
        }
        break;
      }
    }

    // 자동 수정 실행
    let fixReport: FixReport | undefined;
    if (autoFix) {
      fixReport = this.runAutoFix(stageResults);
      if (verbose && fixReport) {
        console.log('\n[AUTO-FIX] Results:');
        console.log(`  Lint fixes applied: ${fixReport.lintFixedCount}`);
        console.log(`  Snapshots updated:  ${fixReport.snapshotsUpdated}`);
        if (fixReport.suggestions.length > 0) {
          console.log('  Suggestions:');
          for (const s of fixReport.suggestions.slice(0, 10)) {
            console.log(`    - ${s}`);
          }
        }
      }
    }

    const report = generateReport(projectPath, stageResults);
    report.fixReport = fixReport;
    report.gitBranch = gitBranch;
    report.changedFiles = changedFiles;

    if (verbose) {
      logSummary(report.passed, report.errorCount, report.warningCount, report.duration);
    }

    // 학습 루프: 히스토리 저장 및 비교 분석
    this.learnFromResult(report, verbose);

    return report;
  }

  /**
   * 개별 스테이지를 실행합니다.
   */
  private executeStage(stage: ReviewStage): StageResult {
    const executor = STAGE_EXECUTORS[stage];
    const commandMap: Record<ReviewStage, string | undefined> = {
      compile: this.config.compileCommand,
      lint: this.config.lintCommand,
      test: this.config.testCommand,
      runtime: this.config.runtimeCommand,
    };

    return executor(this.config.projectPath, commandMap[stage]);
  }

  /**
   * 자동 수정을 실행합니다.
   */
  private runAutoFix(stageResults: StageResult[]): FixReport {
    const start = Date.now();
    const suggestions: string[] = [];
    let lintFixedCount = 0;
    let snapshotsUpdated = false;

    // 컴파일 에러 수정 제안
    const compileResult = stageResults.find((r) => r.stage === 'compile');
    if (compileResult && compileResult.status === 'fail') {
      suggestions.push(...suggestCompileFixes(compileResult));
    }

    // 린트 자동 수정
    const lintResult = stageResults.find((r) => r.stage === 'lint');
    if (lintResult && lintResult.issues.length > 0) {
      const fixResult = autoFixLint(this.config.projectPath, this.config.lintCommand);
      lintFixedCount = fixResult.fixedCount;
    }

    // 테스트 스냅샷 업데이트
    const testResult = stageResults.find((r) => r.stage === 'test');
    if (testResult && testResult.status === 'fail') {
      const hasSnapshotFailure = testResult.issues.some(
        (i) => i.message.toLowerCase().includes('snapshot'),
      );
      if (hasSnapshotFailure) {
        const snapResult = updateTestSnapshots(this.config.projectPath, this.config.testCommand);
        snapshotsUpdated = snapResult.fixedCount > 0;
      }
    }

    return {
      lintFixedCount,
      snapshotsUpdated,
      suggestions,
      duration: Date.now() - start,
    };
  }

  /**
   * 학습 루프: 결과를 히스토리에 저장하고 이전 결과와 비교합니다.
   */
  private learnFromResult(report: ReviewReport, verbose?: boolean): void {
    try {
      // 이전 결과와 비교 분석
      const insights = compareWithPrevious(report.projectPath, report);

      // 히스토리에 저장
      saveToHistory(report.projectPath, report);

      // 비교 인사이트 리포트에 첨부
      report.insights = insights;

      if (verbose && insights.length > 0) {
        console.log('\n[LEARNING] Comparison with previous run:');
        for (const insight of insights) {
          console.log(`  ${insight}`);
        }
        console.log('');
      }
    } catch (err: unknown) {
      // 학습 실패는 리뷰 결과에 영향을 주지 않음
      if (verbose) {
        console.log('\n[LEARNING] Could not save history (non-critical).\n');
      }
      if (process.env.AG_DEBUG) { console.debug('[Agent] learning save error:', err instanceof Error ? err.message : String(err)); }
    }
  }

  /**
   * 프로젝트의 트렌드 분석 결과를 반환합니다.
   */
  getTrend(): ReturnType<typeof analyzeTrend> {
    return analyzeTrend(this.config.projectPath);
  }

  /**
   * 트렌드 분석 리포트를 포맷된 텍스트로 반환합니다.
   */
  getTrendReport(): string {
    const trend = this.getTrend();
    return formatTrendReport(trend);
  }

  /**
   * 현재 설정을 반환합니다.
   */
  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }
}
