import { StageResult, ReviewIssue, Severity } from '../types';
import { runProcess } from '../utils/process-runner';

interface EslintMessage {
  ruleId: string | null;
  severity: number; // 1 = warning, 2 = error
  message: string;
  line: number;
  column: number;
  suggestions?: Array<{ desc: string }>;
}

interface EslintFileResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
  warningCount: number;
}

function mapSeverity(eslintSeverity: number): Severity {
  return eslintSeverity === 2 ? 'error' : 'warning';
}

/**
 * ESLint JSON 출력에서 이슈를 파싱합니다.
 */
export function parseLintOutput(output: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  let results: EslintFileResult[];
  try {
    results = JSON.parse(output);
  } catch {
    // JSON 파싱 실패 시 텍스트 기반 파싱으로 폴백
    return parseLintTextOutput(output);
  }

  for (const file of results) {
    for (const msg of file.messages) {
      issues.push({
        stage: 'lint',
        severity: mapSeverity(msg.severity),
        file: file.filePath,
        line: msg.line,
        column: msg.column,
        message: msg.message,
        rule: msg.ruleId ?? undefined,
        suggestion: msg.suggestions?.[0]?.desc,
      });
    }
  }

  return issues;
}

const LINT_LINE_REGEX = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}(.+)$/;

/**
 * ESLint 텍스트 출력에서 이슈를 파싱합니다.
 */
export function parseLintTextOutput(output: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  let currentFile = '';
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // 파일 경로 라인 감지 (슬래시로 시작하거나 드라이브 문자로 시작)
    if (
      (trimmed.startsWith('/') || /^[A-Z]:\\/.test(trimmed)) &&
      !trimmed.includes(' ')
    ) {
      currentFile = trimmed;
      continue;
    }

    const match = trimmed.match(LINT_LINE_REGEX);
    if (match && currentFile) {
      issues.push({
        stage: 'lint',
        severity: match[3] === 'error' ? 'error' : 'warning',
        file: currentFile,
        line: parseInt(match[1], 10),
        column: parseInt(match[2], 10),
        message: match[4],
        rule: match[5],
      });
    }
  }

  return issues;
}

/**
 * 린트 분석을 수행합니다.
 */
export function analyzeLint(
  projectPath: string,
  command?: string,
): StageResult {
  const start = Date.now();
  const cmd = command ?? 'npx eslint "src/**/*.ts" --format json';

  const result = runProcess(cmd, projectPath);
  const output = result.stdout || result.stderr;
  const issues = parseLintOutput(output);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const status = errorCount === 0 ? 'pass' : 'fail';
  const duration = Date.now() - start;

  return {
    stage: 'lint',
    status,
    issues,
    duration,
    summary:
      issues.length === 0
        ? 'No lint issues found.'
        : `Found ${errorCount} error(s) and ${warningCount} warning(s).`,
  };
}
