/**
 * BaseSubAgent - 모든 서브에이전트의 추상 베이스 클래스
 *
 * ━━━ 프롬프트 강화 파이프라인 ━━━
 *  모든 서브에이전트가 PromptEnhancer를 통해 태스크를 자동으로 강화합니다.
 *  간단한 명령도 전문가급 상세 지시로 자동 확장됩니다.
 */

import { Task, TaskResult, TaskIssue, SubAgentConfig, SubAgentInfo, AgentRole, AgentStatus } from '../types';
import { PromptEnhancer, EnhancedPrompt } from '../prompt-enhancer';

export abstract class BaseSubAgent {
  protected config: SubAgentConfig;
  protected info: SubAgentInfo;
  protected promptEnhancer: PromptEnhancer;

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
   * 태스크를 실행합니다 (공통 래핑 로직).
   */
  run(task: Task, projectPath: string): TaskResult {
    this.info.status = 'working';
    this.info.currentTask = task.id;
    const start = Date.now();

    try {
      const result = this.executeTask(task, projectPath);
      const duration = Date.now() - start;
      result.duration = duration;

      if (result.success) {
        this.info.completedTasks++;
      } else {
        this.info.failedTasks++;
      }

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

      return {
        success: false,
        output: `Agent ${this.info.name} crashed: ${err instanceof Error ? err.message : String(err)}`,
        artifacts: [],
        issues: [{
          severity: 'critical',
          message: `Agent crash: ${err instanceof Error ? err.message : String(err)}`,
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
}
