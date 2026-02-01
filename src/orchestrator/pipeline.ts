/**
 * Pipeline Engine - 파이프라인 실행 엔진
 *
 * plan → code → review → test → security → browser → deploy 순서로
 * 태스크를 실행하고, 실패 시 자동 재시도/수정 루프를 수행합니다.
 *
 * ━━━ 지능 공유 시스템 통합 (Phase 1) ━━━
 *  SharedKnowledgeBase: 에이전트 간 인사이트 축적
 *  EventBus: 실시간 이벤트 전달
 *  ContextChain: Phase 간 컨텍스트 전달
 */

import {
  PipelineState,
  PipelineConfig,
  PipelineLog,
  ProjectSpec,
  Task,
  TaskPhase,
  DEFAULT_PIPELINE_CONFIG,
} from './types';
import { decomposeProject, getReadyTasks, isPhaseComplete, hasPhaseFailure, updateTaskStatus, retryTask, getProgress } from './task-manager';
import { BaseSubAgent, createAgent, createDefaultAgentConfigs } from './sub-agents';
import { SharedKnowledgeBase, EventBus, ContextChain } from './shared-knowledge';
import { execSync } from 'child_process';

export class PipelineEngine {
  private state: PipelineState;
  private agents: Map<string, BaseSubAgent> = new Map();

  // ── 지능 공유 시스템 ──
  private knowledgeBase: SharedKnowledgeBase;
  private eventBus: EventBus;
  private contextChain: ContextChain;

  constructor(project: ProjectSpec, config?: Partial<PipelineConfig>) {
    const pipelineConfig: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };

    // 지능 공유 시스템 초기화
    this.knowledgeBase = new SharedKnowledgeBase();
    this.eventBus = new EventBus();
    this.contextChain = new ContextChain();

    // 에이전트 생성
    const agentConfigs = createDefaultAgentConfigs();
    for (const agentConfig of agentConfigs) {
      const agent = createAgent(agentConfig);
      // 지능 공유 시스템 연결
      agent.connectKnowledge(this.knowledgeBase, this.eventBus, this.contextChain);
      this.agents.set(agentConfig.role, agent);
    }

    // 태스크 분해
    const tasks = decomposeProject(project, pipelineConfig.phases);

