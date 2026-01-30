/**
 * Deployer Agent - 빌드 및 배포 자동화
 *
 * 프로젝트를 빌드하고, Docker/K8s/Vercel/클라우드에 배포합니다.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Task, TaskResult, TaskIssue, DeploymentConfig } from '../types';
import { BaseSubAgent } from './base-agent';

export class DeployerAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Deployer Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'project-build',
      'docker-build',
      'docker-compose',
      'vercel-deploy',
      'custom-deploy',
      'rollback',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    const issues: TaskIssue[] = [];
    const outputs: string[] = [];
    const artifacts: string[] = [];

    outputs.push('[DEPLOYER] Starting build & deploy pipeline...');

    // 1단계: 빌드
    const buildResult = this.buildProject(projectPath);
    outputs.push(...buildResult.logs);
    issues.push(...buildResult.issues);

    if (!buildResult.success) {
      return {
        success: false,
        output: outputs.join('\n'),
        artifacts,
        issues,
        duration: 0,
      };
    }

    // 2단계: 배포 (설정에 따라)
    const deployConfig = this.detectDeployTarget(projectPath);
    outputs.push(`[DEPLOYER] Deploy target: ${deployConfig.target}`);
    outputs.push(`[DEPLOYER] Environment: ${deployConfig.environment}`);

    const deployResult = this.deploy(projectPath, deployConfig);
    outputs.push(...deployResult.logs);
    issues.push(...deployResult.issues);
    artifacts.push(...deployResult.artifacts);

    return {
      success: deployResult.success,
      output: outputs.join('\n'),
      artifacts,
      issues,
      duration: 0,
    };
  }

  private buildProject(projectPath: string): { success: boolean; logs: string[]; issues: TaskIssue[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];

    logs.push('[DEPLOYER] Building project...');

    // package.json에서 build 스크립트 확인
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const buildScript = pkg.scripts?.build;

        if (buildScript) {
          logs.push(`[DEPLOYER] Build script: ${buildScript}`);
          try {
            const output = execSync('npm run build', {
              cwd: projectPath,
              encoding: 'utf-8',
              timeout: 300000,
              maxBuffer: 10 * 1024 * 1024,
            });
            logs.push('[DEPLOYER] Build succeeded');
            logs.push(output.slice(-500));
            return { success: true, logs, issues };
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            issues.push(this.createIssue('critical', `Build failed: ${errMsg.slice(0, 300)}`));
            logs.push(`[DEPLOYER] Build failed: ${errMsg.slice(0, 500)}`);
            return { success: false, logs, issues };
          }
        } else {
          logs.push('[DEPLOYER] No build script found in package.json');
        }
      } catch {
        issues.push(this.createIssue('warning', 'Could not parse package.json'));
      }
    }

    // Makefile 확인
    if (fs.existsSync(path.join(projectPath, 'Makefile'))) {
      logs.push('[DEPLOYER] Makefile found');
      try {
        execSync('make build', { cwd: projectPath, encoding: 'utf-8', timeout: 300000 });
        logs.push('[DEPLOYER] make build succeeded');
        return { success: true, logs, issues };
      } catch {
        logs.push('[DEPLOYER] make build not available, skipping');
      }
    }

    logs.push('[DEPLOYER] No build system detected, skipping build step');
    return { success: true, logs, issues };
  }

  private detectDeployTarget(projectPath: string): DeploymentConfig {
    // 자동 감지
    if (fs.existsSync(path.join(projectPath, 'Dockerfile'))) {
      return { target: 'docker', environment: 'development' };
    }
    if (fs.existsSync(path.join(projectPath, 'vercel.json')) ||
        fs.existsSync(path.join(projectPath, '.vercel'))) {
      return { target: 'vercel', environment: 'development' };
    }
    if (fs.existsSync(path.join(projectPath, 'kubernetes')) ||
        fs.existsSync(path.join(projectPath, 'k8s'))) {
      return { target: 'kubernetes', environment: 'development' };
    }

    return { target: 'custom', environment: 'development' };
  }

  private deploy(projectPath: string, config: DeploymentConfig): { success: boolean; logs: string[]; issues: TaskIssue[]; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const artifacts: string[] = [];

    switch (config.target) {
      case 'docker':
        return this.deployDocker(projectPath, config);
      case 'vercel':
        return this.deployVercel(projectPath, config);
      case 'custom':
        if (config.customCommand) {
          return this.deployCustom(projectPath, config.customCommand);
        }
        logs.push('[DEPLOYER] No deployment target configured');
        logs.push('[DEPLOYER] Build artifacts are ready for manual deployment');
        logs.push('[DEPLOYER] To configure: add deployment section to ag-review.config.json');
        return { success: true, logs, issues, artifacts };
      default:
        logs.push(`[DEPLOYER] Deployment target '${config.target}' - ready for configuration`);
        return { success: true, logs, issues, artifacts };
    }
  }

  private deployDocker(projectPath: string, config: DeploymentConfig): { success: boolean; logs: string[]; issues: TaskIssue[]; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const artifacts: string[] = [];

    logs.push('[DEPLOYER] Building Docker image...');

    try {
      // Docker 사용 가능 확인
      execSync('docker --version', { encoding: 'utf-8', timeout: 10000 });

      const imageName = path.basename(projectPath).toLowerCase();
      const tag = `${imageName}:${config.environment}`;

      execSync(`docker build -t ${tag} .`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 600000,
        maxBuffer: 10 * 1024 * 1024,
      });

      logs.push(`[DEPLOYER] Docker image built: ${tag}`);
      artifacts.push(tag);

      // docker-compose 확인
      if (fs.existsSync(path.join(projectPath, 'docker-compose.yml'))) {
        logs.push('[DEPLOYER] docker-compose.yml found');
        logs.push('[DEPLOYER] Run: docker-compose up -d');
      }

      return { success: true, logs, issues, artifacts };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('not found') || errMsg.includes('command not found')) {
        issues.push(this.createIssue('warning', 'Docker not installed or not running'));
        logs.push('[DEPLOYER] Docker not available - skipping Docker build');
        return { success: true, logs, issues, artifacts };
      }
      issues.push(this.createIssue('error', `Docker build failed: ${errMsg.slice(0, 200)}`));
      return { success: false, logs, issues, artifacts };
    }
  }

  private deployVercel(projectPath: string, _config: DeploymentConfig): { success: boolean; logs: string[]; issues: TaskIssue[]; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const artifacts: string[] = [];

    logs.push('[DEPLOYER] Deploying to Vercel...');

    try {
      execSync('npx vercel --version', { encoding: 'utf-8', timeout: 30000, cwd: projectPath });
      const output = execSync('npx vercel --yes', {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      });
      logs.push('[DEPLOYER] Vercel deploy succeeded');
      logs.push(output.slice(-500));
      return { success: true, logs, issues, artifacts };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      issues.push(this.createIssue('warning', `Vercel deploy: ${errMsg.slice(0, 200)}`));
      logs.push('[DEPLOYER] Vercel CLI not available or not authenticated');
      return { success: true, logs, issues, artifacts };
    }
  }

  private deployCustom(projectPath: string, command: string): { success: boolean; logs: string[]; issues: TaskIssue[]; artifacts: string[] } {
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const artifacts: string[] = [];

    logs.push(`[DEPLOYER] Running custom deploy: ${command}`);

    try {
      const output = execSync(command, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 600000,
        maxBuffer: 10 * 1024 * 1024,
      });
      logs.push('[DEPLOYER] Custom deploy succeeded');
      logs.push(output.slice(-500));
      return { success: true, logs, issues, artifacts };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      issues.push(this.createIssue('error', `Custom deploy failed: ${errMsg.slice(0, 200)}`));
      return { success: false, logs, issues, artifacts };
    }
  }
}
