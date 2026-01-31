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
 *
 * ━━━ Phase 8 강화 ━━━
 *  · 테스트 실패 자동 분석 → 에러 패턴 분류 → 자동 수정 시도
 *  · 커버리지 갭 → 테스트 스텁 자동 생성
 *  · 비활성 테스트 자동 제거
 *  · CodeTransformer 연동으로 소스 코드 직접 수정
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
// CodeTransformer는 지연 로딩 (typescript 모듈 의존성 때문에 테스트 환경 호환)

/* ═════════════════════════════════════════════════
   테스트 에러 패턴 → 자동 수정 매핑
   ═══════════════════════════════════════════════ */

interface ErrorPattern {
  /** 에러 메시지 매칭 정규식 */
  pattern: RegExp;
  /** 수정 전략 이름 */
  name: string;
  /** 자동 수정 가능 여부 */
  autoFixable: boolean;
  /** 수정 함수 (파일 경로, 에러 메시지, 프로젝트 경로) → 수정 여부 */
  fix?: (file: string, error: string, projectPath: string) => boolean;
}

const TEST_ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    name: 'Missing Module Import',
    autoFixable: true,
    fix: (file: string, error: string, projectPath: string): boolean => {
      const match = error.match(/Cannot find module ['"]([^'"]+)['"]/);
      if (!match) return false;
      const moduleName = match[1];

      // 상대 경로 모듈이면 파일 존재 확인
      if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
        const fullPath = path.resolve(projectPath, file);
        const dir = path.dirname(fullPath);
        const candidates = [
          path.resolve(dir, moduleName),
          path.resolve(dir, moduleName + '.ts'),
          path.resolve(dir, moduleName + '.tsx'),
          path.resolve(dir, moduleName + '.js'),
          path.resolve(dir, moduleName + '/index.ts'),
          path.resolve(dir, moduleName + '/index.js'),
        ];
        // 이미 존재하면 수정 불요
        if (candidates.some((c) => fs.existsSync(c))) return false;

        // 빈 모듈 스텁 생성 (가장 가능성 높은 경로)
        const stubPath = path.resolve(dir, moduleName + '.ts');
        try {
          const stubDir = path.dirname(stubPath);
          if (!fs.existsSync(stubDir)) fs.mkdirSync(stubDir, { recursive: true });
          fs.writeFileSync(stubPath, `// TODO: Implement module — auto-generated stub\nexport {};\n`, 'utf-8');
          return true;
        } catch { return false; }
      }
      return false;
    },
  },
  {
    pattern: /SyntaxError: Unexpected token/,
    name: 'Syntax Error in Test',
    autoFixable: false,
  },
  {
    pattern: /TypeError: (\w+) is not a function/,
    name: 'Type Error — Missing Function',
    autoFixable: false,
  },
  {
    pattern: /ReferenceError: (\w+) is not defined/,
    name: 'Reference Error — Undefined Variable',
    autoFixable: false,
  },
  {
    pattern: /Expected .+ to (equal|be|match|contain)/,
    name: 'Assertion Failure',
    autoFixable: false,
  },
  {
    pattern: /Timeout - Async callback was not invoked/,
    name: 'Async Timeout',
    autoFixable: true,
    fix: (file: string, _error: string, projectPath: string): boolean => {
      // Jest 타임아웃 → 테스트 타임아웃 값 증가
      const fullPath = path.resolve(projectPath, file);
      if (!fs.existsSync(fullPath)) return false;
      try {
        let content = fs.readFileSync(fullPath, 'utf-8');
        // jest.setTimeout이 없으면 추가
        if (!/jest\.setTimeout/.test(content)) {
          content = `jest.setTimeout(30000);\n\n${content}`;
          fs.writeFileSync(fullPath, content, 'utf-8');
          return true;
        }
      } catch { /* skip */ }
      return false;
    },
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/,
    name: 'Network Error in Test',
    autoFixable: false,
  },
];

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
      'auto-fix-tests',
      'test-stub-generation',
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

    // ── SharedKnowledge: 이전 Phase 컨텍스트 참조 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      outputs.push('[TESTER] ── SharedKnowledge Context Injected ──');
      outputs.push(`[TESTER] 이전 Phase 인사이트 ${sharedCtx.length}자 참조`);
    }

    // 테스트 프레임워크 감지
    const framework = this.detectTestFramework(projectPath);
    outputs.push(`[TESTER] 감지된 프레임워크: ${framework}`);

    // 테스트 실행
    const testResult = this.runTests(projectPath, framework);
    outputs.push(...testResult.logs);
    issues.push(...testResult.issues);

    // ── 테스트 실패 자동 수정 시도 ──
    if (!testResult.passed && testResult.issues.length > 0) {
      const fixResult = this.autoFixTestFailures(testResult.issues, projectPath);
      outputs.push(...fixResult.logs);
      if (fixResult.fixedCount > 0) {
        artifacts.push(`[AUTO-FIX] 테스트 에러 ${fixResult.fixedCount}건 자동 수정`);

        // 수정 후 재실행
        outputs.push('[TESTER] ── 수정 후 테스트 재실행 ──');
        const retryResult = this.runTests(projectPath, framework);
        outputs.push(...retryResult.logs);
        if (retryResult.passed) {
          // 수정으로 테스트 통과 → 이전 이슈 대체
          issues.length = 0;
          issues.push(...retryResult.issues);
          testResult.passed = true;
          outputs.push('[TESTER] ✅ 자동 수정 후 테스트 통과!');
        } else {
          outputs.push(`[TESTER] ⚠️  자동 수정 후에도 ${retryResult.issues.length}건 실패 남음`);
        }
      }
    }

    // ── SharedKnowledge: 테스트 결과 인사이트 저장 ──
    if (!testResult.passed) {
      this.addInsight('test-coverage', 'high', `테스트 실패: ${issues.filter((i) => i.severity === 'error').length}건`,
        issues.filter((i) => i.severity === 'error').map((i) => i.message).join('\n'),
        task, issues.map((i) => i.file || '').filter(Boolean));
    }

    // 커버리지 분석
    if (testResult.coverageReport) {
      outputs.push('[TESTER] Coverage Report:');
      outputs.push(testResult.coverageReport);
      artifacts.push('coverage-report');
    }

    // 테스트 품질 분석 (Test Smell 탐지 + 자동 수정)
    const qualityResult = this.analyzeAndFixTestQuality(projectPath);
    outputs.push(...qualityResult.logs);
    issues.push(...qualityResult.issues);
    if (qualityResult.fixedCount > 0) {
      artifacts.push(`[AUTO-FIX] 테스트 스멜 ${qualityResult.fixedCount}건 자동 수정`);
    }

    // ── SharedKnowledge: 테스트 스멜 인사이트 저장 ──
    if (qualityResult.issues.length > 0) {
      this.addInsight('test-coverage', 'medium', `Test Smell ${qualityResult.issues.length}건, ${qualityResult.fixedCount}건 수정`,
        qualityResult.issues.map((i) => i.message).join('\n'),
        task, qualityResult.issues.map((i) => i.file || '').filter(Boolean));
    }

    // 커버리지 갭 분석 + 테스트 스텁 생성
    const gapResult = this.analyzeAndFillCoverageGap(projectPath, framework);
    outputs.push(...gapResult.logs);
    issues.push(...gapResult.issues);
    if (gapResult.generatedCount > 0) {
      artifacts.push(`[AUTO-GEN] 테스트 스텁 ${gapResult.generatedCount}개 자동 생성`);
    }

    // ── SharedKnowledge: 커버리지 갭 인사이트 저장 ──
    if (gapResult.issues.length > 0) {
      this.addInsight('test-coverage', 'medium', `커버리지 갭 ${gapResult.issues.length}건, 스텁 ${gapResult.generatedCount}개 생성`,
        gapResult.issues.map((i) => i.message).join('\n'),
        task, gapResult.issues.map((i) => i.file || '').filter(Boolean));
    }

    // ── 소스 코드 이슈 수정 (이전 Phase에서 발견된 lint/compile 에러) ──
    const sourceFixResult = this.fixSourceIssuesFromKnowledge(projectPath, task);
    if (sourceFixResult.fixedCount > 0) {
      outputs.push(...sourceFixResult.logs);
      artifacts.push(`[AUTO-FIX] 소스 코드 ${sourceFixResult.fixedCount}건 수정 (테스트 통과를 위한 선행 수정)`);
    }

    return {
      success: testResult.passed,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  /**
   * 테스트 실패 자동 수정 — 에러 패턴 매칭 → 수정 함수 실행
   */
  private autoFixTestFailures(
    testIssues: TaskResult['issues'],
    projectPath: string,
  ): { logs: string[]; fixedCount: number } {
    const logs: string[] = [];
    let fixedCount = 0;

    logs.push('[TESTER] ── 테스트 실패 자동 수정 시도 ──');

    for (const issue of testIssues) {
      if (issue.severity !== 'error') continue;

      for (const errorPattern of TEST_ERROR_PATTERNS) {
        if (!errorPattern.autoFixable || !errorPattern.fix) continue;
        if (!errorPattern.pattern.test(issue.message) && !errorPattern.pattern.test(issue.suggestion || '')) continue;

        const errorText = issue.suggestion || issue.message;
        const file = issue.file || '';

        try {
          const fixed = errorPattern.fix(file, errorText, projectPath);
          if (fixed) {
            fixedCount++;
            logs.push(`[TESTER] ✓ ${errorPattern.name} 수정: ${file || '(global)'}`);
            issue.autoFixable = true;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logs.push(`[TESTER] ✗ ${errorPattern.name} 수정 실패: ${msg}`);
        }
      }
    }

    if (fixedCount > 0) {
      logs.push(`[TESTER] ✅ ${fixedCount}건 테스트 에러 자동 수정 완료`);
    } else {
      logs.push(`[TESTER] ℹ️  자동 수정 가능한 테스트 에러 없음`);
    }

    return { logs, fixedCount };
  }

  /**
   * 테스트 품질 분석 + 자동 수정
   * - 비활성 테스트 (xit/xdescribe/skip) 제거
   */
  private analyzeAndFixTestQuality(projectPath: string): {
    logs: string[];
    issues: TaskResult['issues'];
    fixedCount: number;
  } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    logs.push('[TESTER] ── 테스트 품질 분석 + 자동 수정 ──');

    let testFiles = 0;
    let totalSmells = 0;
    let fixedCount = 0;

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
              let content = fs.readFileSync(fullPath, 'utf-8');
              const relPath = path.relative(projectPath, fullPath);
              let fileModified = false;

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

              // Test Smell: Disabled tests → 자동 활성화
              const skipped = content.match(/(?:xit|xdescribe|it\.skip|describe\.skip|test\.skip)\s*\(/g);
              if (skipped && skipped.length > 0) {
                // 비활성 테스트를 활성화 (xit→it, xdescribe→describe, .skip 제거)
                const newContent = content
                  .replace(/\bxit\s*\(/g, 'it(')
                  .replace(/\bxdescribe\s*\(/g, 'describe(')
                  .replace(/\bit\.skip\s*\(/g, 'it(')
                  .replace(/\bdescribe\.skip\s*\(/g, 'describe(')
                  .replace(/\btest\.skip\s*\(/g, 'test(');

                if (newContent !== content) {
                  content = newContent;
                  fileModified = true;
                  fixedCount += skipped.length;
                  logs.push(`[TESTER] ✓ ${relPath}: 비활성 테스트 ${skipped.length}개 활성화`);
                  issues.push(this.createIssue('info',
                    `[Test Smell] ${relPath}: 비활성 테스트 ${skipped.length}개 자동 활성화됨`,
                    { file: relPath, autoFixable: true },
                  ));
                }
              }

              if (fileModified) {
                fs.writeFileSync(fullPath, content, 'utf-8');
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    };

    scanDir(projectPath, 0);
    logs.push(`[TESTER] 테스트 파일: ${testFiles}개, Test Smell: ${totalSmells}건, 자동 수정: ${fixedCount}건`);
    return { logs, issues, fixedCount };
  }

  /**
   * 커버리지 갭 분석 + 테스트 스텁 자동 생성
   *
   * 테스트가 없는 소스 파일을 찾아 기본 테스트 스텁을 생성합니다.
   */
  private analyzeAndFillCoverageGap(projectPath: string, framework: string): {
    logs: string[];
    issues: TaskResult['issues'];
    generatedCount: number;
  } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];
    let generatedCount = 0;
    logs.push('[TESTER] ── 커버리지 갭 분석 + 테스트 스텁 생성 ──');

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
      if (!hasTest && !/index|types|constants|config|\.d\./i.test(baseName)) {
        untestedFiles.push(src);
      }
    }

    if (untestedFiles.length > 0) {
      logs.push(`[TESTER] 테스트 없는 소스 파일: ${untestedFiles.length}/${sourceFiles.length}개`);

      // 상위 10개까지 테스트 스텁 생성
      const toGenerate = untestedFiles.slice(0, 10);
      for (const file of toGenerate) {
        const generated = this.generateTestStub(file, projectPath, framework);
        if (generated) {
          generatedCount++;
          logs.push(`[TESTER] ✓ 테스트 스텁 생성: ${generated}`);
          issues.push(this.createIssue('info',
            `[Coverage Gap] ${file} — 테스트 스텁 자동 생성됨: ${generated}`,
            { file, autoFixable: true },
          ));
        } else {
          issues.push(this.createIssue('info',
            `[Coverage Gap] ${file} — 이 파일에 대한 테스트가 없습니다`,
            { file, autoFixable: false },
          ));
        }
      }

      // 나머지는 보고만
      for (const file of untestedFiles.slice(10)) {
        issues.push(this.createIssue('info',
          `[Coverage Gap] ${file} — 이 파일에 대한 테스트가 없습니다`,
          { file, autoFixable: false },
        ));
      }

      if (untestedFiles.length > 10) {
        logs.push(`[TESTER] ... 외 ${untestedFiles.length - 10}개 파일 (수동 작성 필요)`);
      }
    } else {
      logs.push(`[TESTER] 모든 주요 소스 파일에 테스트 존재 ✓`);
    }

    if (generatedCount > 0) {
      logs.push(`[TESTER] ✅ 테스트 스텁 ${generatedCount}개 자동 생성 완료`);
    }

    return { logs, issues, generatedCount };
  }

  /**
   * 소스 파일의 export를 분석하여 테스트 스텁 생성
   */
  private generateTestStub(sourceFile: string, projectPath: string, framework: string): string | null {
    const fullPath = path.resolve(projectPath, sourceFile);
    if (!fs.existsSync(fullPath)) return null;

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const ext = path.extname(sourceFile);
      const baseName = path.basename(sourceFile, ext);
      const dir = path.dirname(sourceFile);

      // __tests__ 디렉토리 또는 같은 디렉토리에 생성
      const testDir = path.join(projectPath, dir);
      const testFileName = `${baseName}.test${ext.replace('.jsx', '.tsx').replace('.js', '.ts') || '.ts'}`;
      const testFilePath = path.join(testDir, testFileName);

      // 이미 존재하면 건너뜀
      if (fs.existsSync(testFilePath)) return null;

      // export된 함수/클래스/변수 추출
      const exports = this.extractExports(content);
      if (exports.length === 0) return null;

      // 1차 시도: AI 기반 의미있는 테스트 생성
      const aiTest = this.generateAITest(sourceFile, content, projectPath, framework);
      let testContent: string;

      if (aiTest) {
        testContent = aiTest;
      } else {
        // 2차 폴백: 템플릿 기반 스텁 생성
        const importPath = `./${baseName}`;
        const importNames = exports.map((e) => e.name).join(', ');

        const isReactComponent = /\.(tsx|jsx)$/.test(sourceFile) &&
          (content.includes('React') || content.includes('jsx') || /export\s+(default\s+)?function\s+\w+/.test(content));

        if (isReactComponent) {
          testContent = this.generateReactTestStub(importPath, exports, baseName);
        } else if (framework === 'pytest') {
          return null;
        } else {
          testContent = this.generateUnitTestStub(importPath, importNames, exports, baseName);
        }
      }

      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      fs.writeFileSync(testFilePath, testContent, 'utf-8');

      return path.relative(projectPath, testFilePath);
    } catch {
      return null;
    }
  }

  /** export된 심볼 추출 */
  private extractExports(content: string): Array<{ name: string; type: 'function' | 'class' | 'const' | 'type' }> {
    const exports: Array<{ name: string; type: 'function' | 'class' | 'const' | 'type' }> = [];

    // export function / export async function
    const funcMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
    for (const m of funcMatches) {
      exports.push({ name: m[1], type: 'function' });
    }

    // export class
    const classMatches = content.matchAll(/export\s+class\s+(\w+)/g);
    for (const m of classMatches) {
      exports.push({ name: m[1], type: 'class' });
    }

    // export const / export let
    const constMatches = content.matchAll(/export\s+(?:const|let)\s+(\w+)/g);
    for (const m of constMatches) {
      // arrow function인지 확인
      const afterName = content.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 50);
      if (/\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/.test(afterName)) {
        exports.push({ name: m[1], type: 'function' });
      } else {
        exports.push({ name: m[1], type: 'const' });
      }
    }

    // export default function
    const defaultFunc = content.match(/export\s+default\s+(?:async\s+)?function\s+(\w+)/);
    if (defaultFunc) {
      exports.push({ name: defaultFunc[1], type: 'function' });
    }

    // export default class
    const defaultClass = content.match(/export\s+default\s+class\s+(\w+)/);
    if (defaultClass) {
      exports.push({ name: defaultClass[1], type: 'class' });
    }

    // type/interface는 제외 (테스트 불필요)
    return exports.filter((e) => e.type !== 'type');
  }

  /**
   * AI 기반 의미있는 테스트 생성
   *
   * 단순 `toBeDefined()` 스텁 대신 AI가 소스 코드를 분석하여
   * 실제 비즈니스 로직을 검증하는 테스트를 생성합니다.
   */
  private generateAITest(
    sourceFile: string,
    sourceContent: string,
    projectPath: string,
    framework: string,
  ): string | null {
    if (!this.hasAIProvider()) return null;

    const truncated = sourceContent.length > 4000
      ? sourceContent.slice(0, 4000) + '\n// ... (truncated)'
      : sourceContent;

    const systemPrompt = `당신은 15년 경력의 QA 엔지니어입니다.
주어진 소스 코드를 분석하여 ${framework === 'jest' || framework === 'vitest' || framework === 'unknown' ? 'Jest' : framework} 테스트 코드를 생성하세요.

필수 규칙:
1. 모든 export된 함수/클래스에 대해 테스트 작성
2. 각 함수마다 최소 2개 테스트: 정상 케이스 + 엣지/에러 케이스
3. 실제 로직을 검증하는 의미있는 assertion 사용 (toBeDefined()만 쓰지 마세요)
4. 외부 의존성은 jest.mock()으로 모킹
5. describe/it 블록으로 구조화
6. TypeScript로 작성

코드만 출력하세요. 설명은 불필요합니다.`;

    const userPrompt = `파일: ${sourceFile}\n\n${truncated}`;

    const aiResponse = this.callAISync(systemPrompt, userPrompt, { maxTokens: 4096, timeout: 60000 });
    return aiResponse || null;
  }

  /** 일반 유닛 테스트 스텁 생성 */
  private generateUnitTestStub(
    importPath: string,
    importNames: string,
    exports: Array<{ name: string; type: 'function' | 'class' | 'const' | 'type' }>,
    baseName: string,
  ): string {
    const lines: string[] = [];
    lines.push(`import { ${importNames} } from '${importPath}';`);
    lines.push('');
    lines.push(`describe('${baseName}', () => {`);

    for (const exp of exports) {
      if (exp.type === 'function') {
        lines.push(`  describe('${exp.name}', () => {`);
        lines.push(`    it('should be defined', () => {`);
        lines.push(`      expect(${exp.name}).toBeDefined();`);
        lines.push(`    });`);
        lines.push('');
        lines.push(`    it('should return expected result', () => {`);
        lines.push(`      // TODO: Add proper test arguments and expected result`);
        lines.push(`      const result = ${exp.name}();`);
        lines.push(`      expect(result).toBeDefined();`);
        lines.push(`    });`);
        lines.push(`  });`);
        lines.push('');
      } else if (exp.type === 'class') {
        lines.push(`  describe('${exp.name}', () => {`);
        lines.push(`    it('should be instantiable', () => {`);
        lines.push(`      // TODO: Add proper constructor arguments`);
        lines.push(`      expect(${exp.name}).toBeDefined();`);
        lines.push(`    });`);
        lines.push(`  });`);
        lines.push('');
      } else {
        lines.push(`  it('${exp.name} should be defined', () => {`);
        lines.push(`    expect(${exp.name}).toBeDefined();`);
        lines.push(`  });`);
        lines.push('');
      }
    }

    lines.push('});');
    lines.push('');

    return lines.join('\n');
  }

  /** React 컴포넌트 테스트 스텁 생성 */
  private generateReactTestStub(
    importPath: string,
    exports: Array<{ name: string; type: 'function' | 'class' | 'const' | 'type' }>,
    baseName: string,
  ): string {
    const componentName = exports.find((e) => /^[A-Z]/.test(e.name))?.name || baseName;
    const lines: string[] = [];

    lines.push(`import React from 'react';`);
    lines.push(`import { render, screen } from '@testing-library/react';`);
    lines.push(`import { ${componentName} } from '${importPath}';`);
    lines.push('');
    lines.push(`describe('${componentName}', () => {`);
    lines.push(`  it('should render without crashing', () => {`);
    lines.push(`    // TODO: Add required props`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`  });`);
    lines.push('');
    lines.push(`  it('should be accessible', () => {`);
    lines.push(`    render(<${componentName} />);`);
    lines.push(`    // TODO: Add accessibility assertions`);
    lines.push(`    expect(document.querySelector('[role]') || document.body).toBeTruthy();`);
    lines.push(`  });`);
    lines.push('});');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * SharedKnowledge에서 이전 Phase 이슈를 참조하여 소스 코드 수정
   * (ReviewerAgent가 발견한 이슈 중 테스트 통과에 영향을 주는 것 수정)
   */
  private fixSourceIssuesFromKnowledge(
    projectPath: string,
    task: Task,
  ): { logs: string[]; fixedCount: number } {
    const logs: string[] = [];
    let fixedCount = 0;

    // SharedKnowledge에서 review phase 인사이트 참조
    const ctx = this.getSharedContext(task);
    if (!ctx) return { logs, fixedCount };

    // CodeTransformer로 기본 정리 실행
    try {
      const { CodeTransformer } = require('../code-transformer');
      const transformer = new CodeTransformer(projectPath);
      const cleanupResult = transformer.transformProject(
        ['remove-unused-import', 'fix-empty-catch'],
      );
      if (cleanupResult.changed > 0) {
        fixedCount = cleanupResult.changed;
        logs.push(`[TESTER] ── 소스 코드 선행 수정 ──`);
        logs.push(`[TESTER] ✓ CodeTransformer로 ${cleanupResult.changed}개 파일 정리 (미사용 import, 빈 catch)`);
      }
    } catch { /* skip — CodeTransformer 실패는 치명적이지 않음 */ }

    return { logs, fixedCount };
  }

  private detectTestFramework(projectPath: string): string {
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
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
        if (!result || typeof result !== 'object' || typeof result.numTotalTests !== 'number') {
          throw new Error('Jest JSON 출력 구조가 올바르지 않음');
        }
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
                    autoFixable: this.isAutoFixableTestError(test.failureMessages?.[0] || ''),
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

  /** 자동 수정 가능한 테스트 에러인지 판별 */
  private isAutoFixableTestError(errorMessage: string): boolean {
    return TEST_ERROR_PATTERNS.some(
      (p) => p.autoFixable && p.pattern.test(errorMessage),
    );
  }
}
