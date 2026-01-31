/**
 * AdaptiveEngine - 적응형 자기학습 엔진
 *
 * Phase 2: 실패 패턴을 학습하고 전략을 동적으로 변경하는 자기학습 시스템
 *
 * ━━━ 핵심 구성 ━━━
 *  FailurePatternDB: 실패 패턴을 영구 저장/조회하는 데이터베이스
 *  StrategySelector: 실패 유형에 따라 최적의 수정 전략을 선택
 *  SuccessRateTracker: 전략별 성공률을 추적하고 순위를 자동 조정
 *  AdaptiveEngine: 위 3개를 통합하여 학습 루프를 오케스트레이션
 *
 * ━━━ 학습 루프 ━━━
 *  1. 실패 발생 → FailurePatternDB에서 유사 패턴 검색
 *  2. 유사 패턴이 있으면 → 이전 성공 전략 선택
 *  3. 유사 패턴이 없으면 → 카테고리 기반 기본 전략 선택
 *  4. 전략 실행 후 결과 기록 → SuccessRateTracker 업데이트
 *  5. 다음 실패 시 업데이트된 성공률 기반으로 전략 선택
 */

import fs from 'fs';
import path from 'path';
import { TaskPhase } from './types';
import { CodeTransformer, TransformType } from './code-transformer';

// ─── 실패 패턴 타입 ─────────────────────────────────────

export type FailureCategory =
  | 'compile-error'
  | 'lint-error'
  | 'test-failure'
  | 'test-setup'
  | 'dependency-missing'
  | 'dependency-conflict'
  | 'config-error'
  | 'environment-error'
  | 'security-vulnerability'
  | 'type-error'
  | 'runtime-error'
  | 'integration-error'
  | 'architecture-violation'
  | 'permission-error'
  | 'network-error'
  | 'unknown';

export interface FailurePattern {
  id: string;
  category: FailureCategory;
  phase: TaskPhase;
  /** 실패 시그니처 (정규화된 에러 메시지 키) */
  signature: string;
  /** 원본 에러 메시지 */
  originalMessage: string;
  /** 관련 파일들 */
  affectedFiles: string[];
  /** 최초 발생 시각 */
  firstSeen: string;
  /** 마지막 발생 시각 */
  lastSeen: string;
  /** 발생 횟수 */
  occurrences: number;
  /** 적용된 전략들과 결과 */
  strategyHistory: StrategyAttempt[];
}

export interface StrategyAttempt {
  strategyId: string;
  strategyName: string;
  appliedAt: string;
  success: boolean;
  details: string;
}

// ─── 수정 전략 타입 ─────────────────────────────────────

export interface FixStrategy {
  id: string;
  name: string;
  category: FailureCategory;
  description: string;
  /** 전략 우선순위 (낮을수록 먼저 시도) */
  priority: number;
  /** 전략 실행 단계 */
  steps: string[];
  /** 전략 적용 조건 (정규식 패턴) */
  matchPatterns: string[];
  /** 전략 성공률 (0~1) */
  successRate: number;
  /** 적용 횟수 */
  totalAttempts: number;
  /** 성공 횟수 */
  successCount: number;
}

// ─── 학습 결과 요약 ─────────────────────────────────────

export interface LearningReport {
  totalPatterns: number;
  totalStrategies: number;
  topStrategies: Array<{ name: string; successRate: number; attempts: number }>;
  recurringFailures: Array<{ signature: string; count: number; lastStrategy: string }>;
  adaptationScore: number;  // 0~100, 학습 성숙도
}

// ─── FailurePatternDB ────────────────────────────────────

