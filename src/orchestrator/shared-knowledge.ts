/**
 * SharedKnowledgeBase + EventBus + ContextChain
 *
 * Phase 1: 에이전트 간 지능 공유 시스템
 *
 * ━━━ 핵심 구조 ━━━
 *  SharedKnowledgeBase: 에이전트가 발견한 인사이트를 중앙 저장소에 축적
 *  EventBus: 에이전트 간 실시간 이벤트 전달 (publish/subscribe)
 *  ContextChain: 이전 Phase 결과가 다음 Phase 프롬프트에 주입
 *
 * ━━━ 데이터 흐름 ━━━
 *  Planner → 아키텍처 분석 결과 → KB에 저장
 *  Coder   → KB에서 아키텍처 참조 → 코드 생성 → 생성된 파일 목록 저장
 *  Reviewer → KB에서 코드/아키텍처 참조 → 코드 스멜 저장
 *  Tester  → KB에서 코드 스멜 참조 → 해당 영역 집중 테스트 → 커버리지 저장
 *  Security → KB에서 전체 참조 → 취약점 저장
 *  Browser → KB에서 전체 참조 → 접근성 이슈 저장
 *  Deployer → KB에서 전체 참조 → 배포 체크리스트 강화
 */

import { TaskPhase, AgentRole, TaskIssue } from './types';

// ─── 지식 항목 타입 ─────────────────────────────────────

export type InsightCategory =
  | 'architecture'      // 아키텍처 분석 결과
  | 'tech-stack'        // 기술 스택 정보
  | 'code-pattern'      // 코드 패턴/스멜
  | 'test-coverage'     // 테스트 커버리지 갭
  | 'vulnerability'     // 보안 취약점
  | 'accessibility'     // 접근성 이슈
  | 'performance'       // 성능 문제
  | 'dependency'        // 의존성 이슈
  | 'file-change'       // 파일 변경 사항
  | 'deploy-readiness'  // 배포 준비 상태
  | 'risk'              // 리스크 항목
  | 'recommendation';   // 개선 권고

export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface Insight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  source: AgentRole;
  phase: TaskPhase;
  title: string;
  description: string;
  affectedFiles: string[];
  metadata: Record<string, unknown>;
  timestamp: string;
}

// ─── 이벤트 타입 ────────────────────────────────────────

export type EventType =
  | 'insight:added'
  | 'phase:started'
  | 'phase:completed'
  | 'phase:failed'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'issue:detected'
  | 'fix:applied'
  | 'knowledge:query';

export interface AgentEvent {
  type: EventType;
  source: AgentRole;
  phase: TaskPhase;
  data: Record<string, unknown>;
  timestamp: string;
}

export type EventHandler = (event: AgentEvent) => void;

// ─── 컨텍스트 체인 항목 ──────────────────────────────────

export interface PhaseContext {
  phase: TaskPhase;
  agent: AgentRole;
  summary: string;
  keyFindings: string[];
  issues: TaskIssue[];
  artifacts: string[];
  metrics: Record<string, number>;
  completedAt: string;
}

// ─── SharedKnowledgeBase ─────────────────────────────────

export class SharedKnowledgeBase {
  private insights: Map<string, Insight> = new Map();
  private insightsByCategory: Map<InsightCategory, Insight[]> = new Map();
  private insightsByAgent: Map<AgentRole, Insight[]> = new Map();
  private insightsByPhase: Map<TaskPhase, Insight[]> = new Map();

  /**
   * 인사이트를 저장합니다.
   */
  addInsight(insight: Omit<Insight, 'id' | 'timestamp'>): Insight {
    const full: Insight = {
      ...insight,
      id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
    };

    this.insights.set(full.id, full);

    // 카테고리별 인덱스
    if (!this.insightsByCategory.has(full.category)) {
      this.insightsByCategory.set(full.category, []);
    }
    this.insightsByCategory.get(full.category)!.push(full);

    // 에이전트별 인덱스
    if (!this.insightsByAgent.has(full.source)) {
      this.insightsByAgent.set(full.source, []);
    }
    this.insightsByAgent.get(full.source)!.push(full);

    // 페이즈별 인덱스
    if (!this.insightsByPhase.has(full.phase)) {
      this.insightsByPhase.set(full.phase, []);
    }
    this.insightsByPhase.get(full.phase)!.push(full);

    return full;
  }

