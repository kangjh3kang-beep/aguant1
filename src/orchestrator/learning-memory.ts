/**
 * LearningMemory — 영속적 팀 학습 메모리 시스템
 *
 * Phase 10-D: 코드 리뷰에서 발견한 팀 패턴·컨벤션·실수를 세션 간 누적 학습
 *
 * ━━━ 핵심 기능 ━━━
 *   1. 이슈 패턴 축적: 반복되는 이슈 유형을 자동 그룹화
 *   2. 수정 전략 기록: 어떤 이슈에 어떤 수정이 효과적이었는지 추적
 *   3. 팀 컨벤션 학습: 코딩 스타일·네이밍·아키텍처 패턴 추출
 *   4. 프로젝트 프로필: 프로젝트별 고유 특성 저장
 *
 * 저장: `.ag-review/learning-memory.json`
 */

import fs from 'fs';
import path from 'path';

// ─── 학습 데이터 구조 ───

export interface IssuePattern {
  /** 정규화된 이슈 시그니처 */
  signature: string;
  /** 이슈 카테고리 */
  category: string;
  /** 발생 횟수 */
  occurrences: number;
  /** 관련 파일 패턴 (예: "src/services/*.ts") */
  filePatterns: string[];
  /** 성공한 수정 전략 */
  successfulFixes: string[];
  /** 실패한 수정 전략 */
  failedFixes: string[];
  /** 최초 발견 */
  firstSeen: string;
  /** 최근 발견 */
  lastSeen: string;
}

export interface TeamConvention {
  /** 컨벤션 규칙 이름 */
  rule: string;
  /** 설명 */
  description: string;
  /** 출처 (어떤 리뷰에서 발견) */
  source: string;
  /** 적용 파일 패턴 */
  fileGlob: string;
  /** 신뢰도 (발견 빈도 기반) */
  confidence: number;
  /** 발견 횟수 */
  occurrences: number;
}

export interface FixRecord {
  /** 이슈 시그니처 */
  issueSignature: string;
  /** 적용한 수정 전략 */
  strategy: string;
  /** 성공 여부 */
  success: boolean;
  /** 수정 소요 사이클 */
  cyclesTaken: number;
  /** 타임스탬프 */
  timestamp: string;
}

export interface ProjectProfile {
  /** 프로젝트 이름 */
  name: string;
  /** 기술 스택 */
  techStack: string[];
  /** 주요 이슈 카테고리 Top 5 */
  topIssueCategories: string[];
  /** 평균 품질 점수 */
  avgQualityScore: number;
  /** 총 리뷰 세션 수 */
  totalSessions: number;
  /** 마지막 업데이트 */
  lastUpdated: string;
}

export interface LearningData {
  version: string;
  issuePatterns: IssuePattern[];
  conventions: TeamConvention[];
  fixRecords: FixRecord[];
  projectProfile: ProjectProfile | null;
}

const EMPTY_LEARNING_DATA: LearningData = {
  version: '1.0.0',
  issuePatterns: [],
  conventions: [],
  fixRecords: [],
  projectProfile: null,
};

// ─── LearningMemory 클래스 ───

export class LearningMemory {
  private storagePath: string;
  private data: LearningData;

