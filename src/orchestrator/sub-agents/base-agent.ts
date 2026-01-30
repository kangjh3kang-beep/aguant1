/**
 * BaseSubAgent - 모든 서브에이전트의 추상 베이스 클래스
 */

import { Task, TaskResult, TaskIssue, SubAgentConfig, SubAgentInfo, AgentRole, AgentStatus } from '../types';

export abstract class BaseSubAgent {
  protected config: SubAgentConfig;
  protected info: SubAgentInfo;

  constructor(config: SubAgentConfig) {
    this.config = config;
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
