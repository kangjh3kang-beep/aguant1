/**
 * Reviewer Agent - 기존 CodeReviewAgent를 래핑하여
 * 오케스트레이션 파이프라인에 통합합니다.
 */

import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
import { CodeReviewAgent } from '../../agent';
import { formatReportAsText } from '../../report-generator';

export class ReviewerAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Reviewer Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'compile-check',
      'lint-analysis',
      'test-execution',
      'auto-fix',
      'diff-review',
      'learning-loop',
      'trend-analysis',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];

    // 기존 CodeReviewAgent 사용
    const agent = new CodeReviewAgent({
      projectPath,
      stages: ['compile', 'lint', 'test'],
      verbose: false,
      autoFix: true,
      failFast: false,
    });

    const report = agent.run();
    const text = formatReportAsText(report);

    // ReviewReport의 이슈를 TaskIssue로 변환
    for (const stage of report.stages) {
      for (const issue of stage.issues) {
        issues.push({
          severity: issue.severity === 'error' ? 'error' : issue.severity === 'warning' ? 'warning' : 'info',
          message: issue.message,
          file: issue.file,
          line: issue.line,
          suggestion: issue.suggestion,
          autoFixable: issue.severity === 'warning',
        });
      }
    }

    // 학습 인사이트 추가
    if (report.insights && report.insights.length > 0) {
      for (const insight of report.insights) {
        issues.push({
          severity: 'info',
          message: `[LEARNING] ${insight}`,
          autoFixable: false,
        });
      }
    }

    // 트렌드 분석 추가
    const trendReport = agent.getTrendReport();

    const artifacts: string[] = [];
    if (report.fixReport) {
      artifacts.push(`Auto-fixed ${report.fixReport.lintFixedCount} lint issues`);
      if (report.fixReport.suggestions.length > 0) {
        artifacts.push(...report.fixReport.suggestions.map((s) => `Suggestion: ${s}`));
      }
    }

    return {
      success: report.passed,
      output: text + '\n\n' + trendReport,
      artifacts,
      issues,
      duration: report.duration,
    };
  }
}
