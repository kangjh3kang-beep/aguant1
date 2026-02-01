/**
 * BaseSubAgent - 모든 서브에이전트의 추상 베이스 클래스
 *
 * ━━━ 프롬프트 강화 파이프라인 ━━━
 *  모든 서브에이전트가 PromptEnhancer를 통해 태스크를 자동으로 강화합니다.
 *  간단한 명령도 전문가급 상세 지시로 자동 확장됩니다.
 *
 * ━━━ 지능 공유 시스템 (Phase 1) ━━━
 *  SharedKnowledgeBase를 통해 에이전트 간 인사이트를 축적하고 참조합니다.
 *  ContextChain을 통해 이전 Phase 결과가 다음 Phase에 자동 주입됩니다.
 *  EventBus를 통해 실시간 이벤트를 발행/구독합니다.
 */

import { Task, TaskResult, TaskIssue, SubAgentConfig, SubAgentInfo, AgentRole, AgentStatus } from '../types';
import { PromptEnhancer, EnhancedPrompt } from '../prompt-enhancer';
import { SharedKnowledgeBase, EventBus, ContextChain, InsightCategory, InsightSeverity } from '../shared-knowledge';
import { callAISyncUtil } from '../../utils/ai-sync-caller';

export abstract class BaseSubAgent {
  protected config: SubAgentConfig;
  protected info: SubAgentInfo;
  protected promptEnhancer: PromptEnhancer;

  // ── 지능 공유 시스템 ──
  protected knowledgeBase: SharedKnowledgeBase | null = null;
  protected eventBus: EventBus | null = null;
  protected contextChain: ContextChain | null = null;

  constructor(config: SubAgentConfig) {
    this.config = config;
    this.promptEnhancer = new PromptEnhancer();
    this.info = {
      id: `${config.role}-${Date.now()}`,
      name: this.getAgentName(),
      role: config.role,
      status: 'idle',
      capabilities: this.getCapabilities(),
      completedTasks: 0,
      failedTasks: 0,
      avgDuration: 0,
    };
  }

  /** 에이전트 이름 */
  protected abstract getAgentName(): string;

  /** 에이전트 능력 목록 */
  protected abstract getCapabilities(): string[];

  /** 태스크 실행 (각 에이전트가 구현) */
  protected abstract executeTask(task: Task, projectPath: string): TaskResult;

  /**
   * 지능 공유 시스템을 연결합니다.
   * PipelineEngine에서 에이전트 생성 후 호출합니다.
   */
  connectKnowledge(kb: SharedKnowledgeBase, bus: EventBus, chain: ContextChain): void {
    this.knowledgeBase = kb;
    this.eventBus = bus;
    this.contextChain = chain;
  }

  /**
   * 태스크를 실행합니다 (공통 래핑 로직).
   */
  run(task: Task, projectPath: string): TaskResult {
    this.info.status = 'working';
    this.info.currentTask = task.id;
    const start = Date.now();

    // 이벤트 발행: 태스크 시작
    this.emitEvent('task:started', { taskId: task.id, title: task.title }, task);

    try {
      const result = this.executeTask(task, projectPath);
      const duration = Date.now() - start;
      result.duration = duration;

      if (result.success) {
        this.info.completedTasks++;
        this.emitEvent('task:completed', { taskId: task.id, duration, issues: result.issues.length }, task);
      } else {
        this.info.failedTasks++;
        this.emitEvent('task:failed', { taskId: task.id, duration, issues: result.issues.length }, task);
      }

      // 이슈를 인사이트로 자동 변환하여 KB에 저장
      this.storeIssuesAsInsights(task, result);

      this.updateAvgDuration(duration);
      this.info.status = 'idle';
      this.info.currentTask = undefined;

      return result;
    } catch (err: unknown) {
      const duration = Date.now() - start;
      this.info.failedTasks++;
      this.info.status = 'error';
      this.info.currentTask = undefined;
      this.updateAvgDuration(duration);

      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emitEvent('task:failed', { taskId: task.id, error: errorMsg }, task);

      return {
        success: false,
        output: `Agent ${this.info.name} crashed: ${errorMsg}`,
        artifacts: [],
        issues: [{
          severity: 'critical',
          message: `Agent crash: ${errorMsg}`,
          autoFixable: false,
        }],
        duration,
      };
    }
  }

  getInfo(): SubAgentInfo {
    return { ...this.info };
  }

  getRole(): AgentRole {
    return this.config.role;
  }

  getStatus(): AgentStatus {
    return this.info.status;
  }

  private updateAvgDuration(duration: number): void {
    const total = this.info.completedTasks + this.info.failedTasks;
    if (total <= 1) {
      this.info.avgDuration = duration;
    } else {
      this.info.avgDuration = Math.round(
        (this.info.avgDuration * (total - 1) + duration) / total,
      );
    }
  }

  /**
   * 태스크 프롬프트를 전문가급으로 강화합니다.
   * 간단한 한 줄 명령도 상세한 전문가 지시로 자동 확장합니다.
   */
  protected enhanceTask(task: Task): EnhancedPrompt {
    return this.promptEnhancer.enhance(this.config.role, task);
  }

  /**
   * 태스크 설명만 확장합니다 (간단한 명령 → 상세 지시).
   */
  protected expandDescription(description: string): string {
    return this.promptEnhancer.expandDescription(this.config.role, description);
  }