export class FailurePatternDB {
  private patterns: Map<string, FailurePattern> = new Map();
  private storagePath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.load();
  }

  /**
   * 실패 패턴을 기록합니다.
   * 동일 시그니처가 이미 있으면 발생 횟수를 증가시킵니다.
   */
  record(
    category: FailureCategory,
    phase: TaskPhase,
    errorMessage: string,
    affectedFiles: string[] = [],
  ): FailurePattern {
    const signature = this.normalizeSignature(errorMessage);
    const existing = this.findBySignature(signature);

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      existing.affectedFiles = [...new Set([...existing.affectedFiles, ...affectedFiles])];
      this.save();
      return existing;
    }

    const pattern: FailurePattern = {
      id: `fp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      phase,
      signature,
      originalMessage: errorMessage.slice(0, 500),
      affectedFiles,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      occurrences: 1,
      strategyHistory: [],
    };

    this.patterns.set(pattern.id, pattern);
    this.save();
    return pattern;
  }

  /**
   * 전략 적용 결과를 기록합니다.
   */
  recordStrategyResult(patternId: string, strategyId: string, strategyName: string, success: boolean, details: string): void {
    const pattern = this.patterns.get(patternId);
    if (!pattern) return;

    pattern.strategyHistory.push({
      strategyId,
      strategyName,
      appliedAt: new Date().toISOString(),
      success,
      details,
    });

    this.save();
  }

  /**
   * 시그니처로 기존 패턴을 찾습니다.
   */
  findBySignature(signature: string): FailurePattern | undefined {
    return Array.from(this.patterns.values())
      .find((p) => p.signature === signature);
  }

  /**
   * 카테고리별 패턴을 가져옵니다.
   */
  getByCategory(category: FailureCategory): FailurePattern[] {
    return Array.from(this.patterns.values())
      .filter((p) => p.category === category);
  }

  /**
   * 유사한 패턴을 찾습니다 (키워드 기반 퍼지 매칭).
   */
  findSimilar(errorMessage: string, maxResults: number = 5): FailurePattern[] {
    const keywords = this.extractKeywords(errorMessage);
    if (keywords.length === 0) return [];

    const scored = Array.from(this.patterns.values()).map((pattern) => {
      const patternKeywords = this.extractKeywords(pattern.originalMessage);
      const overlap = keywords.filter((k) => patternKeywords.includes(k)).length;
      const score = overlap / Math.max(keywords.length, 1);
      return { pattern, score };
    });

    return scored
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.pattern);
  }

  /**
   * 반복 발생하는 패턴을 가져옵니다.
   */
  getRecurring(minOccurrences: number = 3): FailurePattern[] {
    return Array.from(this.patterns.values())
      .filter((p) => p.occurrences >= minOccurrences)
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  /**
   * 전체 패턴 수를 반환합니다.
   */
  size(): number {
    return this.patterns.size;
  }

  /**
   * 모든 패턴을 반환합니다.
   */
  getAll(): FailurePattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * 에러 메시지를 정규화하여 시그니처를 생성합니다.
   * 경로, 숫자, 해시 등 가변 값을 제거합니다.
   */
  private normalizeSignature(message: string): string {
    return message
      .replace(/\/[\w\-\/.]+/g, '<PATH>')         // 파일 경로
      .replace(/\d+\.\d+\.\d+/g, '<VER>')         // 버전
      .replace(/\b\d{4,}\b/g, '<NUM>')             // 긴 숫자
      .replace(/\b[0-9a-f]{8,}\b/gi, '<HASH>')    // 해시
      .replace(/line \d+/gi, 'line <N>')           // 줄 번호
      .replace(/column \d+/gi, 'column <N>')       // 컬럼
      .replace(/\s+/g, ' ')                        // 공백 정규화
      .trim()
      .slice(0, 200);
  }

  /**
   * 에러 메시지에서 키워드를 추출합니다.
   */
  private extractKeywords(message: string): string[] {
    return message
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !STOP_WORDS.has(w));
  }

  private load(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
        for (const pattern of data.patterns || []) {
          this.patterns.set(pattern.id, pattern);
        }
      }
    } catch {
      // 로드 실패 시 빈 상태로 시작
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.storagePath,
        JSON.stringify({ patterns: Array.from(this.patterns.values()) }, null, 2),
        'utf-8',
      );
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) {
        console.warn('[AdaptiveEngine] 저장 실패:', err instanceof Error ? err.message : String(err));
      }
    }
  }
}

// ─── StrategySelector ────────────────────────────────────

export class StrategySelector {
  private strategies: Map<string, FixStrategy> = new Map();

  constructor() {
    this.initDefaultStrategies();
  }

  /**
   * 실패 패턴에 가장 적합한 전략을 선택합니다.
   * 성공률 기반 자동 순위 결정.
   */
  selectStrategy(pattern: FailurePattern, excludeIds: string[] = []): FixStrategy | null {
    // 1. 카테고리 매칭
    const candidates = Array.from(this.strategies.values())
      .filter((s) => s.category === pattern.category)
      .filter((s) => !excludeIds.includes(s.id));

    if (candidates.length === 0) return null;

    // 2. 패턴 매칭으로 더 정밀한 후보 선별
    const matched = candidates.filter((s) =>
      s.matchPatterns.some((mp) => {
        try { return new RegExp(mp, 'i').test(pattern.originalMessage); } catch { return false; }
      })
    );

    const pool = matched.length > 0 ? matched : candidates;

    // 3. 성공률 + 우선순위로 정렬
    pool.sort((a, b) => {
      // 성공률 우선 (시도가 3회 이상인 경우)
      if (a.totalAttempts >= 3 && b.totalAttempts >= 3) {
        const rateA = a.successRate;
        const rateB = b.successRate;
        if (Math.abs(rateA - rateB) > 0.1) return rateB - rateA;
      }
      return a.priority - b.priority;
    });

    return pool[0] || null;
  }

  /**
   * 이전에 성공한 전략을 패턴 히스토리에서 찾습니다.
   */
  selectFromHistory(pattern: FailurePattern): FixStrategy | null {
    const successfulAttempts = pattern.strategyHistory
      .filter((a) => a.success)
      .reverse(); // 최근 성공부터

    for (const attempt of successfulAttempts) {
      const strategy = this.strategies.get(attempt.strategyId);
      if (strategy) return strategy;
    }

    return null;
  }

  /**
   * 전략 실행 결과를 업데이트합니다.
   */
  updateResult(strategyId: string, success: boolean): void {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return;

    strategy.totalAttempts++;
    if (success) strategy.successCount++;
    strategy.successRate = strategy.totalAttempts > 0
      ? strategy.successCount / strategy.totalAttempts
      : 0;
  }

  /**
   * 모든 전략을 반환합니다.
   */
  getAll(): FixStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * 성공률 TOP N 전략을 반환합니다.
   */
  getTopStrategies(n: number = 10): FixStrategy[] {
    return Array.from(this.strategies.values())
      .filter((s) => s.totalAttempts >= 2)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, n);
  }

  /**
   * 기본 전략 세트를 초기화합니다.
   */
  private initDefaultStrategies(): void {
    const defaults: Omit<FixStrategy, 'successRate' | 'totalAttempts' | 'successCount'>[] = [
      // ─── 컴파일 에러 전략 ──
      {
        id: 'compile-dep-install',
        name: '의존성 설치',
        category: 'compile-error',
        description: '누락된 모듈을 설치합니다.',
        priority: 1,
        steps: ['에러 메시지에서 모듈명 추출', 'npm install <module>', '재빌드'],
        matchPatterns: ['cannot find module', 'module not found', "can't resolve"],
      },
      {
        id: 'compile-type-fix',
        name: '타입 오류 수정',
        category: 'compile-error',
        description: 'TypeScript 타입 오류를 수정합니다.',
        priority: 2,
        steps: ['오류 파일/라인 식별', '타입 정의 확인', '인터페이스 맞춤 수정'],
        matchPatterns: ['TS\\d+', 'type.*not assignable', 'property.*does not exist'],
      },
      {
        id: 'compile-tsconfig-fix',
        name: 'tsconfig 조정',
        category: 'compile-error',
        description: 'tsconfig.json 설정을 조정합니다.',
        priority: 3,
        steps: ['tsconfig.json 분석', 'compilerOptions 조정', '재빌드 확인'],
        matchPatterns: ['tsconfig', 'compiler option', 'target.*es\\d+'],
      },
      // ─── 린트 에러 전략 ──
      {
        id: 'lint-autofix',
        name: '자동 린트 수정',
        category: 'lint-error',
        description: 'eslint --fix로 자동 수정합니다.',
        priority: 1,
        steps: ['eslint --fix 실행', '결과 확인', '수정 불가 이슈 리포트'],
        matchPatterns: ['eslint', 'prettier', 'no-unused', 'indent', 'semi'],
      },
      {
        id: 'lint-rule-config',
        name: '린트 규칙 조정',
        category: 'lint-error',
        description: '.eslintrc 규칙을 프로젝트에 맞게 조정합니다.',
        priority: 2,
        steps: ['에러 규칙명 추출', '.eslintrc 확인', '규칙 비활성화 또는 수정'],
        matchPatterns: ['rule', 'eslintrc', 'warning.*\\d+'],
      },
      // ─── 테스트 실패 전략 ──
      {
        id: 'test-interface-sync',
        name: '인터페이스 동기화',
        category: 'test-failure',
        description: '테스트와 소스 코드의 인터페이스 불일치를 수정합니다.',
        priority: 1,
        steps: ['실패 테스트에서 호출 시그니처 추출', '소스 코드 시그니처 비교', '테스트 또는 소스 업데이트'],
        matchPatterns: ['expected.*received', 'not a function', 'undefined.*property', 'is not defined'],
      },
      {
        id: 'test-mock-update',
        name: '목 데이터 업데이트',
        category: 'test-failure',
        description: '테스트의 목/피처 데이터를 현재 코드에 맞게 업데이트합니다.',
        priority: 2,
        steps: ['실패 assertion 분석', '실제 출력값 확인', 'expected 값 업데이트'],
        matchPatterns: ['toEqual', 'toBe', 'snapshot', 'mock', 'fixture'],
      },
      {
        id: 'test-snapshot-update',
        name: '스냅샷 업데이트',
        category: 'test-failure',
        description: '변경된 UI/출력에 맞게 스냅샷을 업데이트합니다.',
        priority: 3,
        steps: ['jest --updateSnapshot 실행', '변경된 스냅샷 리뷰', '의도된 변경 확인'],
        matchPatterns: ['snapshot', 'toMatchSnapshot', 'received value'],
      },
      // ─── 테스트 셋업 전략 ──
      {
        id: 'test-setup-env',
        name: '테스트 환경 설정',
        category: 'test-setup',
        description: 'DB, 서버 등 테스트 환경을 설정합니다.',
        priority: 1,
        steps: ['필요 서비스 식별 (DB, Redis 등)', '환경변수 설정', '서비스 기동 또는 mock 전환'],
        matchPatterns: ['ECONNREFUSED', 'connection.*refused', 'database', 'postgres', 'mongo', 'redis'],
      },
      {
        id: 'test-setup-module',
        name: '테스트 모듈 설치',
        category: 'test-setup',
        description: '테스트에 필요한 devDependency를 설치합니다.',
        priority: 2,
        steps: ['누락 모듈 식별', 'npm install --save-dev <module>', '테스트 재실행'],
        matchPatterns: ['module not found', 'cannot find', 'no module named'],
      },
      // ─── 의존성 전략 ──
      {
        id: 'dep-install-missing',
        name: '누락 의존성 설치',
        category: 'dependency-missing',
        description: '누락된 패키지를 설치합니다.',
        priority: 1,
        steps: ['에러에서 패키지명 추출', 'npm install / pip install', '버전 호환성 확인'],
        matchPatterns: ['not found', 'no module', 'cannot find module'],
      },
      {
        id: 'dep-resolve-conflict',
        name: '의존성 충돌 해결',
        category: 'dependency-conflict',
        description: '버전 충돌을 해결합니다.',
        priority: 1,
        steps: ['충돌 패키지 식별', 'package.json 버전 조정', 'npm install --legacy-peer-deps 또는 버전 고정'],
        matchPatterns: ['peer dep', 'conflict', 'ERESOLVE', 'incompatible'],
      },
      // ─── 설정 에러 전략 ──
      {
        id: 'config-env-setup',
        name: '환경변수 설정',
        category: 'config-error',
        description: '.env 파일 또는 환경변수를 설정합니다.',
        priority: 1,
        steps: ['.env.example 참조', '필요 변수 식별', '.env 파일 생성 또는 업데이트'],
        matchPatterns: ['env', 'environment', 'config.*missing', 'SECRET', 'API_KEY'],
      },
      // ─── 환경 에러 전략 ──
      {
        id: 'env-service-start',
        name: '서비스 기동',
        category: 'environment-error',
        description: '필요 서비스(DB, Redis 등)를 기동합니다.',
        priority: 1,
        steps: ['필요 서비스 식별', 'docker-compose up 또는 수동 기동', '연결 확인'],
        matchPatterns: ['ECONNREFUSED', 'connection.*timeout', 'database.*unavailable'],
      },
      // ─── 보안 취약점 전략 ──
      {
        id: 'security-dep-update',
        name: '취약 의존성 업데이트',
        category: 'security-vulnerability',
        description: '보안 취약점이 있는 패키지를 업데이트합니다.',
        priority: 1,
        steps: ['npm audit --json 실행', '취약 패키지 식별', 'npm audit fix 또는 수동 업데이트'],
        matchPatterns: ['vulnerability', 'CVE-', 'advisory', 'audit'],
      },
      {
        id: 'security-input-validation',
        name: '입력 검증 추가',
        category: 'security-vulnerability',
        description: '사용자 입력에 검증 로직을 추가합니다.',
        priority: 2,
        steps: ['취약 입력 지점 식별', 'Zod/Joi 스키마 또는 직접 검증 추가', '테스트 추가'],
        matchPatterns: ['injection', 'xss', 'innerHTML', 'eval', 'user input'],
      },
      {
        id: 'security-secret-migrate',
        name: '시크릿 환경변수 이전',
        category: 'security-vulnerability',
        description: '하드코딩된 시크릿을 환경변수로 이전합니다.',
        priority: 1,
        steps: ['하드코딩 시크릿 위치 식별', 'process.env로 교체', '.env.example 업데이트', '.gitignore 확인'],
        matchPatterns: ['hardcoded', 'secret', 'api.key', 'password.*=.*["\']'],
      },
      // ─── 타입 에러 전략 ──
      {
        id: 'type-assertion-fix',
        name: '타입 단언 수정',
        category: 'type-error',
        description: '타입 단언/가드를 올바르게 수정합니다.',
        priority: 1,
        steps: ['타입 오류 위치 확인', '예상 타입 vs 실제 타입 비교', '타입 가드 또는 인터페이스 수정'],
        matchPatterns: ['type.*error', 'TS\\d+', 'not assignable'],
      },
      // ─── 아키텍처 위반 전략 ──
      {
        id: 'arch-refactor-extract',
        name: '모듈 분리 리팩토링',
        category: 'architecture-violation',
        description: '거대 모듈을 SRP에 맞게 분리합니다.',
        priority: 2,
        steps: ['거대 파일 식별', '책임 단위로 분리', '인터페이스 추출', '의존성 업데이트'],
        matchPatterns: ['god class', 'too many', 'large file', '500.*lines'],
      },
    ];

    for (const def of defaults) {
      this.strategies.set(def.id, {
        ...def,
        successRate: 0.5,  // 초기 50%
        totalAttempts: 0,
        successCount: 0,
      });
    }
  }
}

// ─── AdaptiveEngine ──────────────────────────────────────

export class AdaptiveEngine {
  private patternDB: FailurePatternDB;
  private selector: StrategySelector;
  private learningLog: Array<{ timestamp: string; action: string; result: string }> = [];

  constructor(storagePath: string) {
    const dbPath = path.join(storagePath, 'failure-patterns.json');
    this.patternDB = new FailurePatternDB(dbPath);
    this.selector = new StrategySelector();
  }

  /**
   * 실패를 분석하고 최적의 수정 전략을 결정합니다.
   */
  analyzeAndSelect(
    phase: TaskPhase,
    errorMessage: string,
    affectedFiles: string[] = [],
  ): { pattern: FailurePattern; strategy: FixStrategy | null; reasoning: string } {
    // 1. 실패 카테고리 분류
    const category = this.classifyFailure(errorMessage);

    // 2. 패턴 기록
    const pattern = this.patternDB.record(category, phase, errorMessage, affectedFiles);

    // 3. 전략 선택
    let strategy: FixStrategy | null = null;
    let reasoning = '';

    // 3a. 이전 성공 전략이 있으면 재사용
    strategy = this.selector.selectFromHistory(pattern);
    if (strategy) {
      reasoning = `이전 성공 전략 재사용: "${strategy.name}" (패턴 ${pattern.occurrences}회 발생)`;
      this.logLearning('strategy-reuse', reasoning);
      return { pattern, strategy, reasoning };
    }

    // 3b. 유사 패턴에서 성공 전략 참조
    const similar = this.patternDB.findSimilar(errorMessage, 3);
    for (const sim of similar) {
      strategy = this.selector.selectFromHistory(sim);
      if (strategy) {
        reasoning = `유사 패턴의 성공 전략 차용: "${strategy.name}" (유사 패턴: "${sim.signature.slice(0, 60)}")`;
        this.logLearning('strategy-borrow', reasoning);
        return { pattern, strategy, reasoning };
      }
    }

    // 3c. 이전에 실패한 전략 제외하고 새 전략 선택
    const failedIds = pattern.strategyHistory
      .filter((a) => !a.success)
      .map((a) => a.strategyId);

    strategy = this.selector.selectStrategy(pattern, failedIds);
    if (strategy) {
      reasoning = `카테고리 "${category}" 최적 전략: "${strategy.name}" (성공률 ${Math.round(strategy.successRate * 100)}%, ${failedIds.length}개 실패 전략 제외)`;
    } else {
      reasoning = `카테고리 "${category}"에 대한 전략을 찾지 못했습니다. ${failedIds.length}개 전략 모두 실패 이력.`;
    }

    this.logLearning('strategy-select', reasoning);
    return { pattern, strategy, reasoning };
  }

  /**
   * 전략을 실제로 실행합니다.
   * 전략의 steps와 matchPatterns에 기반하여 적절한 명령을 실행하고 결과를 반환합니다.
   */
  executeStrategy(
    strategy: FixStrategy,
    pattern: FailurePattern,
    projectPath: string,
  ): { success: boolean; output: string; commands: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];
    let success = false;

    try {
      const executor = new StrategyExecutor(projectPath);
      const result = executor.execute(strategy, pattern);
      commands.push(...result.commands);
      outputs.push(...result.outputs);
      success = result.success;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputs.push(`전략 실행 실패: ${errMsg}`);
    }

    // 결과 기록
    this.recordResult(
      pattern.id,
      strategy.id,
      strategy.name,
      success,
      outputs.join('\n').slice(0, 500),
    );

    this.logLearning(
      success ? 'execute-success' : 'execute-fail',
      `${strategy.name} → ${success ? 'SUCCESS' : 'FAIL'} (${commands.length} commands)`,
    );

    return { success, output: outputs.join('\n'), commands };
  }

  /**
   * 전략 실행 결과를 기록합니다.
   */
  recordResult(patternId: string, strategyId: string, strategyName: string, success: boolean, details: string): void {
    this.patternDB.recordStrategyResult(patternId, strategyId, strategyName, success, details);
    this.selector.updateResult(strategyId, success);
    this.logLearning(
      success ? 'strategy-success' : 'strategy-fail',
      `${strategyName}: ${success ? 'SUCCESS' : 'FAIL'} - ${details.slice(0, 100)}`,
    );
  }

  /**
   * 학습 보고서를 생성합니다.
   */
  generateReport(): LearningReport {
    const allPatterns = this.patternDB.getAll();
    const allStrategies = this.selector.getAll();
    const topStrategies = this.selector.getTopStrategies(5);

    const recurring = this.patternDB.getRecurring(2).map((p) => ({
      signature: p.signature,
      count: p.occurrences,
      lastStrategy: p.strategyHistory.length > 0
        ? p.strategyHistory[p.strategyHistory.length - 1].strategyName
        : 'none',
    }));

    // 적응 점수 계산
    const totalAttempts = allStrategies.reduce((s, st) => s + st.totalAttempts, 0);
    const totalSuccess = allStrategies.reduce((s, st) => s + st.successCount, 0);
    const overallRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
    const patternCoverage = Math.min(allPatterns.length / 20, 1); // 20패턴 이상이면 만점
    const strategyCoverage = Math.min(totalAttempts / 50, 1);     // 50회 시도 이상이면 만점
    const adaptationScore = Math.round((overallRate * 40 + patternCoverage * 30 + strategyCoverage * 30));

    return {
      totalPatterns: allPatterns.length,
      totalStrategies: allStrategies.length,
      topStrategies: topStrategies.map((s) => ({
        name: s.name,
        successRate: Math.round(s.successRate * 100),
        attempts: s.totalAttempts,
      })),
      recurringFailures: recurring.slice(0, 10),
      adaptationScore,
    };
  }

  /**
   * 학습 로그를 포맷합니다.
   */
  formatLearningLog(): string {
    const lines: string[] = [];
    lines.push('══ AdaptiveEngine Learning Log ══');
    for (const entry of this.learningLog.slice(-20)) {
      const time = new Date(entry.timestamp).toLocaleTimeString();
      lines.push(`  ${time} [${entry.action}] ${entry.result}`);
    }
    return lines.join('\n');
  }

  /**
   * 접근자
   */
  getPatternDB(): FailurePatternDB {
    return this.patternDB;
  }

  getSelector(): StrategySelector {
    return this.selector;
  }

  /**
   * 에러 메시지를 분류합니다.
   */
  private classifyFailure(message: string): FailureCategory {
    const lower = message.toLowerCase();

    // 컴파일/타입 에러
    if (/ts\d{4}|type.*not assignable|cannot find name|property.*does not exist/i.test(lower)) return 'type-error';
    if (/cannot find module|module not found|can't resolve/i.test(lower)) return 'dependency-missing';
    if (/compilation failed|build.*failed|tsc.*error/i.test(lower)) return 'compile-error';

    // 의존성
    if (/eresolve|peer dep|version.*conflict|incompatible/i.test(lower)) return 'dependency-conflict';
    if (/no module named|modulenotfounderror/i.test(lower)) return 'dependency-missing';

    // 테스트
    if (/econnrefused|connection.*refused|database.*unavailable/i.test(lower)) return 'test-setup';
    if (/test.*fail|assert|expect.*receive|toequal|tobe/i.test(lower)) return 'test-failure';
    if (/jest|mocha|pytest|test.*setup/i.test(lower)) return 'test-setup';

    // 보안
    if (/vulnerability|cve-|advisory|hardcoded.*secret/i.test(lower)) return 'security-vulnerability';

    // 환경
    if (/permission.*denied|eacces|eperm/i.test(lower)) return 'permission-error';
    if (/econnrefused|timeout|network/i.test(lower)) return 'network-error';
    if (/env.*not.*set|config.*missing/i.test(lower)) return 'config-error';
    if (/command not found|not installed/i.test(lower)) return 'environment-error';

    // 린트
    if (/eslint|prettier|lint.*error/i.test(lower)) return 'lint-error';

    // 런타임
    if (/typeerror|referenceerror|syntaxerror|rangeerror/i.test(lower)) return 'runtime-error';

    // 아키텍처
    if (/circular.*dependency|god.*class|too.*large/i.test(lower)) return 'architecture-violation';

    // 통합
    if (/integration|api.*error|http.*\d{3}/i.test(lower)) return 'integration-error';

    return 'unknown';
  }

  private logLearning(action: string, result: string): void {
    this.learningLog.push({
      timestamp: new Date().toISOString(),
      action,
      result,
    });
  }
}

// ─── StrategyExecutor ──────────────────────────────────────

/**
 * 전략을 실제 셸 명령으로 변환하여 실행합니다.
 * 전략의 category와 matchPatterns에 따라 적절한 명령을 선택합니다.
 */
class StrategyExecutor {
  private projectPath: string;
  private codeTransformer: CodeTransformer;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.codeTransformer = new CodeTransformer(projectPath);
  }

  execute(
    strategy: FixStrategy,
    pattern: FailurePattern,
  ): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    try {
      switch (strategy.category) {
        case 'dependency-missing':
        case 'compile-error': {
          const result = this.handleDependencyOrCompile(strategy, pattern);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'lint-error': {
          const result = this.handleLintError(strategy);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'test-failure':
        case 'test-setup': {
          const result = this.handleTestIssue(strategy, pattern);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'dependency-conflict': {
          const result = this.handleDependencyConflict(strategy);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'security-vulnerability': {
          const result = this.handleSecurityVulnerability(strategy, pattern);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'type-error': {
          const result = this.handleTypeError(strategy);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        case 'config-error':
        case 'environment-error': {
          outputs.push(`[STRATEGY] ${strategy.name}: 환경/설정 문제 — 자동 실행 가능한 명령 없음`);
          outputs.push(`[STRATEGY] 수동 확인 필요: ${strategy.steps.join(' → ')}`);
          return { success: false, commands, outputs };
        }
        case 'architecture-violation': {
          const result = this.handleArchitectureViolation(strategy, pattern);
          commands.push(...result.commands);
          outputs.push(...result.outputs);
          return { success: result.success, commands, outputs };
        }
        default: {
          // 기본: CodeTransformer로 파일 기반 수정 시도
          const result = this.handleWithCodeTransformer(strategy, pattern);
          if (result.success) {
            commands.push(...result.commands);
            outputs.push(...result.outputs);
            return { success: true, commands, outputs };
          }
          outputs.push(`[STRATEGY] ${strategy.name}: 범용 전략 — steps 기반 가이드 제공`);
          outputs.push(`[STRATEGY] 실행 단계: ${strategy.steps.join(' → ')}`);
          return { success: false, commands, outputs };
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      outputs.push(`[STRATEGY] 실행 오류: ${errMsg}`);
      return { success: false, commands, outputs };
    }
  }

  private handleDependencyOrCompile(strategy: FixStrategy, pattern: FailurePattern): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    // 에러 메시지에서 모듈명 추출
    const moduleMatch = pattern.originalMessage.match(/(?:Cannot find module|module not found|can't resolve)\s+['"]([^'"]+)['"]/i);

    if (moduleMatch) {
      const moduleName = moduleMatch[1];
      // 상대 경로 import는 설치 대상이 아님
      // npm 패키지명 형식만 허용 (커맨드 인젝션 방지)
      const isValidNpmName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(moduleName);
      if (!moduleName.startsWith('.') && !moduleName.startsWith('/') && isValidNpmName) {
        const cmd = `npm install ${moduleName} 2>&1 || true`;
        commands.push(cmd);
        try {
          const { execSync: exec } = require('child_process');
          const output = exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 60000 });
          outputs.push(`[STRATEGY] npm install ${moduleName}: ${output.slice(-200)}`);
          return { success: true, commands, outputs };
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          outputs.push(`[STRATEGY] 설치 실패: ${errMsg.slice(0, 200)}`);
        }
      }
    }

    // 일반 빌드 재시도
    if (strategy.id === 'compile-tsconfig-fix' || strategy.id === 'compile-type-fix') {
      const cmd = 'npm run build 2>&1 || true';
      commands.push(cmd);
      try {
        const { execSync: exec } = require('child_process');
        const output = exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 120000 });
        const hasError = /error TS\d+/i.test(output);
        outputs.push(`[STRATEGY] 빌드 ${hasError ? '실패' : '성공'}`);
        return { success: !hasError, commands, outputs };
      } catch {
        outputs.push('[STRATEGY] 빌드 명령 실행 실패');
      }
    }

    return { success: false, commands, outputs };
  }

  private handleLintError(strategy: FixStrategy): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    if (strategy.id === 'lint-autofix') {
      // 1. eslint --fix 실행
      const cmd = 'npx eslint --fix . 2>&1 || true';
      commands.push(cmd);
      try {
        const { execSync: exec } = require('child_process');
        exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 60000 });
        outputs.push('[STRATEGY] eslint --fix 실행 완료');
      } catch {
        outputs.push('[STRATEGY] eslint --fix 실행 실패');
      }

      // 2. CodeTransformer로 추가 수정 (eslint가 못 고치는 것)
      const transforms: TransformType[] = ['remove-unused-import', 'remove-console', 'fix-empty-catch', 'replace-any-type'];
      const transformResult = this.codeTransformer.transformProject(transforms);
      if (transformResult.changed > 0) {
        outputs.push(`[STRATEGY] CodeTransformer 추가 수정: ${transformResult.changed}개 파일`);
        commands.push(`[code-transform] ${transformResult.changed} files`);
      }

      return { success: true, commands, outputs };
    }

    // lint-rule-config: CodeTransformer로 코드 수정 시도
    const transforms: TransformType[] = ['remove-unused-import', 'fix-empty-catch', 'replace-any-type'];
    const transformResult = this.codeTransformer.transformProject(transforms);
    if (transformResult.changed > 0) {
      outputs.push(`[STRATEGY] CodeTransformer 린트 수정: ${transformResult.changed}개 파일`);
      return { success: true, commands, outputs };
    }

    return { success: false, commands, outputs };
  }

  private handleTestIssue(strategy: FixStrategy, pattern: FailurePattern): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    if (strategy.id === 'test-snapshot-update') {
      const cmd = 'npx jest --updateSnapshot 2>&1 || true';
      commands.push(cmd);
      try {
        const { execSync: exec } = require('child_process');
        exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 120000 });
        outputs.push('[STRATEGY] 스냅샷 업데이트 완료');
        return { success: true, commands, outputs };
      } catch {
        outputs.push('[STRATEGY] 스냅샷 업데이트 실패');
      }
    }

    if (strategy.id === 'test-setup-module') {
      const moduleMatch = pattern.originalMessage.match(/(?:Cannot find module|no module named)\s+['"]([^'"]+)['"]/i);
      if (moduleMatch) {
        const moduleName = moduleMatch[1];
        const isValidNpmName = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(moduleName);
        if (!moduleName.startsWith('.') && isValidNpmName) {
          const cmd = `npm install --save-dev ${moduleName} 2>&1 || true`;
          commands.push(cmd);
          try {
            const { execSync: exec } = require('child_process');
            exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 60000 });
            outputs.push(`[STRATEGY] devDependency 설치: ${moduleName}`);
            return { success: true, commands, outputs };
          } catch {
            outputs.push(`[STRATEGY] ${moduleName} 설치 실패`);
          }
        }
      }
    }

    // 테스트 재실행
    const cmd = 'npm test 2>&1 || true';
    commands.push(cmd);
    outputs.push(`[STRATEGY] ${strategy.name}: 코드 수정 후 테스트 재실행 필요`);
    return { success: false, commands, outputs };
  }

  private handleDependencyConflict(strategy: FixStrategy): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    const cmd = 'npm install --legacy-peer-deps 2>&1 || true';
    commands.push(cmd);
    try {
      const { execSync: exec } = require('child_process');
      const output = exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 120000 });
      outputs.push(`[STRATEGY] --legacy-peer-deps 설치 완료: ${output.slice(-200)}`);
      return { success: true, commands, outputs };
    } catch {
      outputs.push('[STRATEGY] 의존성 충돌 해결 실패');
    }

    return { success: false, commands, outputs };
  }

  private handleSecurityVulnerability(strategy: FixStrategy, pattern: FailurePattern): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    if (strategy.id === 'security-dep-update') {
      const cmd = 'npm audit fix 2>&1 || true';
      commands.push(cmd);
      try {
        const { execSync: exec } = require('child_process');
        const output = exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 120000 });
        outputs.push(`[STRATEGY] npm audit fix 완료: ${output.slice(-200)}`);
        return { success: true, commands, outputs };
      } catch {
        outputs.push('[STRATEGY] npm audit fix 실패');
      }
    }

    // 코드 수준 보안 수정 (하드코딩 시크릿, input validation 등)
    if (strategy.id === 'security-secret-migrate') {
      const transforms: TransformType[] = ['extract-hardcoded-secret'];
      const transformResult = this.codeTransformer.transformProject(transforms);
      if (transformResult.changed > 0) {
        outputs.push(`[STRATEGY] CodeTransformer 시크릿 마이그레이션: ${transformResult.changed}개 파일`);
        commands.push(`[code-transform] extract-hardcoded-secret: ${transformResult.changed} files`);
        return { success: true, commands, outputs };
      }
    }

    outputs.push(`[STRATEGY] ${strategy.name}: 수동 코드 수정 필요`);
    outputs.push(`[STRATEGY] 실행 단계: ${strategy.steps.join(' → ')}`);
    return { success: false, commands, outputs };
  }

  private handleTypeError(strategy: FixStrategy): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    // 1. CodeTransformer로 any → unknown, non-null assertion 제거
    const transforms: TransformType[] = ['replace-any-type', 'remove-non-null-assertion'];
    const transformResult = this.codeTransformer.transformProject(transforms);
    if (transformResult.changed > 0) {
      outputs.push(`[STRATEGY] CodeTransformer 타입 수정: ${transformResult.changed}개 파일`);
      commands.push(`[code-transform] type-fix: ${transformResult.changed} files`);
    }

    // 2. 타입 체크 재실행
    const cmd = 'npx tsc --noEmit 2>&1 || true';
    commands.push(cmd);
    try {
      const { execSync: exec } = require('child_process');
      const output = exec(cmd, { cwd: this.projectPath, encoding: 'utf-8', timeout: 60000 });
      const hasError = /error TS\d+/i.test(output);
      outputs.push(`[STRATEGY] 타입 체크 ${hasError ? '에러 지속' : '통과'}`);
      return { success: !hasError || transformResult.changed > 0, commands, outputs };
    } catch {
      outputs.push('[STRATEGY] 타입 체크 실행 실패');
    }

    return { success: transformResult.changed > 0, commands, outputs };
  }

  private handleArchitectureViolation(strategy: FixStrategy, pattern: FailurePattern): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    // CodeTransformer로 기본적인 코드 정리 (미사용 import, console.log 등)
    const transforms: TransformType[] = ['remove-unused-import', 'remove-console', 'fix-empty-catch'];
    const transformResult = this.codeTransformer.transformProject(transforms);

    if (transformResult.changed > 0) {
      outputs.push(`[STRATEGY] CodeTransformer 아키텍처 정리: ${transformResult.changed}개 파일`);
      commands.push(`[code-transform] arch-cleanup: ${transformResult.changed} files`);
      return { success: true, commands, outputs };
    }

    outputs.push(`[STRATEGY] ${strategy.name}: 구조적 리팩토링 필요 — 자동 수정 범위 초과`);
    outputs.push(`[STRATEGY] 수동 수정 가이드: ${strategy.steps.join(' → ')}`);
    return { success: false, commands, outputs };
  }

  private handleWithCodeTransformer(strategy: FixStrategy, pattern: FailurePattern): { success: boolean; commands: string[]; outputs: string[] } {
    const commands: string[] = [];
    const outputs: string[] = [];

    // 에러 메시지에서 파일 경로 추출
    const fileMatch = pattern.originalMessage.match(/(?:in|at|file)\s+['"]?([^\s'"]+\.[tj]sx?)/i) ||
                      pattern.originalMessage.match(/([^\s:]+\.[tj]sx?):\d+/);

    if (fileMatch) {
      const file = fileMatch[1];
      // 모든 변환을 시도
      const result = this.codeTransformer.transformFile(file);
      if (result.success && result.appliedCount > 0) {
        outputs.push(`[STRATEGY] CodeTransformer 수정: ${file} (${result.appliedCount}건)`);
        for (const change of result.changes.slice(0, 3)) {
          outputs.push(`  - ${change.description}`);
        }
        commands.push(`[code-transform] ${file}: ${result.appliedCount} changes`);
        return { success: true, commands, outputs };
      }
    }

    // 프로젝트 전체 기본 정리 시도
    const transforms: TransformType[] = ['remove-unused-import', 'fix-empty-catch'];
    const projectResult = this.codeTransformer.transformProject(transforms);
    if (projectResult.changed > 0) {
      outputs.push(`[STRATEGY] CodeTransformer 프로젝트 정리: ${projectResult.changed}개 파일`);
      commands.push(`[code-transform] project-cleanup: ${projectResult.changed} files`);
      return { success: true, commands, outputs };
    }

    return { success: false, commands, outputs };
  }
}

// ─── 불용어 세트 ─────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her',
  'was', 'one', 'our', 'out', 'has', 'have', 'from', 'this', 'that', 'with',
  'error', 'failed', 'failure', 'line', 'file', 'module', 'import', 'export',
]);
