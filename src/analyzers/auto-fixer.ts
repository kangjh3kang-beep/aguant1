import { StageResult, ReviewIssue } from '../types';
import { runProcess } from '../utils/process-runner';

export interface FixResult {
  stage: 'fix';
  fixedCount: number;
  issues: ReviewIssue[];
  duration: number;
  summary: string;
}

/**
 * ESLint --fix를 실행하여 자동 수정 가능한 린트 이슈를 고칩니다.
 */
export function autoFixLint(projectPath: string, command?: string): FixResult {
  const start = Date.now();
  const cmd = command ?? 'npx eslint "src/**/*.ts" --fix --format json';

  const result = runProcess(cmd, projectPath);
  const duration = Date.now() - start;

  let fixedCount = 0;
  const issues: ReviewIssue[] = [];

  try {
    const parsed = JSON.parse(result.stdout || '[]') as Array<{
      filePath: string;
      fixableErrorCount?: number;
      fixableWarningCount?: number;
      messages: Array<{
        ruleId: string | null;
        severity: number;
        message: string;
        line: number;
        column: number;
      }>;
    }>;

    for (const file of parsed) {
      fixedCount += (file.fixableErrorCount ?? 0) + (file.fixableWarningCount ?? 0);
      for (const msg of file.messages) {
        issues.push({
          stage: 'lint',
          severity: msg.severity === 2 ? 'error' : 'warning',
          file: file.filePath,
          line: msg.line,
          column: msg.column,
          message: msg.message,
          rule: msg.ruleId ?? undefined,
        });
      }
    }
  } catch {
    // JSON 파싱 실패시: eslint 성공(exitCode=0)이면 수정 완료로 간주
    if (result.exitCode === 0) {
      fixedCount = 0;
    }
  }

  return {
    stage: 'fix',
    fixedCount,
    issues,
    duration,
    summary:
      fixedCount > 0
        ? `Auto-fixed ${fixedCount} issue(s). ${issues.length} remaining issue(s).`
        : fixedCount === 0 && issues.length === 0
          ? 'No fixable issues found.'
          : `Auto-fix completed. ${issues.length} unfixable issue(s) remain.`,
  };
}

/**
 * TypeScript 컴파일러로는 자동 수정이 제한적이므로,
 * 컴파일 오류 요약과 수정 제안만 반환합니다.
 */
export function suggestCompileFixes(stageResult: StageResult): string[] {
  const suggestions: string[] = [];

  for (const issue of stageResult.issues) {
    if (!issue.rule) continue;

    switch (issue.rule) {
      case 'TS2307':
        suggestions.push(
          `${issue.file}:${issue.line} - Module not found. Try: npm install <missing-module>`,
        );
        break;
      case 'TS2322':
        suggestions.push(
          `${issue.file}:${issue.line} - Type mismatch. Check the assigned value type.`,
        );
        break;
      case 'TS2339':
        suggestions.push(
          `${issue.file}:${issue.line} - Property doesn't exist. Check spelling or add the property to the type.`,
        );
        break;
      case 'TS1005':
        suggestions.push(
          `${issue.file}:${issue.line} - Syntax error. Check for missing semicolons or brackets.`,
        );
        break;
      default:
        suggestions.push(
          `${issue.file}:${issue.line} - ${issue.rule}: ${issue.message}`,
        );
    }
  }

  return suggestions;
}

/**
 * Jest 테스트 스냅샷 업데이트를 실행합니다.
 */
export function updateTestSnapshots(projectPath: string, command?: string): FixResult {
  const start = Date.now();
  const cmd = command ?? 'npx jest --updateSnapshot --json 2>/dev/null';

  const result = runProcess(cmd, projectPath);
  const duration = Date.now() - start;

  return {
    stage: 'fix',
    fixedCount: result.exitCode === 0 ? 1 : 0,
    issues: [],
    duration,
    summary:
      result.exitCode === 0
        ? 'Test snapshots updated successfully.'
        : 'Snapshot update failed. Check test errors manually.',
  };
}