  /**
   * 카테고리별 인사이트를 가져옵니다.
   */
  getByCategory(category: InsightCategory): Insight[] {
    return this.insightsByCategory.get(category) || [];
  }

  /**
   * 에이전트가 생성한 인사이트를 가져옵니다.
   */
  getByAgent(agent: AgentRole): Insight[] {
    return this.insightsByAgent.get(agent) || [];
  }

  /**
   * 특정 Phase의 인사이트를 가져옵니다.
   */
  getByPhase(phase: TaskPhase): Insight[] {
    return this.insightsByPhase.get(phase) || [];
  }

  /**
   * 심각도가 높은 인사이트를 가져옵니다.
   */
  getCritical(): Insight[] {
    return Array.from(this.insights.values())
      .filter((i) => i.severity === 'critical' || i.severity === 'high');
  }

  /**
   * 특정 파일에 관련된 모든 인사이트를 가져옵니다.
   */
  getByFile(filePath: string): Insight[] {
    return Array.from(this.insights.values())
      .filter((i) => i.affectedFiles.some((f) => f.includes(filePath) || filePath.includes(f)));
  }

  /**
   * 전체 인사이트 목록을 반환합니다.
   */
  getAll(): Insight[] {
    return Array.from(this.insights.values());
  }

  /**
   * 인사이트 수를 반환합니다.
   */
  size(): number {
    return this.insights.size;
  }

  /**
   * 특정 에이전트를 위한 컨텍스트 요약을 생성합니다.
   * 해당 에이전트에게 가장 관련 있는 인사이트를 선별하여 반환합니다.
   */
  buildContextForAgent(targetAgent: AgentRole): string {
    const relevance = AGENT_RELEVANCE_MAP[targetAgent] || [];
    const sections: string[] = [];

    sections.push(`\n══ SharedKnowledgeBase: ${targetAgent} Context ══`);
    sections.push(`총 ${this.insights.size}개 인사이트 축적\n`);

    for (const category of relevance) {
      const items = this.getByCategory(category);
      if (items.length === 0) continue;

      sections.push(`── ${CATEGORY_LABELS[category]} (${items.length}건) ──`);
      for (const item of items.slice(0, 10)) {
        const sev = item.severity.toUpperCase();
        sections.push(`  [${sev}] ${item.title}`);
        if (item.description.length <= 200) {
          sections.push(`    ${item.description}`);
        } else {
          sections.push(`    ${item.description.slice(0, 200)}...`);
        }
        if (item.affectedFiles.length > 0) {
          sections.push(`    Files: ${item.affectedFiles.slice(0, 5).join(', ')}`);
        }
      }
      sections.push('');
    }

    // 크리티컬 이슈는 항상 포함
    const critical = this.getCritical();
    if (critical.length > 0) {
      sections.push(`── CRITICAL ISSUES (${critical.length}건) ──`);
      for (const item of critical.slice(0, 5)) {
        sections.push(`  [${item.source}] ${item.title}: ${item.description.slice(0, 150)}`);
      }
    }

    return sections.join('\n');
  }

