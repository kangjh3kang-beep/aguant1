/**
 * Coder Agent - 코드 작성 및 파일 생성
 *
 * AI 프로바이더를 통해 코드를 생성하거나,
 * 템플릿 기반으로 보일러플레이트를 작성합니다.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';

export class CoderAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Coder Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'code-generation',
      'file-creation',
      'dependency-installation',
      'boilerplate-scaffolding',
      'git-operations',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskResult['issues'] = [];
    const artifacts: string[] = [];
    const outputs: string[] = [];

    // AI 프로바이더 설정 확인
    if (this.config.aiProvider) {
      outputs.push(`[CODER] AI Provider: ${this.config.aiProvider.provider} (${this.config.aiProvider.model || 'default'})`);
    }

    outputs.push(`[CODER] Working on: ${task.title}`);
    outputs.push(`[CODER] Project: ${projectPath}`);

    // 프로젝트 환경 확인
    const envCheck = this.checkEnvironment(projectPath);
    outputs.push(...envCheck.logs);
    issues.push(...envCheck.issues);

    // Git 브랜치 생성 (필요시)
    const branchResult = this.ensureFeatureBranch(projectPath, task);
    outputs.push(...branchResult.logs);

    // 의존성 설치 확인
    const depResult = this.ensureDependencies(projectPath);
    outputs.push(...depResult.logs);
    issues.push(...depResult.issues);

    // AI 기반 코드 생성 (프로바이더가 있을 때)
    if (this.config.aiProvider) {
      outputs.push('[CODER] AI-powered code generation ready');
      outputs.push(`[CODER] Task: ${task.description}`);
      // 실제 AI 호출은 프로바이더 연동 시 구현
      outputs.push('[CODER] Note: Connect AI provider API key for autonomous coding');
    }

    // 기존 파일 분석
    const fileAnalysis = this.analyzeExistingFiles(projectPath);
    outputs.push(`[CODER] Analyzed ${fileAnalysis.totalFiles} existing files`);
    outputs.push(`[CODER] Source files: ${fileAnalysis.sourceFiles}`);
    outputs.push(`[CODER] Test files: ${fileAnalysis.testFiles}`);

    return {
      success: issues.filter((i) => i.severity === 'critical').length === 0,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  private checkEnvironment(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];

    // Node.js 환경
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      logs.push('[CODER] Node.js project detected');
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        logs.push(`[CODER] Project: ${pkg.name || 'unnamed'} v${pkg.version || '0.0.0'}`);
      } catch {
        issues.push(this.createIssue('warning', 'Could not parse package.json'));
      }
    }

    // TypeScript 환경
    if (fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
      logs.push('[CODER] TypeScript configuration found');
    }

    return { logs, issues };
  }

  private ensureFeatureBranch(projectPath: string, task: Task): { logs: string[] } {
    const logs: string[] = [];
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
      logs.push(`[CODER] Current branch: ${branch}`);
    } catch {
      logs.push('[CODER] Not a git repository or git not available');
    }
    return { logs };
  }

  private ensureDependencies(projectPath: string): { logs: string[]; issues: TaskResult['issues'] } {
    const logs: string[] = [];
    const issues: TaskResult['issues'] = [];

    const nodeModules = path.join(projectPath, 'node_modules');
    if (fs.existsSync(path.join(projectPath, 'package.json')) && !fs.existsSync(nodeModules)) {
      logs.push('[CODER] node_modules not found, installing dependencies...');
      try {
        execSync('npm install', { cwd: projectPath, timeout: 120000, stdio: 'pipe' });
        logs.push('[CODER] Dependencies installed successfully');
      } catch {
        issues.push(this.createIssue('error', 'Failed to install dependencies'));
      }
    } else {
      logs.push('[CODER] Dependencies already installed');
    }

    return { logs, issues };
  }

  private analyzeExistingFiles(projectPath: string): { totalFiles: number; sourceFiles: number; testFiles: number } {
    let totalFiles = 0;
    let sourceFiles = 0;
    let testFiles = 0;

    const scanDir = (dir: string, depth: number) => {
      if (depth > 5) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), depth + 1);
          } else {
            totalFiles++;
            if (/\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(entry.name)) {
              if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry.name)) {
                testFiles++;
              } else {
                sourceFiles++;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    };

    scanDir(projectPath, 0);
    return { totalFiles, sourceFiles, testFiles };
  }
}
