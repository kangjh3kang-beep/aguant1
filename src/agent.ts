import { AgentConfig, ReviewReport, ReviewStage, StageResult, DEFAULT_CONFIG } from './types';
import { analyzeCompile } from './analyzers/compile-analyzer';
import { analyzeLint } from './analyzers/lint-analyzer';
import { analyzeTest } from './analyzers/test-analyzer';
import { generateReport } from './report-generator';
import { logHeader, logStageStart, logStageResult, logIssue, logSummary } from './utils/logger';

type StageExecutor = (projectPath: string, command?: string) => StageResult;

const STAGE_EXECUTORS: Record<ReviewStage, StageExecutor> = {
  compile: analyzeCompile,
  lint: analyzeLint,
  test: analyzeTest,
};

/**
 * Antigravity 코드리뷰 에이전트
 *
 * 프로젝트에 대해 컴파일 -> 린트 -> 테스트 파이프라인을 자동 실행하고
 * 통합 리뷰 리포트를 생성합니다.
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
    const { projectPath, stages, verbose, failFast } = this.config;

    if (verbose) {
      logHeader(projectPath);
    }

    const stageResults: StageResult[] = [];

    for (const stage of stages) {
      if (verbose) {
        logStageStart(stage);
      }

      const result = this.executeStage(stage);
      stageResults.push(result);

      if (verbose) {
        logStageResult(stage, result.status, result.duration);
        for (const issue of result.issues) {
          logIssue(issue.severity, issue.file, issue.line, issue.message);
        }
      }

      if (failFast && result.status === 'fail') {
        // 남은 스테이지를 skip 처리
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

    const report = generateReport(projectPath, stageResults);

    if (verbose) {
      logSummary(report.passed, report.errorCount, report.warningCount, report.duration);
    }

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
    };

    return executor(this.config.projectPath, commandMap[stage]);
  }

  /**
   * 현재 설정을 반환합니다.
   */
  getConfig(): Readonly<AgentConfig> {
    return { ...this.config };
  }
}