  constructor(projectRootPath: string) {
    const dir = path.join(projectRootPath, '.ag-review');
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) {
          console.warn('[LearningMemory] 디렉토리 생성 실패:', err instanceof Error ? err.message : String(err));
        }
      }
    }
    this.storagePath = path.join(dir, 'learning-memory.json');
    this.data = this.load();
  }

  // ─── 데이터 영속화 ───

  private load(): LearningData {
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          version: parsed.version || EMPTY_LEARNING_DATA.version,
          issuePatterns: Array.isArray(parsed.issuePatterns) ? [...parsed.issuePatterns] : [],
          conventions: Array.isArray(parsed.conventions) ? [...parsed.conventions] : [],
          fixRecords: Array.isArray(parsed.fixRecords) ? [...parsed.fixRecords] : [],
          projectProfile: parsed.projectProfile || null,
        };
      }
    } catch { /* corrupt file → reset */ }
    return this.createEmptyData();
  }

  private createEmptyData(): LearningData {
    return {
      version: '1.0.0',
      issuePatterns: [],
      conventions: [],
      fixRecords: [],
      projectProfile: null,
    };
  }

  save(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err: unknown) {
      console.warn('[LearningMemory] 저장 실패:', err instanceof Error ? err.message : String(err));
    }
  }

  // ─── 이슈 패턴 학습 ───

  /**
   * 이슈를 학습합니다. 동일 시그니처가 있으면 카운트 증가, 없으면 새로 등록
   */
  recordIssue(
    message: string,
    category: string,
    file?: string,
  ): void {
    const sig = this.normalizeSignature(message);
    const existing = this.data.issuePatterns.find((p) => p.signature === sig);

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date().toISOString();
      if (file) {
        const pattern = this.extractFilePattern(file);
        if (!existing.filePatterns.includes(pattern)) {
          existing.filePatterns.push(pattern);
        }
      }
    } else {
      this.data.issuePatterns.push({
        signature: sig,
        category,
        occurrences: 1,
        filePatterns: file ? [this.extractFilePattern(file)] : [],
        successfulFixes: [],
        failedFixes: [],
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      });
    }
  }

  /**
   * 수정 결과를 기록합니다
   */
  recordFix(
    issueMessage: string,
    strategy: string,
    success: boolean,
    cyclesTaken: number = 1,
  ): void {
    const sig = this.normalizeSignature(issueMessage);

    // FixRecord에 추가
    this.data.fixRecords.push({
      issueSignature: sig,
      strategy,
      success,
      cyclesTaken,
      timestamp: new Date().toISOString(),
    });

    // 최대 500건 유지 (오래된 것 제거)
    if (this.data.fixRecords.length > 500) {
      this.data.fixRecords = this.data.fixRecords.slice(-500);
    }

    // IssuePattern에도 반영
    const pattern = this.data.issuePatterns.find((p) => p.signature === sig);
    if (pattern) {
      if (success && !pattern.successfulFixes.includes(strategy)) {
        pattern.successfulFixes.push(strategy);
      }
      if (!success && !pattern.failedFixes.includes(strategy)) {
        pattern.failedFixes.push(strategy);
      }
    }
  }

  // ─── 팀 컨벤션 학습 ───

  /**
   * 팀 컨벤션을 등록/갱신합니다
   */
  recordConvention(
    rule: string,
    description: string,
    source: string,
    fileGlob: string = '**/*',
  ): void {
    const existing = this.data.conventions.find((c) => c.rule === rule);
    if (existing) {
      existing.occurrences++;
      existing.confidence = Math.min(1.0, existing.confidence + 0.1);
    } else {
      this.data.conventions.push({
        rule,
        description,
        source,
        fileGlob,
        confidence: 0.5,
        occurrences: 1,
      });
    }
  }

  // ─── 프로젝트 프로필 갱신 ───

  updateProjectProfile(
    name: string,
    techStack: string[],
    qualityScore: number,
  ): void {
    const profile = this.data.projectProfile;
    if (profile && profile.name === name) {
      profile.totalSessions++;
      profile.avgQualityScore = Math.round(
        (profile.avgQualityScore * (profile.totalSessions - 1) + qualityScore) / profile.totalSessions,
      );
      profile.techStack = techStack;
      profile.topIssueCategories = this.getTopIssueCategories(5);
      profile.lastUpdated = new Date().toISOString();
    } else {
      this.data.projectProfile = {
        name,
        techStack,
        topIssueCategories: this.getTopIssueCategories(5),
        avgQualityScore: qualityScore,
        totalSessions: 1,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  // ─── 조회 API ───

  /**
   * 특정 이슈에 대해 과거 성공한 수정 전략을 반환
   */
  getBestFixStrategy(issueMessage: string): string | null {
    const sig = this.normalizeSignature(issueMessage);
    const pattern = this.data.issuePatterns.find((p) => p.signature === sig);
    if (!pattern || pattern.successfulFixes.length === 0) return null;

    // 가장 최근에 성공한 전략 우선
    const fixRecords = this.data.fixRecords
      .filter((r) => r.issueSignature === sig && r.success)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return fixRecords.length > 0 ? fixRecords[0].strategy : pattern.successfulFixes[0];
  }

  /**
   * 반복되는 이슈 패턴 상위 N개 반환
   */
  getRecurringPatterns(topN: number = 10): IssuePattern[] {
    return [...this.data.issuePatterns]
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, topN);
  }

  /**
   * 높은 신뢰도의 팀 컨벤션 반환
   */
  getConventions(minConfidence: number = 0.5): TeamConvention[] {
    return this.data.conventions
      .filter((c) => c.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 학습 요약 보고서 생성
   */
  generateReport(): {
    totalPatterns: number;
    totalFixes: number;
    totalConventions: number;
    topIssues: Array<{ signature: string; count: number }>;
    bestStrategies: Array<{ strategy: string; successCount: number }>;
    avgQuality: number;
    sessions: number;
  } {
    const successFixes = this.data.fixRecords.filter((r) => r.success);
    const strategyMap = new Map<string, number>();
    for (const fix of successFixes) {
      strategyMap.set(fix.strategy, (strategyMap.get(fix.strategy) || 0) + 1);
    }
    const bestStrategies = [...strategyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([strategy, successCount]) => ({ strategy, successCount }));

    return {
      totalPatterns: this.data.issuePatterns.length,
      totalFixes: this.data.fixRecords.length,
      totalConventions: this.data.conventions.length,
      topIssues: this.data.issuePatterns
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5)
        .map((p) => ({ signature: p.signature, count: p.occurrences })),
      bestStrategies,
      avgQuality: this.data.projectProfile?.avgQualityScore || 0,
      sessions: this.data.projectProfile?.totalSessions || 0,
    };
  }

  getData(): LearningData {
    return { ...this.data };
  }

  // ─── 내부 유틸리티 ───

  private normalizeSignature(message: string): string {
    return message
      .toLowerCase()
      .replace(/['"`]/g, '')
      .replace(/\b(line|col|row)\s*\d+/g, '')
      .replace(/\b[a-zA-Z_]\w*\.(ts|js|tsx|jsx|py|go|rs)\b/g, '<FILE>')
      .replace(/\d+/g, '<N>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private extractFilePattern(filePath: string): string {
    const parts = filePath.split('/');
    if (parts.length <= 1) return filePath;
    const dir = parts.slice(0, -1).join('/');
    const ext = path.extname(filePath);
    return `${dir}/*${ext}`;
  }

  private getTopIssueCategories(topN: number): string[] {
    const catMap = new Map<string, number>();
    for (const pattern of this.data.issuePatterns) {
      catMap.set(pattern.category, (catMap.get(pattern.category) || 0) + pattern.occurrences);
    }
    return [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([cat]) => cat);
  }
}