  /**
   * 전체 요약 보고서를 생성합니다.
   */
  buildSummary(): string {
    const sections: string[] = [];
    sections.push('╔══════════════════════════════════════════════╗');
    sections.push('║   SharedKnowledgeBase Summary                ║');
    sections.push('╚══════════════════════════════════════════════╝');
    sections.push(`총 인사이트: ${this.insights.size}개\n`);

    // 카테고리별 통계
    sections.push('카테고리별:');
    for (const [cat, items] of this.insightsByCategory) {
      const critCount = items.filter((i) => i.severity === 'critical').length;
      const highCount = items.filter((i) => i.severity === 'high').length;
      sections.push(`  ${CATEGORY_LABELS[cat]}: ${items.length}건 (critical:${critCount}, high:${highCount})`);
    }
    sections.push('');

    // 에이전트별 통계
    sections.push('에이전트별:');
    for (const [agent, items] of this.insightsByAgent) {
      sections.push(`  ${agent}: ${items.length}건`);
    }

    return sections.join('\n');
  }

  /**
   * 초기화합니다.
   */
  clear(): void {
    this.insights.clear();
    this.insightsByCategory.clear();
    this.insightsByAgent.clear();
    this.insightsByPhase.clear();
  }
}

// ─── EventBus ────────────────────────────────────────────

export class EventBus {
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private eventLog: AgentEvent[] = [];
  private maxLogSize: number = 1000;

