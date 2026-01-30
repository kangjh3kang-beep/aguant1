import { ReviewReport, StageResult } from './types';

/**
 * 스테이지 결과들을 통합하여 최종 리뷰 리포트를 생성합니다.
 */
export function generateReport(
  projectPath: string,
  stageResults: StageResult[],
): ReviewReport {
  const allIssues = stageResults.flatMap((r) => r.issues);

  const errorCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
  const infoCount = allIssues.filter((i) => i.severity === 'info').length;

  const passed = stageResults.every((r) => r.status === 'pass' || r.status === 'skip');
  const totalDuration = stageResults.reduce((sum, r) => sum + r.duration, 0);

  return {
    projectPath,
    timestamp: new Date().toISOString(),
    stages: stageResults,
    totalIssues: allIssues.length,
    errorCount,
    warningCount,
    infoCount,
    passed,
    duration: totalDuration,
  };
}

/**
 * 리포트를 사람이 읽을 수 있는 텍스트로 포맷합니다.
 */
export function formatReportAsText(report: ReviewReport): string {
  const lines: string[] = [];

  lines.push('========================================');
  lines.push('  Antigravity Code Review Report');
  lines.push('========================================');
  lines.push(`  Project:   ${report.projectPath}`);
  lines.push(`  Timestamp: ${report.timestamp}`);
  lines.push(`  Duration:  ${report.duration}ms`);
  lines.push('========================================');
  lines.push('');

  for (const stage of report.stages) {
    const statusLabel = stage.status.toUpperCase();
    lines.push(`[${stage.stage.toUpperCase()}] ${statusLabel} (${stage.duration}ms)`);
    lines.push(`  ${stage.summary}`);

    if (stage.issues.length > 0) {
      for (const issue of stage.issues) {
        const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
        lines.push(`  - [${issue.severity.toUpperCase()}] ${location}: ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`    Suggestion: ${issue.suggestion.slice(0, 200)}`);
        }
      }
    }
    lines.push('');
  }

  // Auto-fix 결과
  if (report.fixReport) {
    lines.push('[AUTO-FIX]');
    lines.push(`  Lint fixes applied: ${report.fixReport.lintFixedCount}`);
    lines.push(`  Snapshots updated:  ${report.fixReport.snapshotsUpdated}`);
    if (report.fixReport.suggestions.length > 0) {
      lines.push('  Suggestions:');
      for (const s of report.fixReport.suggestions.slice(0, 10)) {
        lines.push(`    - ${s}`);
      }
    }
    lines.push('');
  }

  // Git 정보
  if (report.gitBranch) {
    lines.push(`  Branch: ${report.gitBranch}`);
  }
  if (report.changedFiles && report.changedFiles.length > 0) {
    lines.push(`  Changed files: ${report.changedFiles.length}`);
  }

  // 학습 인사이트
  if (report.insights && report.insights.length > 0) {
    lines.push('[LEARNING INSIGHTS]');
    for (const insight of report.insights) {
      lines.push(`  ${insight}`);
    }
    lines.push('');
  }

  lines.push('----------------------------------------');
  lines.push(`  Result:   ${report.passed ? 'ALL CHECKS PASSED' : 'REVIEW FAILED'}`);
  lines.push(`  Errors:   ${report.errorCount}`);
  lines.push(`  Warnings: ${report.warningCount}`);
  lines.push(`  Info:     ${report.infoCount}`);
  lines.push(`  Total:    ${report.totalIssues} issue(s)`);
  lines.push('----------------------------------------');

  return lines.join('\n');
}

/**
 * 리포트를 JSON 형식으로 직렬화합니다.
 */
export function formatReportAsJson(report: ReviewReport): string {
  return JSON.stringify(report, null, 2);
}