  /**
   * 이 에이전트의 전문가 시스템 프롬프트를 반환합니다.
   */
  protected getSystemPrompt(): string {
    return this.promptEnhancer.buildSystemPrompt(this.config.role);
  }

  /**
   * 이슈 헬퍼 메서드
   */
  protected createIssue(severity: TaskIssue['severity'], message: string, opts?: Partial<TaskIssue>): TaskIssue {
    return {
      severity,
      message,
      autoFixable: false,
      ...opts,
    };
  }

  // ─── 지능 공유 헬퍼 메서드 ─────────────────────────────

  /**
   * SharedKnowledgeBase에 인사이트를 추가합니다.
   */
  protected addInsight(
    category: InsightCategory,
    severity: InsightSeverity,
    title: string,
    description: string,
    task: Task,
    affectedFiles: string[] = [],
    metadata: Record<string, unknown> = {},
  ): void {
    if (!this.knowledgeBase) return;
    this.knowledgeBase.addInsight({
      category,
      severity,
      source: this.config.role,
      phase: task.phase,
      title,
      description,
      affectedFiles,
      metadata,
    });
  }

  /**
   * 이전 Phase 및 다른 에이전트의 인사이트를 기반으로
   * 현재 에이전트를 위한 컨텍스트를 생성합니다.
   */
  protected getSharedContext(task: Task): string {
    const parts: string[] = [];

    // KB 컨텍스트
    if (this.knowledgeBase && this.knowledgeBase.size() > 0) {
      parts.push(this.knowledgeBase.buildContextForAgent(this.config.role));
    }

    // ContextChain 컨텍스트
    if (this.contextChain) {
      const chainCtx = this.contextChain.buildContextForNextPhase(task.phase);
      if (chainCtx) {
        parts.push(chainCtx);
      }
    }

    return parts.join('\n');
  }

  /**
   * EventBus에 이벤트를 발행합니다.
   */
  protected emitEvent(
    type: Parameters<EventBus['emit']>[0]['type'],
    data: Record<string, unknown>,
    task?: Task,
  ): void {
    if (!this.eventBus) return;
    this.eventBus.emit({
      type,
      source: this.config.role,
      phase: task?.phase || 'plan',
      data,
    });
  }

  /**
   * TaskResult의 이슈를 자동으로 인사이트로 변환하여 KB에 저장합니다.
   */
  private storeIssuesAsInsights(task: Task, result: TaskResult): void {
    if (!this.knowledgeBase) return;

    for (const issue of result.issues) {
      const category = this.mapIssueToCategoryForRole(issue);
      const severity = this.mapSeverity(issue.severity);

      this.knowledgeBase.addInsight({
        category,
        severity,
        source: this.config.role,
        phase: task.phase,
        title: issue.message.slice(0, 100),
        description: issue.message,
        affectedFiles: issue.file ? [issue.file] : [],
        metadata: {
          line: issue.line,
          autoFixable: issue.autoFixable,
          suggestion: issue.suggestion,
        },
      });
    }
  }

  // ─── AI 호출 공통 헬퍼 ──────────────────────────────────

  /**
   * AI 프로바이더를 통해 동기적으로 텍스트 분석/생성을 요청합니다.
   *
   * executeTask()가 동기 메서드이므로 async generateCode()를
   * 임시 스크립트 + execSync 방식으로 래핑합니다.
   *
   * @returns AI 응답 텍스트 또는 null (API 키 없음 / 호출 실패)
   */
  protected callAISync(
    systemPrompt: string,
    userPrompt: string,
    opts?: { maxTokens?: number; timeout?: number },
  ): string | null {
    try {
      // 지연 로딩: 테스트 환경에서 순환 의존 방지
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoDetectProvider } = require('../ai-provider');
      const aiConfig = this.config.aiProvider || autoDetectProvider();
      if (!aiConfig) return null;

      return callAISyncUtil({
        aiConfig,
        systemPrompt,
        userPrompt,
        maxTokens: opts?.maxTokens,
        timeout: opts?.timeout,
      });
    } catch (err: unknown) {
      // AI 호출 실패 시 null 반환 (호출측에서 graceful 처리)
      if (process.env.AG_DEBUG) {
        // no-op
      }
      return null;
    }
  }

  /**
   * AI 프로바이더가 사용 가능한지 빠르게 확인합니다.
   */
  protected hasAIProvider(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoDetectProvider } = require('../ai-provider');
      return !!(this.config.aiProvider || autoDetectProvider());
    } catch (_err: unknown) {
      return false;
    }
  }

  private mapIssueToCategoryForRole(_issue: TaskIssue): InsightCategory {
    switch (this.config.role) {
      case 'planner': return 'architecture';
      case 'coder': return 'code-pattern';
      case 'reviewer': return 'code-pattern';
      case 'tester': return 'test-coverage';
      case 'security': return 'vulnerability';
      case 'browser': return 'accessibility';
      case 'deployer': return 'deploy-readiness';
      default: return 'recommendation';
    }
  }

  private mapSeverity(severity: TaskIssue['severity']): InsightSeverity {
    switch (severity) {
      case 'critical': return 'critical';
      case 'error': return 'high';
      case 'warning': return 'medium';
      case 'info': return 'info';
      default: return 'low';
    }
  }
}
