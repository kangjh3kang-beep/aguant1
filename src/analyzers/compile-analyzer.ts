import { StageResult, ReviewIssue } from '../types';
import { runProcess } from '../utils/process-runner';

const TS_ERROR_REGEX = /^(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/;
const GENERIC_ERROR_REGEX = /^(.+):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s+(.+)$/;

/**
 * 컴파일 결과에서 이슈를 파싱합니다.
 */
export function parseCompileOutput(output: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match = trimmed.match(TS_ERROR_REGEX);
    if (match) {
      issues.push({
        stage: 'compile',
        severity: 'error',
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[5],
        rule: match[4],
      });
      continue;
    }

    match = trimmed.match(GENERIC_ERROR_REGEX);
    if (match) {
      issues.push({
        stage: 'compile',
        severity: 'error',
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: match[5],
        rule: match[4],
      });
    }
  }

  return issues;
}

/**
 * 컴파일 분석을 수행합니다.
 */
export function analyzeCompile(
  projectPath: string,
  command?: string,
): StageResult {
  const start = Date.now();
  const cmd = command ?? 'npx tsc --noEmit';

  const result = runProcess(cmd, projectPath);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const issues = parseCompileOutput(combinedOutput);

  const status = result.exitCode === 0 ? 'pass' : 'fail';
  const duration = Date.now() - start;

  return {
    stage: 'compile',
    status,
    issues,
    duration,
    summary:
      status === 'pass'
        ? 'Compilation succeeded with no errors.'
        : `Compilation failed with ${issues.length} error(s).`,
  };
}
