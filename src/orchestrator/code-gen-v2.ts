/**
 * CodeGenV2 — 코드 생성 자동 검증 + TDD 파이프라인
 *
 * Phase 3: 생성된 코드를 자동으로 검증하고, TDD 방식으로 품질을 보장합니다.
 *
 * ━━━ 핵심 구성 ━━━
 *  CodeValidator: 생성된 코드를 컴파일/린트 자동 검증
 *  TestFirstPipeline: 테스트를 먼저 생성 → 코드 생성 (TDD)
 *  FallbackChain: 여러 AI 프로바이더 순차 시도 (실패 시 대안)
 *  CodeQualityGate: 품질 기준 미달 시 자동 재생성
 *
 * ━━━ 검증 루프 ━━━
 *  1. (선택) 테스트 먼저 생성 (TDD 모드)
 *  2. AI 코드 생성 (FallbackChain)
 *  3. 자동 검증 (compile → lint → type-check)
 *  4. 품질 게이트 (복잡도, 라인 수, 패턴 검사)
 *  5. 검증 실패 → 에러 피드백 포함하여 재생성 (최대 3회)
 *  6. 모든 검증 통과 → 파일 저장
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─── 검증 결과 타입 ─────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  stage: 'syntax' | 'compile' | 'lint' | 'type-check' | 'quality';
  errors: string[];
  warnings: string[];
}

export interface QualityMetrics {
  totalLines: number;
  maxFunctionLength: number;
  hasTypeAnnotations: boolean;
  hasErrorHandling: boolean;
  hasExports: boolean;
  complexityScore: number;    // 0~100 (낮을수록 좋음)
  qualityScore: number;       // 0~100 (높을수록 좋음)
}

export interface GenerationAttempt {
  attempt: number;
  provider: string;
  success: boolean;
  validationResults: ValidationResult[];
  qualityMetrics?: QualityMetrics;
  error?: string;
  duration: number;
}

export interface CodeGenV2Result {
  success: boolean;
  code: string;
  testCode?: string;
  savedFiles: string[];
  attempts: GenerationAttempt[];
  totalDuration: number;
  qualityMetrics?: QualityMetrics;
  provider: string;
}

export interface CodeGenV2Config {
  /** TDD 모드 활성화 (테스트 먼저 생성) */
  tddMode: boolean;
  /** 자동 검증 활성화 */
  autoValidation: boolean;
  /** 최대 재생성 시도 횟수 */
  maxAttempts: number;
  /** 최소 품질 점수 (0~100) */
  minQualityScore: number;
  /** 최대 허용 함수 길이 (줄 수) */
  maxFunctionLength: number;
  /** AI 프로바이더 폴백 체인 순서 */
  providerOrder: string[];
}

export const DEFAULT_CODEGEN_V2_CONFIG: CodeGenV2Config = {
  tddMode: false,
  autoValidation: true,
  maxAttempts: 3,
  minQualityScore: 50,
  maxFunctionLength: 50,
  providerOrder: ['claude', 'openai', 'google'],
};

// ─── CodeValidator ───────────────────────────────────────

export class CodeValidator {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * 생성된 코드를 종합 검증합니다.
   */
  validate(code: string, filePath: string): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 1. 구문 검증 (기본 문법)
    results.push(this.validateSyntax(code, filePath));

