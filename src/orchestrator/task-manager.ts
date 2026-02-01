/**
 * Task Manager - 프로젝트를 태스크로 분해하고 추적합니다.
 */

import { Task, TaskPhase, TaskStatus, TaskResult, ProjectSpec } from './types';

let taskCounter = 0;

function generateTaskId(): string {
  taskCounter++;
  return `task-${Date.now()}-${taskCounter}`;
}

/**
 * 요구사항을 파이프라인 태스크로 분해합니다.
 */
export function decomposeProject(project: ProjectSpec, phases: TaskPhase[]): Task[] {
  const tasks: Task[] = [];

  // 1단계: Plan 태스크
  if (phases.includes('plan')) {
    tasks.push(createTask('plan', 'planner', 'System Architecture Design', `Design architecture for: ${project.description}`, []));

    for (const req of project.requirements) {
      tasks.push(createTask('plan', 'planner', `Plan: ${req.title}`, `Design implementation plan for requirement: ${req.description}`, [tasks[0].id]));
    }
  }

  // 2단계: Code 태스크 (요구사항별 코딩)
  const planTaskIds = tasks.filter((t) => t.phase === 'plan').map((t) => t.id);
  if (phases.includes('code')) {
    for (const req of project.requirements) {
      const codeTask = createTask('code', 'coder', `Code: ${req.title}`, `Implement: ${req.description}\nType: ${req.type}\nPriority: ${req.priority}`, planTaskIds);
      tasks.push(codeTask);
    }
  }

  // 3단계: Review 태스크 (코딩 완료 후)
  const codeTaskIds = tasks.filter((t) => t.phase === 'code').map((t) => t.id);
  if (phases.includes('review')) {
    tasks.push(createTask('review', 'reviewer', 'Code Review: Full Project', 'Run comprehensive code review on all implemented code', codeTaskIds));
  }

  // 4단계: Test 태스크
  const reviewTaskIds = tasks.filter((t) => t.phase === 'review').map((t) => t.id);
  if (phases.includes('test')) {
    tasks.push(createTask('test', 'tester', 'Run Test Suite', 'Execute all unit, integration, and e2e tests', reviewTaskIds));
  }

  // 5단계: Security 태스크
  const testTaskIds = tasks.filter((t) => t.phase === 'test').map((t) => t.id);
  if (phases.includes('security')) {
    tasks.push(createTask('security', 'security', 'Security Audit', 'Run security analysis: dependency audit, SAST, secrets scan', testTaskIds));
  }

  // 6단계: Browser 태스크
  const securityTaskIds = tasks.filter((t) => t.phase === 'security').map((t) => t.id);
  if (phases.includes('browser')) {
    tasks.push(createTask('browser', 'browser', 'Browser Visual Testing', `Open ${project.browserTestUrl || project.rootPath} and verify UI via screenshots`, securityTaskIds));
  }

  // 7단계: Deploy 태스크
  const browserTaskIds = tasks.filter((t) => t.phase === 'browser').map((t) => t.id);
  if (phases.includes('deploy')) {
    tasks.push(createTask('deploy', 'deployer', 'Build & Deploy', `Deploy to ${project.deployment?.target || 'local'} (${project.deployment?.environment || 'development'})`, browserTaskIds));
  }

  return tasks;
}

function createTask(phase: TaskPhase, agent: string, title: string, description: string, dependencies: string[]): Task {
  return {
    id: generateTaskId(),
    phase,
    title,
    description,
    assignedAgent: agent,
    status: 'pending',
    dependencies,
    files: [],
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date().toISOString(),
  };
}

/**
 * 실행 가능한 태스크를 반환합니다 (의존성 완료된 pending 태스크).
 */
export function getReadyTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => {
    if (task.status !== 'pending') return false;
    return task.dependencies.every((depId) => {
      const dep = tasks.find((t) => t.id === depId);
      return dep && dep.status === 'completed';
    });
  });
}

/**
 * 특정 phase의 모든 태스크가 완료되었는지 확인합니다.
 */
export function isPhaseComplete(tasks: Task[], phase: TaskPhase): boolean {
  const phaseTasks = tasks.filter((t) => t.phase === phase);
  if (phaseTasks.length === 0) return true;
  return phaseTasks.every((t) => t.status === 'completed');
}

/**
 * 특정 phase에 실패한 태스크가 있는지 확인합니다.
 */
export function hasPhaseFailure(tasks: Task[], phase: TaskPhase): boolean {
  return tasks.filter((t) => t.phase === phase).some((t) => t.status === 'failed');
}

/**
 * 태스크 상태를 업데이트합니다.
 */
export function updateTaskStatus(task: Task, status: TaskStatus, result?: TaskResult): Task {
  const updated = { ...task, status };
  if (status === 'in_progress' && !updated.startedAt) {
    updated.startedAt = new Date().toISOString();
  }
  if (status === 'completed' || status === 'failed') {
    updated.completedAt = new Date().toISOString();
  }
  if (result) {
    updated.result = result;
  }
  return updated;
}

/**
 * 실패한 태스크를 재시도용으로 리셋합니다.
 */
export function retryTask(task: Task): Task | null {
  if (task.retryCount >= task.maxRetries) return null;
  return {
    ...task,
    status: 'pending',
    retryCount: task.retryCount + 1,
    result: undefined,
    startedAt: undefined,
    completedAt: undefined,
  };
}

/**
 * 파이프라인 진행률을 계산합니다.
 */
export function getProgress(tasks: Task[]): { total: number; completed: number; failed: number; inProgress: number; percent: number } {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, failed, inProgress, percent };
}
