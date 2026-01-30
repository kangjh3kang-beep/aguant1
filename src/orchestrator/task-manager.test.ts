import { decomposeProject, getReadyTasks, isPhaseComplete, hasPhaseFailure, updateTaskStatus, retryTask, getProgress } from './task-manager';
import { ProjectSpec, Task } from './types';

const mockProject: ProjectSpec = {
  name: 'test-project',
  description: 'A test project',
  rootPath: '/test',
  techStack: { language: 'typescript', framework: 'React' },
  requirements: [
    { id: 'req-1', title: 'Feature A', description: 'Build feature A', priority: 'high', type: 'feature' },
    { id: 'req-2', title: 'Fix Bug B', description: 'Fix bug B', priority: 'medium', type: 'bugfix' },
  ],
};

describe('task-manager', () => {
  describe('decomposeProject', () => {
    it('should create tasks for all phases', () => {
      const tasks = decomposeProject(mockProject, ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy']);

      expect(tasks.length).toBeGreaterThan(0);
      const phases = [...new Set(tasks.map((t) => t.phase))];
      expect(phases).toContain('plan');
      expect(phases).toContain('code');
      expect(phases).toContain('review');
    });

    it('should create plan tasks per requirement', () => {
      const tasks = decomposeProject(mockProject, ['plan']);

      // 1 architecture + 2 requirement plans
      expect(tasks.length).toBe(3);
      expect(tasks[0].title).toContain('Architecture');
      expect(tasks[1].title).toContain('Feature A');
      expect(tasks[2].title).toContain('Fix Bug B');
    });

    it('should create code tasks per requirement', () => {
      const tasks = decomposeProject(mockProject, ['plan', 'code']);
      const codeTasks = tasks.filter((t) => t.phase === 'code');

      expect(codeTasks.length).toBe(2);
      expect(codeTasks[0].assignedAgent).toBe('coder');
    });

    it('should set dependencies between phases', () => {
      const tasks = decomposeProject(mockProject, ['plan', 'code']);
      const codeTasks = tasks.filter((t) => t.phase === 'code');
      const planTaskIds = tasks.filter((t) => t.phase === 'plan').map((t) => t.id);

      for (const codeTask of codeTasks) {
        expect(codeTask.dependencies.length).toBeGreaterThan(0);
        for (const dep of codeTask.dependencies) {
          expect(planTaskIds).toContain(dep);
        }
      }
    });

    it('should handle subset of phases', () => {
      const tasks = decomposeProject(mockProject, ['review', 'test']);

      expect(tasks.filter((t) => t.phase === 'review').length).toBe(1);
      expect(tasks.filter((t) => t.phase === 'test').length).toBe(1);
      expect(tasks.filter((t) => t.phase === 'plan').length).toBe(0);
    });
  });

  describe('getReadyTasks', () => {
    it('should return tasks with all dependencies completed', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'plan', title: 'Plan', description: '', assignedAgent: 'planner', status: 'completed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't2', phase: 'code', title: 'Code', description: '', assignedAgent: 'coder', status: 'pending', dependencies: ['t1'], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      const ready = getReadyTasks(tasks);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('t2');
    });

    it('should not return tasks with pending dependencies', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'plan', title: 'Plan', description: '', assignedAgent: 'planner', status: 'pending', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't2', phase: 'code', title: 'Code', description: '', assignedAgent: 'coder', status: 'pending', dependencies: ['t1'], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      const ready = getReadyTasks(tasks);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe('t1'); // only t1 has no deps
    });
  });

  describe('isPhaseComplete', () => {
    it('should return true when all tasks in phase are completed', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'completed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      expect(isPhaseComplete(tasks, 'plan')).toBe(true);
    });

    it('should return false when some tasks are pending', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'completed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't2', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'pending', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      expect(isPhaseComplete(tasks, 'plan')).toBe(false);
    });

    it('should return true for empty phase', () => {
      expect(isPhaseComplete([], 'deploy')).toBe(true);
    });
  });

  describe('hasPhaseFailure', () => {
    it('should detect failed tasks', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'test', title: '', description: '', assignedAgent: 'tester', status: 'failed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      expect(hasPhaseFailure(tasks, 'test')).toBe(true);
    });
  });

  describe('updateTaskStatus', () => {
    it('should set startedAt on in_progress', () => {
      const task: Task = { id: 't1', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'pending', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' };

      const updated = updateTaskStatus(task, 'in_progress');
      expect(updated.status).toBe('in_progress');
      expect(updated.startedAt).toBeDefined();
    });

    it('should set completedAt on completed', () => {
      const task: Task = { id: 't1', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'in_progress', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' };

      const updated = updateTaskStatus(task, 'completed');
      expect(updated.completedAt).toBeDefined();
    });
  });

  describe('retryTask', () => {
    it('should reset task for retry', () => {
      const task: Task = { id: 't1', phase: 'test', title: '', description: '', assignedAgent: 'tester', status: 'failed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' };

      const retried = retryTask(task);
      expect(retried).not.toBeNull();
      expect(retried!.status).toBe('pending');
      expect(retried!.retryCount).toBe(1);
    });

    it('should return null when max retries exceeded', () => {
      const task: Task = { id: 't1', phase: 'test', title: '', description: '', assignedAgent: 'tester', status: 'failed', dependencies: [], files: [], retryCount: 3, maxRetries: 3, createdAt: '' };

      expect(retryTask(task)).toBeNull();
    });
  });

  describe('getProgress', () => {
    it('should calculate progress correctly', () => {
      const tasks: Task[] = [
        { id: 't1', phase: 'plan', title: '', description: '', assignedAgent: 'planner', status: 'completed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't2', phase: 'code', title: '', description: '', assignedAgent: 'coder', status: 'in_progress', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't3', phase: 'test', title: '', description: '', assignedAgent: 'tester', status: 'failed', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
        { id: 't4', phase: 'deploy', title: '', description: '', assignedAgent: 'deployer', status: 'pending', dependencies: [], files: [], retryCount: 0, maxRetries: 3, createdAt: '' },
      ];

      const progress = getProgress(tasks);
      expect(progress.total).toBe(4);
      expect(progress.completed).toBe(1);
      expect(progress.failed).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.percent).toBe(25);
    });
  });
});