  /**
   * 이벤트 핸들러를 등록합니다.
   */
  on(type: EventType, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  /**
   * 이벤트를 발행합니다.
   */
  emit(event: Omit<AgentEvent, 'timestamp'>): void {
    const full: AgentEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // 로그 저장
    this.eventLog.push(full);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // 핸들러 호출
    const handlers = this.handlers.get(full.type) || [];
    for (const handler of handlers) {
      try {
        handler(full);
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) {
          console.debug('[EventBus] event handler error:', err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  /**
   * 이벤트 로그를 반환합니다.
   */
  getLog(filter?: { type?: EventType; source?: AgentRole; limit?: number }): AgentEvent[] {
    let events = [...this.eventLog];
    if (filter?.type) events = events.filter((e) => e.type === filter.type);
    if (filter?.source) events = events.filter((e) => e.source === filter.source);
    if (filter?.limit) events = events.slice(-filter.limit);
    return events;
  }

  /**
   * 모든 핸들러를 제거합니다.
   */
  clear(): void {
    this.handlers.clear();
    this.eventLog = [];
  }
}

// ─── ContextChain ────────────────────────────────────────

export class ContextChain {
  private chain: PhaseContext[] = [];

  /**
   * Phase 완료 시 결과를 체인에 추가합니다.
   */
  addPhaseResult(context: Omit<PhaseContext, 'completedAt'>): void {
    this.chain.push({
      ...context,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * 다음 Phase를 위한 누적 컨텍스트를 생성합니다.
   * 이전 모든 Phase의 핵심 발견사항이 포함됩니다.
   */
  buildContextForNextPhase(nextPhase: TaskPhase): string {
    if (this.chain.length === 0) return '';

    const sections: string[] = [];
    sections.push('\n══ ContextChain: 이전 Phase 분석 결과 ══\n');

    for (const ctx of this.chain) {
      sections.push(`── ${ctx.phase.toUpperCase()} (${ctx.agent}) ──`);
      sections.push(`요약: ${ctx.summary}`);

      if (ctx.keyFindings.length > 0) {
        sections.push('핵심 발견:');
        for (const finding of ctx.keyFindings.slice(0, 8)) {
          sections.push(`  - ${finding}`);
        }
      }

      const critIssues = ctx.issues.filter((i) => i.severity === 'critical' || i.severity === 'error');
      if (critIssues.length > 0) {
        sections.push(`주요 이슈 (${critIssues.length}건):`);
        for (const issue of critIssues.slice(0, 5)) {
          sections.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
        }
      }

      if (ctx.artifacts.length > 0) {
        sections.push(`산출물: ${ctx.artifacts.slice(0, 5).join(', ')}`);
      }

      const metricKeys = Object.keys(ctx.metrics);
      if (metricKeys.length > 0) {
        const metricStr = metricKeys.map((k) => `${k}=${ctx.metrics[k]}`).join(', ');
        sections.push(`지표: ${metricStr}`);
      }

      sections.push('');
    }

    // 다음 Phase별 특화 지시
    const directive = PHASE_DIRECTIVES[nextPhase];
    if (directive) {
      sections.push(`── ${nextPhase.toUpperCase()} Phase 지시사항 ──`);
      sections.push(directive);
    }

    return sections.join('\n');
  }

  /**
   * 특정 Phase의 결과를 가져옵니다.
   */
  getPhaseResult(phase: TaskPhase): PhaseContext | undefined {
    return this.chain.find((c) => c.phase === phase);
  }

  /**
   * 체인 전체를 반환합니다.
   */
  getAll(): PhaseContext[] {
    return [...this.chain];
  }

  /**
   * 초기화합니다.
   */
  clear(): void {
    this.chain = [];
  }
}

// ─── 에이전트별 관련 카테고리 매핑 ───────────────────────

const AGENT_RELEVANCE_MAP: Record<AgentRole, InsightCategory[]> = {
  planner: ['architecture', 'tech-stack', 'risk', 'recommendation'],
  coder: ['architecture', 'tech-stack', 'code-pattern', 'recommendation', 'vulnerability'],
  reviewer: ['code-pattern', 'architecture', 'performance', 'file-change'],
  tester: ['code-pattern', 'test-coverage', 'file-change', 'vulnerability'],
  security: ['vulnerability', 'dependency', 'code-pattern', 'architecture'],
  browser: ['accessibility', 'performance', 'code-pattern', 'file-change'],
  deployer: ['deploy-readiness', 'dependency', 'vulnerability', 'risk', 'test-coverage'],
};

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  architecture: '아키텍처 분석',
  'tech-stack': '기술 스택',
  'code-pattern': '코드 패턴/스멜',
  'test-coverage': '테스트 커버리지',
  vulnerability: '보안 취약점',
  accessibility: '접근성',
  performance: '성능',
  dependency: '의존성',
  'file-change': '파일 변경',
  'deploy-readiness': '배포 준비',
  risk: '리스크',
  recommendation: '개선 권고',
};

// ─── Phase별 다음 에이전트 지시사항 ──────────────────────

const PHASE_DIRECTIVES: Record<TaskPhase, string> = {
  plan: '프로젝트의 전체 아키텍처와 기술 스택을 분석하세요. 리스크와 기술 부채를 식별하세요.',
  code: `이전 Plan Phase의 아키텍처 결정사항을 반드시 반영하세요.
발견된 리스크를 코드 레벨에서 해결하세요.
기존 코드 패턴과 일관성을 유지하세요.`,
  review: `Planner의 아키텍처 가이드라인 준수 여부를 검증하세요.
Coder가 생성한 코드에서 SOLID 원칙 위반, 코드 스멜, 보안 이슈를 점검하세요.
이전 Phase에서 지적된 리스크가 해결되었는지 확인하세요.`,
  test: `Reviewer가 발견한 코드 스멜/이슈 영역에 집중 테스트하세요.
커버리지 갭이 있는 파일을 우선 테스트하세요.
Security Agent를 위해 보안 관련 테스트도 확인하세요.`,
  security: `이전 Phase에서 발견된 모든 파일 변경/코드 패턴을 보안 관점에서 재분석하세요.
Tester의 커버리지 갭이 보안 취약점과 겹치는지 확인하세요.
취약점마다 구체적인 수정 방법을 제시하세요.`,
  browser: `보안 이슈가 UI에 영향을 미치는지 확인하세요.
접근성 문제와 보안 문제가 겹치는 부분(입력 검증 UI 등)을 확인하세요.
이전 Phase의 성능 지적사항이 UI에 반영되는지 확인하세요.`,
  deploy: `모든 이전 Phase의 이슈가 해결되었는지 최종 확인하세요.
Critical/High 심각도 이슈가 남아있으면 배포를 보류하세요.
보안 취약점, 테스트 커버리지, 접근성 이슈를 배포 체크리스트에 반영하세요.`,
};
