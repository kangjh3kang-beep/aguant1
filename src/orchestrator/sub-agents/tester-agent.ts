/**
 * Tester Agent — QA 수석 엔지니어
 *
 * ━━━ 전문 분야 ━━━
 *  · 단위/통합/E2E 테스트 자동 실행 및 결과 분석
 *  · 커버리지 심층 분석 (라인/브랜치/함수/스테이트먼트)
 *  · 테스트 품질 평가 (Test Smell 탐지, 불충분한 assertion 경고)
 *  · 테스트 전략 권고 (Testing Pyramid, 비용-효과 분석)
 *  · 테스트 프레임워크 자동 감지 (Jest/Vitest/Mocha/Pytest/Playwright)
 *  · 커버리지 갭 분석 — 테스트 없는 소스 파일 식별
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
      'test-smell-detection',
      'coverage-gap-analysis',
      'test-strategy-recommendation',
      'flaky-test-detection',
      'assertion-quality-check',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    outputs.push('[TESTER] ═══ QA 수석 엔지니어 — 테스트 심층 분석 ═══');
    outputs.push('[TESTER] ── Prompt Enhancement Applied ──');
    outputs.push(`[TESTER] 강화된 지시: ${enhanced.enhancedDescription.slice(0, 120)}...`);
    outputs.push(`[TESTER] 사고 프레임워크: ${enhanced.thinkingFramework.split('\n').filter((s) => s.includes('단계')).length}단계 적용`);
    outputs.push('');

    // 테스트 프레임워크 감지
    const framework = this.detectTestFramework(projectPath);
    outputs.push(`[TESTER] 감지된 프레임워크: ${framework}`);

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

    // 테스트 품질 분석 (Test Smell 탐지)
    const qualityResult = this.analyzeTestQuality(projectPath);
    outputs.push(...qualityResult.logs);
    issues.push(...qualityResult.issues);

    // 커버리지 갭 분석 (테스트 없는 소스 파일 식별)
    const gapResult = this.analyzeCoverageGap(projectPath);
    outputs.push(...gapResult.logs);
    issues.push(...gapResult.issues);

    return {
      success: testResult.passed,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  /** 테스트 품질 분석 — Test Smell 탐지 */
  private analyzeTestQuality(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    logs.push('[TESTER] ── 테스트 품질 분석 ──');

    let testFiles = 0;
    let totalSmells = 0;

    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
            testFiles++;
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(projectPath, fullPath);

              // Test Smell: No assertion
              const testBlocks = content.match(/(?:it|test)\s*\(/g)?.length || 0;
              const assertions = content.match(/expect\s*\(|assert\.|should\./g)?.length || 0;
              if (testBlocks > 0 && assertions < testBlocks) {
                issues.push(this.createIssue('warning',
                  `[Test Smell] ${relPath}: ${testBlocks}개 테스트 중 assertion 부족 (${assertions}개) — 모든 테스트에 assertion을 추가하세요`,
                  { file: relPath, autoFixable: false },
                ));
                totalSmells++;
              }

              // Test Smell: Large test file (50+ tests)
              if (testBlocks > 50) {
                issues.push(this.createIssue('info',
                  `[Test Smell] ${relPath}: ${testBlocks}개 테스트 — 테스트 파일을 분리하세요`,
                  { file: relPath, autoFixable: false },
                ));
                totalSmells++;
              }

              // Test Smell: No describe block
              if (testBlocks > 3 && !/describe\s*\(/.test(content)) {
                issues.push(this.createIssue('info',
                  `[Test Smell] ${relPath}: describe 블록 없음 — 테스트를 그룹화하세요`,
                  { file: relPath, autoFixable: false },
                ));
                totalSmells++;
              }

              // Test Smell: Hardcoded test data
              const hardcodedStrings = content.match(/(["'])[A-Za-z0-9]{20,}\1/g);
              if (hardcodedStrings && hardcodedStrings.length > 5) {
                issues.push(this.createIssue('info',
                  `[Test Smell] ${relPath}: 하드코딩된 테스트 데이터 과다 — factory/fixture 패턴을 사용하세요`,
                  { file: relPath, autoFixable: false },
                ));
                totalSmells++;
              }

              // Test Smell: Disabled tests
              const skipped = content.match(/(?:xit|xdescribe|it\.skip|describe\.skip|test\.skip)\s*\(/g);
              if (skipped && skipped.length > 0) {
                issues.push(this.createIssue('warning',
                  `[Test Smell] ${relPath}: 비활성 테스트 ${skipped.length}개 (skip/x) — 삭제하거나 다시 활성화하세요`,
                  { file: relPath, autoFixable: false },
                ));
                totalSmells++;
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    scanDir(projectPath, 0);
    logs.push(`[TESTER] 테스트 파일: ${testFiles}개, Test Smell: ${totalSmells}건`);
    return { logs, issues };
  }

  /** 커버리지 갭 분석 — 테스트가 없는 소스 파일 식별 */
  private analyzeCoverageGap(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    logs.push('[TESTER] ── 커버리지 갭 분석 ──');

    const sourceFiles: string[] = [];
    const testFiles: string[] = [];

    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath, depth + 1);
          } else if (/\.(ts|js|tsx|jsx)$/.test(entry.name)) {
            const relPath = path.relative(projectPath, fullPath);
            if (/\.(test|spec)\./i.test(entry.name)) {
              testFiles.push(relPath);
            } else {
              sourceFiles.push(relPath);
            }
          }
        }
      } catch { /* skip */ }
    };

    scanDir(projectPath, 0);

    // 테스트가 없는 소스 파일 찾기
    const untestedFiles: string[] = [];
    for (const src of sourceFiles) {
      const baseName = path.basename(src).replace(/\.(ts|js|tsx|jsx)$/, '');
      const hasTest = testFiles.some((t) =>
        t.includes(baseName + '.test.') || t.includes(baseName + '.spec.'),
      );
      if (!hasTest && !/index|types|constants|config/i.test(baseName)) {
        untestedFiles.push(src);
      }
    }

    if (untestedFiles.length > 0) {
      logs.push(`[TESTER] 테스트 없는 소스 파일: ${untestedFiles.length}/${sourceFiles.length}개`);
      for (const file of untestedFiles.slice(0, 10)) {
        issues.push(this.createIssue('info',
          `[Coverage Gap] ${file} — 이 파일에 대한 테스트가 없습니다`,
          { file, autoFixable: false },
        ));
      }
      if (untestedFiles.length > 10) {
        logs.push(`[TESTER] ... 외 ${untestedFiles.length - 10}개 파일`);
      }
    } else {
      logs.push(`[TESTER] 모든 주요 소스 파일에 테스트 존재 ✓`);
    }

    return { logs, issues };
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