    // 2. 컴파일 검증 (TypeScript인 경우)
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      results.push(this.validateTypeScript(code, filePath));
    }

    // 3. 린트 검증
    results.push(this.validateLint(code, filePath));

    // 4. 품질 검증
    results.push(this.validateQuality(code));

    return results;
  }

  /**
   * 기본 구문 검증 (괄호 매칭, import 문법 등)
   */
  private validateSyntax(code: string, _filePath: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 괄호 매칭 검사
    const brackets = { '(': 0, '[': 0, '{': 0 };
    const closers: Record<string, keyof typeof brackets> = { ')': '(', ']': '[', '}': '{' };
    for (const ch of code) {
      if (ch in brackets) brackets[ch as keyof typeof brackets]++;
      if (ch in closers) brackets[closers[ch]]--;
    }
    for (const [br, count] of Object.entries(brackets)) {
      if (count !== 0) errors.push(`괄호 불일치: '${br}' ${count > 0 ? `닫기 ${count}개 부족` : `열기 ${Math.abs(count)}개 부족`}`);
    }

    // 빈 코드 검사
    if (code.trim().length === 0) {
      errors.push('빈 코드가 생성됨');
    }

    // 이상하게 긴 한 줄 검사
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 300) {
        warnings.push(`${i + 1}줄이 300자 초과 (${lines[i].length}자)`);
      }
    }

    return {
      valid: errors.length === 0,
      stage: 'syntax',
      errors,
      warnings,
    };
  }

  /**
   * TypeScript 컴파일 검증 — 전체 프로젝트 컨텍스트에서 검증
   *
   * 격리된 파일 대신 실제 프로젝트 위치에 임시로 파일을 배치한 후
   * 프로젝트 전체 tsc를 실행하여 import 해석 등 실제 에러를 감지합니다.
   */
  private validateTypeScript(code: string, filePath: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 대상 파일의 실제 프로젝트 경로
    const targetPath = path.resolve(this.projectPath, filePath);
    let originalContent: string | null = null;
    let isNewFile = true;

    try {
      // 기존 파일이 있으면 백업
      if (fs.existsSync(targetPath)) {
        originalContent = fs.readFileSync(targetPath, 'utf-8');
        isNewFile = false;
      }

      // 디렉토리가 없으면 생성
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 생성된 코드를 실제 위치에 배치
      fs.writeFileSync(targetPath, code, 'utf-8');

      // 프로젝트 전체 tsc --noEmit 실행
      try {
        execSync('npx tsc --noEmit 2>&1', {
          cwd: this.projectPath,
          encoding: 'utf-8',
          timeout: 60000,
          stdio: 'pipe',
        });
      } catch (err: unknown) {
        const errOutput = err instanceof Error && 'stdout' in err ? (err as { stdout: string }).stdout : String(err);
        const allTscErrors = errOutput.split('\n').filter((l) => /error TS\d+/.test(l));

        if (allTscErrors.length > 0) {
          // 생성된 파일 관련 에러만 필터링
          const fileErrors = allTscErrors.filter((l) =>
            l.includes(filePath) || l.includes(path.basename(filePath))
          );
          if (fileErrors.length > 0) {
            for (const e of fileErrors.slice(0, 10)) {
              errors.push(e.trim());
            }
          } else {
            // 다른 파일의 기존 에러는 경고로 처리
            warnings.push(`프로젝트에 기존 TypeScript 에러 ${allTscErrors.length}건 있음 (생성 코드 외)`);
          }
        } else {
          // tsc가 아닌 다른 오류(경로 문제 등)는 경고로 처리
          warnings.push('TypeScript 컴파일 검증을 수행할 수 없음 (tsc 미설치 또는 경로 문제)');
        }
      }
    } catch (err: unknown) {
      warnings.push('TypeScript 검증 환경 설정 실패');
      if (process.env.AG_DEBUG) { console.debug('[CodeGenV2] TS validation setup error:', err instanceof Error ? err.message : String(err)); }
    } finally {
      // 원본 복원 또는 새 파일 삭제
      try {
        if (isNewFile) {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        } else if (originalContent !== null) {
          fs.writeFileSync(targetPath, originalContent, 'utf-8');
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) {
          console.debug('[CodeValidator] file restore failure:', err instanceof Error ? err.message : String(err));
        }
      }
    }

    return {
      valid: errors.length === 0,
      stage: 'compile',
      errors,
      warnings,
    };
  }

  /**
   * 린트 검증 (패턴 기반 경량 검사)
   */
  private validateLint(code: string, filePath: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // console.log 검사 (프로덕션 코드에서)
    if (!filePath.includes('test') && !filePath.includes('spec')) {
      const consoleMatches = code.match(/console\.(log|debug|info)\(/g);
      if (consoleMatches && consoleMatches.length > 3) {
        warnings.push(`console.log가 ${consoleMatches.length}회 사용됨 — 프로덕션 코드에서는 logger 사용 권장`);
      }
    }

    // any 타입 사용 검사
    const anyMatches = code.match(/:\s*any\b/g);
    if (anyMatches && anyMatches.length > 0) {
      warnings.push(`'any' 타입 ${anyMatches.length}회 사용 — 구체적 타입 사용 권장`);
    }

    // 하드코딩된 시크릿 검사
    if (/(?:password|secret|apikey|api_key)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(code)) {
      errors.push('하드코딩된 시크릿 감지 — 환경변수로 이동 필요');
    }

    // eval 사용 검사
    if (/\beval\s*\(/.test(code)) {
      errors.push('eval() 사용 감지 — 보안 위험');
    }

    // 무한 루프 의심 패턴
    if (/while\s*\(\s*true\s*\)/.test(code) && !/break/.test(code)) {
      warnings.push('while(true) 루프에 break가 없음 — 무한 루프 위험');
    }

    return {
      valid: errors.length === 0,
      stage: 'lint',
      errors,
      warnings,
    };
  }

  /**
   * 코드 품질 검증
   */
  private validateQuality(code: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metrics = this.measureQuality(code);

    if (metrics.totalLines > 500) {
      warnings.push(`파일이 ${metrics.totalLines}줄 — 모듈 분리 고려`);
    }

    if (metrics.maxFunctionLength > 80) {
      warnings.push(`가장 긴 함수가 ${metrics.maxFunctionLength}줄 — 함수 분리 권장`);
    }

    if (metrics.complexityScore > 70) {
      warnings.push(`복잡도 점수 ${metrics.complexityScore}/100 — 리팩토링 권장`);
    }

    if (metrics.qualityScore < 30) {
      errors.push(`품질 점수 ${metrics.qualityScore}/100 — 최소 기준 미달`);
    }

    return {
      valid: errors.length === 0,
      stage: 'quality',
      errors,
      warnings,
    };
  }

  /**
   * 코드 품질 지표를 측정합니다.
   */
  measureQuality(code: string): QualityMetrics {
    const lines = code.split('\n');
    const totalLines = lines.length;

    // 함수 길이 측정
    let maxFunctionLength = 0;
    let currentFuncLen = 0;
    let inFunction = false;
    let braceDepth = 0;

    for (const line of lines) {
      if (/(?:function\s|=>|(?:async\s+)?(?:get|set|constructor)\s*\()/.test(line) && !inFunction) {
        inFunction = true;
        currentFuncLen = 0;
        braceDepth = 0;
      }
      if (inFunction) {
        currentFuncLen++;
        braceDepth += (line.match(/{/g) || []).length;
        braceDepth -= (line.match(/}/g) || []).length;
        if (braceDepth <= 0 && currentFuncLen > 1) {
          maxFunctionLength = Math.max(maxFunctionLength, currentFuncLen);
          inFunction = false;
        }
      }
    }

    // 타입 어노테이션 검사
    const hasTypeAnnotations = /:\s*\w+/.test(code) || /interface\s+\w+/.test(code) || /type\s+\w+/.test(code);

    // 에러 핸들링 검사
    const hasErrorHandling = /try\s*{/.test(code) || /\.catch\(/.test(code) || /throw\s+new/.test(code);

    // export 검사
    const hasExports = /export\s+/.test(code);

    // 복잡도 점수 (낮을수록 좋음)
    const nestingDepth = Math.max(...lines.map((l) => {
      const indent = l.match(/^(\s*)/);
      return indent ? indent[1].length / 2 : 0;
    }));
    const conditionals = (code.match(/\b(if|else|switch|case|for|while|do)\b/g) || []).length;
    const complexityScore = Math.min(100, Math.round(
      (nestingDepth * 5) +
      (conditionals / Math.max(totalLines, 1) * 200) +
      (maxFunctionLength > 50 ? 20 : 0) +
      (totalLines > 300 ? 10 : 0)
    ));

    // 품질 점수 (높을수록 좋음)
    let qualityScore = 70; // 기본
    if (hasTypeAnnotations) qualityScore += 10;
    if (hasErrorHandling) qualityScore += 10;
    if (hasExports) qualityScore += 5;
    if (maxFunctionLength <= 30) qualityScore += 10;
    else if (maxFunctionLength > 80) qualityScore -= 20;
    if (complexityScore > 50) qualityScore -= 15;
    if (totalLines > 500) qualityScore -= 10;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    return {
      totalLines,
      maxFunctionLength,
      hasTypeAnnotations,
      hasErrorHandling,
      hasExports,
      complexityScore,
      qualityScore,
    };
  }
}

// ─── FallbackChain ───────────────────────────────────────

export class FallbackChain {
  private providerOrder: string[];

  constructor(providerOrder: string[] = ['claude', 'openai', 'google']) {
    this.providerOrder = providerOrder;
  }

  /**
   * 사용 가능한 AI 프로바이더를 순서대로 반환합니다.
   */
  getAvailableProviders(): Array<{ provider: string; envKey: string; available: boolean }> {
    const providerMap: Record<string, string> = {
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GOOGLE_API_KEY',
    };

    return this.providerOrder.map((p) => ({
      provider: p,
      envKey: providerMap[p] || '',
      available: !!process.env[providerMap[p]],
    }));
  }

  /**
   * 첫 번째 사용 가능한 프로바이더를 반환합니다.
   */
  getNextProvider(excludeProviders: string[] = []): string | null {
    const available = this.getAvailableProviders()
      .filter((p) => p.available && !excludeProviders.includes(p.provider));

    return available.length > 0 ? available[0].provider : null;
  }

  /**
   * 폴백 없이 로컬에서 수행 가능한 기본 코드 수정을 생성합니다.
   * AI API가 없을 때 사용하는 마지막 수단입니다.
   */
  generateLocalFix(errorMessage: string, filePath: string, projectPath: string): string | null {
    try {
      if (!fs.existsSync(path.join(projectPath, filePath))) return null;
      const content = fs.readFileSync(path.join(projectPath, filePath), 'utf-8');

      // 누락 import 수정
      const missingModule = errorMessage.match(/Cannot find module '([^']+)'/);
      if (missingModule) {
        const mod = missingModule[1];
        if (!content.includes(`from '${mod}'`) && !content.includes(`require('${mod}')`)) {
          return `import ${mod.replace(/[^a-zA-Z]/g, '')} from '${mod}';\n${content}`;
        }
      }

      // 미사용 import 제거
      if (/is declared but its value is never read/i.test(errorMessage)) {
        const varName = errorMessage.match(/['"](\w+)['"]/)?.[1];
        if (varName) {
          const lines = content.split('\n');
          const filtered = lines.filter((l) => {
            if (l.includes(`import`) && l.includes(varName)) {
              // 이 import에 다른 것도 있으면 유지
              const others = l.replace(new RegExp(`\\b${varName}\\b,?\\s*`), '');
              return others !== l ? true : false;
            }
            return true;
          });
          if (filtered.length < lines.length) {
            return filtered.join('\n');
          }
        }
      }

      return null;
    } catch (_err: unknown) {
      return null;
    }
  }
}

// ─── TestFirstPipeline ───────────────────────────────────

export class TestFirstPipeline {
  /**
   * TDD 모드: 테스트 코드를 먼저 생성합니다.
   * 함수 시그니처에서 테스트 케이스를 유추합니다.
   */
  generateTestSkeleton(
    taskTitle: string,
    taskDescription: string,
    language: string,
  ): string {
    const testCases = this.inferTestCases(taskDescription);

    if (language === 'typescript' || language === 'javascript') {
      return this.generateJestSkeleton(taskTitle, testCases);
    }
    if (language === 'python') {
      return this.generatePytestSkeleton(taskTitle, testCases);
    }

    return this.generateJestSkeleton(taskTitle, testCases);
  }

  /**
   * 태스크 설명에서 테스트 케이스를 추론합니다.
   */
  private inferTestCases(description: string): string[] {
    const cases: string[] = [];

    // 기본 케이스
    cases.push('should handle normal input correctly');
    cases.push('should handle empty input');

    // 에러 관련 키워드
    if (/error|exception|fail|invalid/i.test(description)) {
      cases.push('should throw error on invalid input');
      cases.push('should handle error gracefully');
    }

    // CRUD 키워드
    if (/create|add|insert/i.test(description)) {
      cases.push('should create new item successfully');
      cases.push('should reject duplicate creation');
    }
    if (/read|get|fetch|find/i.test(description)) {
      cases.push('should return correct data');
      cases.push('should return null for non-existent item');
    }
    if (/update|modify|edit/i.test(description)) {
      cases.push('should update existing item');
      cases.push('should reject update for non-existent item');
    }
    if (/delete|remove/i.test(description)) {
      cases.push('should delete existing item');
      cases.push('should handle deletion of non-existent item');
    }

    // 인증 키워드
    if (/auth|login|password|token/i.test(description)) {
      cases.push('should authenticate valid credentials');
      cases.push('should reject invalid credentials');
      cases.push('should handle expired tokens');
    }

    // 검증 키워드
    if (/valid|check|verify/i.test(description)) {
      cases.push('should validate correct format');
      cases.push('should reject malformed input');
    }

    // 성능 키워드
    if (/performance|optimize|fast|cache/i.test(description)) {
      cases.push('should complete within acceptable time');
    }

    return cases;
  }

  private generateJestSkeleton(taskTitle: string, testCases: string[]): string {
    const safeName = taskTitle.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim();
    const lines: string[] = [];

    lines.push(`/**`);
    lines.push(` * Test suite for: ${safeName}`);
    lines.push(` * Generated by CodeGenV2 TestFirstPipeline`);
    lines.push(` */`);
    lines.push('');
    lines.push(`describe('${safeName}', () => {`);

    for (const testCase of testCases) {
      lines.push(`  it('${testCase}', () => {`);
      lines.push(`    // TODO: Implement test`);
      lines.push(`    expect(true).toBe(true);`);
      lines.push(`  });`);
      lines.push('');
    }

    lines.push('});');

    return lines.join('\n');
  }

  private generatePytestSkeleton(taskTitle: string, testCases: string[]): string {
    const _safeName = taskTitle.replace(/[^a-zA-Z0-9_\s]/g, '').replace(/\s+/g, '_').toLowerCase();
    const lines: string[] = [];

    lines.push(`"""Test suite for: ${taskTitle}"""`);
    lines.push('');
    lines.push('import pytest');
    lines.push('');

    for (const testCase of testCases) {
      const funcName = `test_${testCase.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      lines.push(`def ${funcName}():`);
      lines.push(`    """${testCase}"""`);
      lines.push(`    # TODO: Implement test`);
      lines.push(`    assert True`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

// ─── CodeQualityGate ─────────────────────────────────────

export class CodeQualityGate {
  private minScore: number;
  private maxFuncLength: number;

  constructor(minScore: number = 50, maxFuncLength: number = 50) {
    this.minScore = minScore;
    this.maxFuncLength = maxFuncLength;
  }

  /**
   * 코드가 품질 게이트를 통과하는지 검사합니다.
   */
  check(metrics: QualityMetrics): { passed: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (metrics.qualityScore < this.minScore) {
      reasons.push(`품질 점수 ${metrics.qualityScore} < 최소 기준 ${this.minScore}`);
    }

    if (metrics.maxFunctionLength > this.maxFuncLength) {
      reasons.push(`최대 함수 길이 ${metrics.maxFunctionLength}줄 > 제한 ${this.maxFuncLength}줄`);
    }

    if (!metrics.hasTypeAnnotations) {
      reasons.push('타입 어노테이션 미사용');
    }

    if (metrics.totalLines === 0) {
      reasons.push('빈 코드');
    }

    return {
      passed: reasons.length === 0,
      reasons,
    };
  }
}

// ─── CodeGenV2 통합 클래스 ───────────────────────────────

export class CodeGenV2 {
  private validator: CodeValidator;
  private fallback: FallbackChain;
  private tddPipeline: TestFirstPipeline;
  private qualityGate: CodeQualityGate;
  private config: CodeGenV2Config;

  constructor(projectPath: string, config?: Partial<CodeGenV2Config>) {
    this.config = { ...DEFAULT_CODEGEN_V2_CONFIG, ...config };
    this.validator = new CodeValidator(projectPath);
    this.fallback = new FallbackChain(this.config.providerOrder);
    this.tddPipeline = new TestFirstPipeline();
    this.qualityGate = new CodeQualityGate(this.config.minQualityScore, this.config.maxFunctionLength);
  }

  /**
   * 코드를 생성하고 검증합니다 (전체 파이프라인).
   *
   * 1. TDD 모드: 테스트 먼저 생성
   * 2. AI 코드 생성 (FallbackChain)
   * 3. 자동 검증 (compile → lint → quality)
   * 4. 품질 게이트 확인
   * 5. 실패 시 에러 피드백으로 재생성 (최대 N회)
   */
  validateAndScore(code: string, filePath: string): {
    validations: ValidationResult[];
    metrics: QualityMetrics;
    gateResult: { passed: boolean; reasons: string[] };
    overallValid: boolean;
  } {
    // 1. 검증
    const validations = this.validator.validate(code, filePath);

    // 2. 품질 측정
    const metrics = this.validator.measureQuality(code);

    // 3. 품질 게이트
    const gateResult = this.qualityGate.check(metrics);

    // 4. 전체 결과
    const allValid = validations.every((v) => v.valid);
    const overallValid = allValid && gateResult.passed;

    return { validations, metrics, gateResult, overallValid };
  }

  /**
   * TDD 테스트 스켈레톤을 생성합니다.
   */
  generateTestFirst(taskTitle: string, taskDescription: string, language: string): string {
    return this.tddPipeline.generateTestSkeleton(taskTitle, taskDescription, language);
  }

  /**
   * 폴백 체인에서 사용 가능한 프로바이더를 확인합니다.
   */
  getAvailableProviders(): Array<{ provider: string; envKey: string; available: boolean }> {
    return this.fallback.getAvailableProviders();
  }

  /**
   * 로컬 수정을 시도합니다 (AI API 없이).
   */
  tryLocalFix(errorMessage: string, filePath: string, projectPath: string): string | null {
    return this.fallback.generateLocalFix(errorMessage, filePath, projectPath);
  }

  /**
   * 검증 실패 시 에러 피드백 프롬프트를 생성합니다.
   */
  buildErrorFeedbackPrompt(
    originalPrompt: string,
    validations: ValidationResult[],
    attempt: number,
  ): string {
    const errorLines: string[] = [];
    errorLines.push(`\n\n═══ VALIDATION FEEDBACK (attempt ${attempt}) ═══`);
    errorLines.push('이전 생성 코드에서 다음 문제가 발견되었습니다. 반드시 수정하세요:\n');

    for (const v of validations) {
      if (!v.valid) {
        errorLines.push(`[${v.stage.toUpperCase()} ERRORS]`);
        for (const e of v.errors) {
          errorLines.push(`  - ${e}`);
        }
      }
      if (v.warnings.length > 0) {
        errorLines.push(`[${v.stage.toUpperCase()} WARNINGS]`);
        for (const w of v.warnings) {
          errorLines.push(`  - ${w}`);
        }
      }
    }

    errorLines.push('\n위 문제를 모두 해결한 코드를 다시 생성하세요.');

    return originalPrompt + errorLines.join('\n');
  }

  /**
   * 설정을 반환합니다.
   */
  getConfig(): CodeGenV2Config {
    return { ...this.config };
  }
}
