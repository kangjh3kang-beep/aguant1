/**
 * Planner Agent - 시스템 아키텍처 설계 및 태스크 분해
 *
 * 프로젝트 구조를 분석하고, 기술 스택을 파악하며,
 * 요구사항을 구현 계획으로 변환합니다.
 */

import fs from 'fs';
import path from 'path';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';

export class PlannerAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Planner Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'project-structure-analysis',
      'tech-stack-detection',
      'architecture-design',
      'task-decomposition',
      'dependency-mapping',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const analysis = this.analyzeProject(projectPath);
    const plan = this.generatePlan(task, analysis);

    return {
      success: true,
      output: plan,
      artifacts: [],
      issues: analysis.issues,
      duration: 0,
    };
  }

  private analyzeProject(projectPath: string): { structure: string[]; techStack: string[]; issues: TaskResult['issues'] } {
    const issues: TaskResult['issues'] = [];
    const structure: string[] = [];
    const techStack: string[] = [];

    // 프로젝트 구조 스캔
    try {
      const entries = fs.readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        structure.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
      }
    } catch {
      issues.push({ severity: 'warning', message: 'Could not read project directory', autoFixable: false });
    }

    // 기술 스택 감지
    const detectors: [string, string][] = [
      ['package.json', 'Node.js'],
      ['tsconfig.json', 'TypeScript'],
      ['Cargo.toml', 'Rust'],
      ['go.mod', 'Go'],
      ['requirements.txt', 'Python'],
      ['pom.xml', 'Java/Maven'],
      ['build.gradle', 'Java/Gradle'],
      ['Dockerfile', 'Docker'],
      ['docker-compose.yml', 'Docker Compose'],
      ['.github/workflows', 'GitHub Actions'],
      ['next.config.js', 'Next.js'],
      ['vite.config.ts', 'Vite'],
    ];

    for (const [file, tech] of detectors) {
      if (fs.existsSync(path.join(projectPath, file))) {
        techStack.push(tech);
      }
    }

    // package.json 의존성 분석
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (allDeps.react) techStack.push('React');
        if (allDeps.vue) techStack.push('Vue');
        if (allDeps.angular) techStack.push('Angular');
        if (allDeps.express) techStack.push('Express');
        if (allDeps.nestjs || allDeps['@nestjs/core']) techStack.push('NestJS');
        if (allDeps.jest) techStack.push('Jest');
        if (allDeps.vitest) techStack.push('Vitest');
        if (allDeps.eslint) techStack.push('ESLint');
        if (allDeps.prettier) techStack.push('Prettier');
      } catch {
        issues.push({ severity: 'info', message: 'Could not parse package.json', autoFixable: false });
      }
    }

    if (techStack.length === 0) {
      issues.push({ severity: 'warning', message: 'Could not detect tech stack', autoFixable: false });
    }

    return { structure, techStack, issues };
  }

  private generatePlan(task: Task, analysis: { structure: string[]; techStack: string[] }): string {
    const lines: string[] = [];
    lines.push('═══════════════════════════════════════');
    lines.push(`  PLAN: ${task.title}`);
    lines.push('═══════════════════════════════════════');
    lines.push('');
    lines.push('[Detected Tech Stack]');
    for (const tech of analysis.techStack) {
      lines.push(`  - ${tech}`);
    }
    lines.push('');
    lines.push('[Project Structure]');
    for (const item of analysis.structure.slice(0, 20)) {
      lines.push(`  ${item}`);
    }
    lines.push('');
    lines.push('[Task Description]');
    lines.push(`  ${task.description}`);
    lines.push('');
    lines.push('[Implementation Plan]');
    lines.push('  1. Analyze existing codebase and identify affected files');
    lines.push('  2. Design module interfaces and data flow');
    lines.push('  3. Implement core logic with type safety');
    lines.push('  4. Add error handling and edge cases');
    lines.push('  5. Write unit and integration tests');
    lines.push('  6. Run code review and fix issues');
    lines.push('═══════════════════════════════════════');
    return lines.join('\n');
  }
}
