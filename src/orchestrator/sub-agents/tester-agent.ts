/**
 * Tester Agent - 자동 테스트 실행 및 분석
 *
 * 단위 테스트, 통합 테스트, E2E 테스트를 실행하고
 * 커버리지 및 결과를 분석합니다.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';

export class TesterAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Tester Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'unit-testing',
      'integration-testing',
      'e2e-testing',
      'coverage-analysis',
      'test-report-generation',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    outputs.push('[TESTER] Starting test suite execution...');

    // 테스트 프레임워크 감지
    const framework = this.detectTestFramework(projectPath);
    outputs.push(`[TESTER] Detected framework: ${framework}`);

    // 테스트 실행
    const testResult = this.runTests(projectPath, framework);
    outputs.push(...testResult.logs);
    issues.push(...testResult.issues);

    // 커버리지 분석
    if (testResult.coverageReport) {
      outputs.push('[TESTER] Coverage Report:');
      outputs.push(testResult.coverageReport);
      artifacts.push('coverage-report');
    }

    return {
      success: testResult.passed,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  private detectTestFramework(projectPath: string): string {
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps.vitest) return 'vitest';
        if (allDeps.jest) return 'jest';
        if (allDeps.mocha) return 'mocha';
        if (allDeps.cypress) return 'cypress';
        if (allDeps.playwright || allDeps['@playwright/test']) return 'playwright';
      } catch {
        // ignore
      }
    }

    if (fs.existsSync(path.join(projectPath, 'pytest.ini')) ||
        fs.existsSync(path.join(projectPath, 'setup.cfg'))) {
      return 'pytest';
    }

    return 'unknown';
  }

  private runTests(projectPath: string, framework: string): { passed: boolean; logs: string[]; issues: TaskResult['issues']; coverageReport?: string } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];

    const commands: Record<string, string> = {
      jest: 'npx jest --ci --coverage --json 2>&1 || true',
      vitest: 'npx vitest run --coverage 2>&1 || true',
      mocha: 'npx mocha --exit 2>&1 || true',
      pytest: 'python -m pytest --tb=short -v 2>&1 || true',
      playwright: 'npx playwright test 2>&1 || true',
      cypress: 'npx cypress run 2>&1 || true',
      unknown: 'npm test 2>&1 || true',
    };

    const command = commands[framework] || commands.unknown;
    logs.push(`[TESTER] Running: ${command}`);

    try {
      const output = execSync(command, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: this.config.timeout || 300000,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Jest JSON 결과 파싱 시도
      if (framework === 'jest') {
        return this.parseJestOutput(output, logs, issues);
      }

      // 일반 결과 분석
      const hasFailure = /fail|error|FAILED/i.test(output);
      if (hasFailure) {
        issues.push(this.createIssue('error', 'Some tests failed', { autoFixable: false }));
      }

      logs.push(`[TESTER] Output (last 50 lines):`);
      const lines = output.split('\n');
      logs.push(...lines.slice(-50));

      return {
        passed: !hasFailure,
        logs,
        issues,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      issues.push(this.createIssue('error', `Test execution failed: ${errMsg.slice(0, 200)}`));
      logs.push(`[TESTER] Error: ${errMsg.slice(0, 500)}`);
      return { passed: false, logs, issues };
    }
  }

  private parseJestOutput(output: string, logs: string[], issues: TaskResult['issues']): { passed: boolean; logs: string[]; issues: TaskResult['issues']; coverageReport?: string } {
    try {
      // Jest JSON 출력에서 마지막 JSON 블록 추출
      const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const passed = result.numFailedTests === 0;

        logs.push(`[TESTER] Tests: ${result.numPassedTests} passed, ${result.numFailedTests} failed, ${result.numTotalTests} total`);
        logs.push(`[TESTER] Suites: ${result.numPassedTestSuites} passed, ${result.numFailedTestSuites} failed`);

        if (!passed && Array.isArray(result.testResults)) {
          for (const suite of result.testResults) {
            if (suite.status === 'failed' && Array.isArray(suite.testResults)) {
              for (const test of suite.testResults) {
                if (test.status === 'failed') {
                  issues.push(this.createIssue('error', `Test failed: ${test.fullName || test.title}`, {
                    file: suite.testFilePath,
                    suggestion: Array.isArray(test.failureMessages) ? test.failureMessages[0]?.slice(0, 300) : undefined,
                  }));
                }
              }
            }
          }
        }

        return { passed, logs, issues };
      }
    } catch {
      // JSON 파싱 실패 시 텍스트 분석으로 폴백
    }

    const hasFailure = /fail|FAIL/i.test(output);
    logs.push(`[TESTER] Output (last 30 lines):`);
    logs.push(...output.split('\n').slice(-30));

    if (hasFailure) {
      issues.push(this.createIssue('error', 'Some tests failed'));
    }

    return { passed: !hasFailure, logs, issues };
  }
}