    this.state = {
      id: `pipeline-${Date.now()}`,
      project,
      config: pipelineConfig,
      status: 'idle',
      currentPhase: pipelineConfig.phases[0] || 'plan',
      iteration: 0,
      tasks,
      agents: Array.from(this.agents.values()).map((a) => a.getInfo()),
      startedAt: new Date().toISOString(),
      logs: [],
    };
  }

  /**
   * 전체 파이프라인을 실행합니다.
   */
  run(): PipelineState {
    this.state.status = 'running';
    this.log('info', 'Pipeline started');
    this.log('info', `Project: ${this.state.project.name}`);
    this.log('info', `Phases: ${this.state.config.phases.join(' → ')}`);
    this.log('info', `Total tasks: ${this.state.tasks.length}`);
    this.log('info', `Max iterations: ${this.state.config.maxIterations}`);
    this.log('info', `Knowledge sharing: ENABLED (SharedKnowledgeBase + EventBus + ContextChain)`);

    // 이벤트: 파이프라인 시작
    this.eventBus.emit({
      type: 'phase:started',
      source: 'planner',
      phase: 'plan',
      data: { project: this.state.project.name, phases: this.state.config.phases },
    });

    try {
      for (const phase of this.state.config.phases) {
        this.state.currentPhase = phase;
        this.log('info', `\n═══ Phase: ${phase.toUpperCase()} ═══`, phase);

        // 이벤트: Phase 시작
        this.eventBus.emit({
          type: 'phase:started',
          source: this.getPhaseAgent(phase),
          phase,
          data: { knowledgeSize: this.knowledgeBase.size() },
        });

        // 인간 게이트 확인
        if (this.state.config.humanGates.includes(phase)) {
          this.log('warn', `Human gate: ${phase} requires manual approval`, phase);
          this.state.status = 'paused';
          return this.state;
        }

        // 이 phase의 태스크 실행
        this.executePhase(phase);

        // ── 코드 변경 안전장치: code phase 완료 후 테스트 검증 ──
        if (phase === 'code') {
          const verified = this.verifyAfterCodeChanges(this.state.project.rootPath);
          if (!verified) {
            this.log('warn', '  코드 변경 후 테스트 실패 → 변경사항 롤백', phase);
            this.rollbackCodeChanges(this.state.project.rootPath);
          }
        }

        // Phase 완료 후 ContextChain에 결과 저장
        this.storePhaseContext(phase);

        // 실패 확인
        if (hasPhaseFailure(this.state.tasks, phase)) {
          this.eventBus.emit({
            type: 'phase:failed',
            source: this.getPhaseAgent(phase),
            phase,
            data: { knowledgeSize: this.knowledgeBase.size() },
          });

          if (this.state.config.failFast) {
            this.log('error', `Phase ${phase} failed - pipeline stopped (failFast)`, phase);
            this.state.status = 'failed';
            return this.state;
          }

          // 재시도 루프
          if (this.state.iteration < this.state.config.maxIterations) {
            this.log('warn', `Phase ${phase} has failures - attempting retry (iteration ${this.state.iteration + 1})`, phase);
            this.retryFailedTasks(phase);
            this.state.iteration++;
          }
        }

        if (isPhaseComplete(this.state.tasks, phase)) {
          this.log('info', `Phase ${phase} completed successfully`, phase);
          this.eventBus.emit({
            type: 'phase:completed',
            source: this.getPhaseAgent(phase),
            phase,
            data: { knowledgeSize: this.knowledgeBase.size() },
          });
        } else {
          this.log('warn', `Phase ${phase} completed with issues`, phase);
        }

        // Phase 완료 후 KB 요약 로그
        const phaseInsights = this.knowledgeBase.getByPhase(phase);
        if (phaseInsights.length > 0) {
          this.log('info', `  [KB] ${phase} → ${phaseInsights.length}개 인사이트 축적`, phase);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log('error', `Pipeline crashed: ${errMsg}`);
      this.state.status = 'failed';
      return this.state;
    }

    // 최종 결과
    const progress = getProgress(this.state.tasks);
    const allPassed = progress.failed === 0;

    this.state.status = allPassed ? 'completed' : 'failed';
    this.state.completedAt = new Date().toISOString();

    this.log('info', '\n═══ Pipeline Complete ═══');
    this.log('info', `Status: ${this.state.status.toUpperCase()}`);
    this.log('info', `Tasks: ${progress.completed}/${progress.total} completed, ${progress.failed} failed`);
    this.log('info', `Progress: ${progress.percent}%`);
    this.log('info', `Knowledge: ${this.knowledgeBase.size()}개 인사이트 축적`);

    // 에이전트 상태 업데이트
    this.state.agents = Array.from(this.agents.values()).map((a) => a.getInfo());

    return this.state;
  }

  private executePhase(phase: TaskPhase): void {
    let readyTasks = getReadyTasks(this.state.tasks).filter((t) => t.phase === phase);

    while (readyTasks.length > 0) {
      for (const task of readyTasks) {
        this.executeTask(task);
      }
      // 새로 준비된 태스크 확인
      readyTasks = getReadyTasks(this.state.tasks).filter((t) => t.phase === phase);
    }
  }

  private executeTask(task: Task): void {
    const agent = this.agents.get(task.assignedAgent);
    if (!agent) {
      this.log('error', `No agent found for role: ${task.assignedAgent}`, task.phase);
      this.updateTask(task.id, updateTaskStatus(task, 'failed', {
        success: false,
        output: `No agent for role: ${task.assignedAgent}`,
        artifacts: [],
        issues: [{ severity: 'critical', message: `Missing agent: ${task.assignedAgent}`, autoFixable: false }],
        duration: 0,
      }));
      return;
    }

    this.log('info', `[${agent.getInfo().name}] → ${task.title}`, task.phase);
    this.updateTask(task.id, updateTaskStatus(task, 'in_progress'));

    const result = agent.run(task, this.state.project.rootPath);

    // INFO/warning 전용 이슈만 있으면 성공으로 판정
    const hasRealErrors = result.issues.some(
      (i) => i.severity === 'error' || i.severity === 'critical'
    );
    const effectiveSuccess = result.success || !hasRealErrors;
    const newStatus = effectiveSuccess ? 'completed' : 'failed';
    this.updateTask(task.id, updateTaskStatus(task, newStatus, { ...result, success: effectiveSuccess }));

    if (effectiveSuccess) {
      this.log('info', `[${agent.getInfo().name}] ✓ ${task.title} (${result.duration}ms)`, task.phase);
      // INFO 이슈가 있으면 참고용으로 표시
      const infoIssues = result.issues.filter((i) => i.severity === 'info' || i.severity === 'warning');
      for (const issue of infoIssues.slice(0, 3)) {
        this.log('info', `  ${issue.severity.toUpperCase()}: ${issue.message}`, task.phase);
      }
    } else {
      this.log('error', `[${agent.getInfo().name}] ✗ ${task.title} - ${result.issues.length} issue(s)`, task.phase);
      for (const issue of result.issues.slice(0, 5)) {
        this.log('error', `  ${issue.severity.toUpperCase()}: ${issue.message}`, task.phase);
      }
    }
  }

  private retryFailedTasks(phase: TaskPhase): void {
    const failedTasks = this.state.tasks.filter((t) => t.phase === phase && t.status === 'failed');
    for (const task of failedTasks) {
      const retried = retryTask(task);
      if (retried) {
        this.updateTask(task.id, retried);
        this.log('info', `Retrying: ${task.title} (attempt ${retried.retryCount})`, phase);
        this.executeTask(retried);
      } else {
        this.log('error', `Max retries exceeded: ${task.title}`, phase);
      }
    }
  }

  /**
   * Phase 완료 시 ContextChain에 결과를 저장합니다.
   */
  private storePhaseContext(phase: TaskPhase): void {
    const phaseTasks = this.state.tasks.filter((t) => t.phase === phase);
    const completed = phaseTasks.filter((t) => t.status === 'completed');
    const failed = phaseTasks.filter((t) => t.status === 'failed');

    const allIssues = phaseTasks
      .filter((t) => t.result)
      .flatMap((t) => t.result?.issues ?? []);

    const allArtifacts = phaseTasks
      .filter((t) => t.result)
      .flatMap((t) => t.result?.artifacts ?? []);

    const keyFindings: string[] = [];

    // 크리티컬/에러 이슈를 핵심 발견으로
    for (const issue of allIssues.filter((i) => i.severity === 'critical' || i.severity === 'error').slice(0, 10)) {
      keyFindings.push(`[${issue.severity.toUpperCase()}] ${issue.message}`);
    }

    // KB에서 이 Phase의 인사이트 요약
    const phaseInsights = this.knowledgeBase.getByPhase(phase);
    for (const insight of phaseInsights.filter((i) => i.severity === 'critical' || i.severity === 'high').slice(0, 5)) {
      keyFindings.push(`[KB:${insight.category}] ${insight.title}`);
    }

    this.contextChain.addPhaseResult({
      phase,
      agent: this.getPhaseAgent(phase),
      summary: `${completed.length}/${phaseTasks.length} 태스크 완료, ${failed.length} 실패, ${allIssues.length} 이슈`,
      keyFindings,
      issues: allIssues,
      artifacts: allArtifacts,
      metrics: {
        totalTasks: phaseTasks.length,
        completed: completed.length,
        failed: failed.length,
        issues: allIssues.length,
        criticalIssues: allIssues.filter((i) => i.severity === 'critical').length,
        kbInsights: phaseInsights.length,
      },
    });
  }

  private getPhaseAgent(phase: TaskPhase): import('./types').AgentRole {
    const map: Record<TaskPhase, import('./types').AgentRole> = {
      plan: 'planner',
      code: 'coder',
      review: 'reviewer',
      test: 'tester',
      security: 'security',
      browser: 'browser',
      deploy: 'deployer',
    };
    return map[phase] || 'planner';
  }

  private updateTask(taskId: string, updated: Task): void {
    const idx = this.state.tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      this.state.tasks[idx] = updated;
    }
  }

  private log(level: PipelineLog['level'], message: string, phase?: TaskPhase): void {
    this.state.logs.push({
      timestamp: new Date().toISOString(),
      level,
      phase,
      message,
    });
  }

  /**
   * 코드 변경 후 테스트가 여전히 통과하는지 검증합니다.
   * code phase 완료 직후 실행되어, 깨진 코드가 후속 phase로 전파되는 것을 방지합니다.
   */
  private verifyAfterCodeChanges(projectPath: string): boolean {
    this.log('info', '  [SafeGuard] 코드 변경 후 테스트 검증 시작...', 'code');
    try {
      execSync('npx jest --bail --no-coverage 2>&1', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.log('info', '  [SafeGuard] ✓ 테스트 검증 통과', 'code');
      return true;
    } catch {
      this.log('error', '  [SafeGuard] ✗ 코드 변경으로 인해 테스트 실패 감지', 'code');
      return false;
    }
  }

  /**
   * 코드 변경으로 인해 테스트가 실패한 경우, git으로 변경사항을 롤백합니다.
   */
  private rollbackCodeChanges(projectPath: string): void {
    try {
      execSync('git checkout -- .', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.log('info', '  [SafeGuard] 코드 변경 롤백 완료 (git checkout)', 'code');
    } catch {
      this.log('warn', '  [SafeGuard] 롤백 실패 — 수동 확인 필요', 'code');
    }
  }

  /**
   * 현재 파이프라인 상태를 반환합니다.
   */
  getState(): PipelineState {
    return { ...this.state };
  }

  /**
   * 지능 공유 시스템 접근자
   */
  getKnowledgeBase(): SharedKnowledgeBase {
    return this.knowledgeBase;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getContextChain(): ContextChain {
    return this.contextChain;
  }

  /**
   * 파이프라인 로그를 포맷된 텍스트로 반환합니다.
   */
  formatLogs(): string {
    const lines: string[] = [];

    lines.push('╔══════════════════════════════════════════════╗');
    lines.push('║   Antigravity Orchestration Pipeline         ║');
    lines.push('╚══════════════════════════════════════════════╝');
    lines.push('');
    lines.push(`  Project:    ${this.state.project.name}`);
    lines.push(`  Status:     ${this.state.status.toUpperCase()}`);
    lines.push(`  Phases:     ${this.state.config.phases.join(' → ')}`);
    lines.push(`  Started:    ${this.state.startedAt}`);
    if (this.state.completedAt) {
      lines.push(`  Completed:  ${this.state.completedAt}`);
    }
    lines.push(`  Knowledge:  ${this.knowledgeBase.size()} insights`);
    lines.push('');

    // 에이전트 상태
    lines.push('  [Agents]');
    for (const agent of this.state.agents) {
      lines.push(`    ${agent.name}: completed=${agent.completedTasks} failed=${agent.failedTasks} avg=${agent.avgDuration}ms`);
    }
    lines.push('');

    // 태스크 요약
    const progress = getProgress(this.state.tasks);
    lines.push(`  [Tasks] ${progress.completed}/${progress.total} (${progress.percent}%) | ${progress.failed} failed | ${progress.inProgress} in progress`);
    lines.push('');

    // KB 요약
    lines.push('  [Knowledge Base]');
    lines.push(`    ${this.knowledgeBase.buildSummary().split('\n').slice(3).join('\n    ')}`);
    lines.push('');

    // 로그
    lines.push('  [Execution Log]');
    for (const log of this.state.logs) {
      const time = new Date(log.timestamp).toLocaleTimeString();
      const prefix = log.level === 'error' ? '✗' : log.level === 'warn' ? '!' : '→';
      lines.push(`    ${time} ${prefix} ${log.message}`);
    }

    return lines.join('\n');
  }
}
