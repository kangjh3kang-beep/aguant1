import { StageResult, ReviewIssue } from '../types';
import { runProcess } from '../utils/process-runner';

interface JestTestResult {
  ancestorTitles: string[];
  title: string;
  status: 'passed' | 'failed' | 'pending';
  failureMessages: string[];
}

interface JestSuiteResult {
  testFilePath: string;
  testResults: JestTestResult[];
}

interface JestJsonOutput {
  success: boolean;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestSuiteResult[];
}

/**
 * Jest JSON 출력에서 이슈를 파싱합니다.
 */
export function parseTestOutput(output: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  let jestResult: JestJsonOutput;
  try {
    jestResult = JSON.parse(output);
  } catch (_err: unknown) {
    return parseTestTextOutput(output);
  }

  // testResults가 배열인지 확인
  if (!Array.isArray(jestResult.testResults)) {
    return parseTestTextOutput(output);
  }

  for (const suite of jestResult.testResults) {
    // suite.testResults가 배열인지 확인 (일부 Jest 버전에서 누락될 수 있음)
    if (!Array.isArray(suite.testResults)) {
      continue;
    }
    for (const test of suite.testResults) {
      if (test.status === 'failed') {
        const testName = [...(test.ancestorTitles || []), test.title].join(' > ');
        const failureDetail = (test.failureMessages || []).join('\n').slice(0, 500);

        issues.push({
          stage: 'test',
          severity: 'error',
          file: suite.testFilePath,
          message: `Test failed: ${testName}`,
          suggestion: failureDetail,
        });
      }
    }
  }

  return issues;
}

const JEST_FAIL_REGEX = /FAIL\s+(.+)/;
const TEST_FAIL_DETAIL_REGEX = /●\s+(.+)/;

/**
 * Jest 텍스트 출력에서 실패 정보를 파싱합니다.
 */
export function parseTestTextOutput(output: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const lines = output.split('\n');
  let currentFile = '';

  for (const line of lines) {
    const failMatch = line.match(JEST_FAIL_REGEX);
    if (failMatch) {
      currentFile = failMatch[1].trim();
      continue;
    }

    const detailMatch = line.match(TEST_FAIL_DETAIL_REGEX);
    if (detailMatch && currentFile) {
      issues.push({
        stage: 'test',
        severity: 'error',
        file: currentFile,
        message: `Test failed: ${detailMatch[1].trim()}`,
      });
    }
  }

  return issues;
}

/**
 * 테스트 분석을 수행합니다.
 */
export function analyzeTest(
  projectPath: string,
  command?: string,
): StageResult {
  const start = Date.now();
  const cmd = command ?? 'npx jest --json --no-coverage 2>/dev/null';

  const result = runProcess(cmd, projectPath);
  const output = result.stdout || result.stderr;
  const issues = parseTestOutput(output);

  const status = result.exitCode === 0 ? 'pass' : 'fail';
  const duration = Date.now() - start;

  let summary: string;
  try {
    const parsed = JSON.parse(output);
    if (
      parsed !== null && typeof parsed === 'object' &&
      typeof parsed.numTotalTests === 'number'
    ) {
      summary = `Tests: ${parsed.numPassedTests ?? 0} passed, ${parsed.numFailedTests ?? 0} failed, ${parsed.numTotalTests} total.`;
    } else {
      throw new Error('Not Jest JSON output');
    }
  } catch (_err: unknown) {
    summary =
      status === 'pass'
        ? 'All tests passed.'
        : `${issues.length} test failure(s) detected.`;
  }

  return {
    stage: 'test',
    status,
    issues,
    duration,
    summary,
  };
}
