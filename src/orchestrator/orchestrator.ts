/**
 * Antigravity Orchestrator - 메인 오케스트레이션 엔진
 *
 * 세계 최고의 자율 코딩 팀을 관리합니다.
 * 기획 → 개발 → 리뷰 → 테스트 → 보안 → 브라우저검증 → 배포
 * 전 과정을 자동화하며, 인간 개입을 최소화합니다.
 */

import fs from 'fs';
import path from 'path';
import { OrchestratorConfig, ProjectSpec, PipelineConfig, PipelineState, DEFAULT_PIPELINE_CONFIG } from './types';
import { PipelineEngine } from './pipeline';
import { agWarn } from '../utils/logger';

export class Orchestrator {
  private config: OrchestratorConfig;
  private stateHistory: PipelineState[] = [];

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.ensureStateDir();
  }

  /**
   * 전체 파이프라인을 실행합니다.
   */
  run(): PipelineState {

    const engine = new PipelineEngine(this.config.project, this.config.pipeline);
    const state = engine.run();

    // 로그 출력

    // 상태 저장
    this.saveState(state);
    this.stateHistory.push(state);

    return state;
  }

  /**
   * 특정 phase만 실행합니다.
   */
  runPhase(phases: PipelineConfig['phases']): PipelineState {
    const pipelineConfig = { ...this.config.pipeline, phases };
    const engine = new PipelineEngine(this.config.project, pipelineConfig);
    const state = engine.run();

    this.saveState(state);

    return state;
  }

  /**
   * 이전 실행 이력을 로드합니다.
   */
  loadHistory(): PipelineState[] {
    const historyPath = path.join(this.config.stateDir, 'pipeline-history.json');
    if (!fs.existsSync(historyPath)) return [];

    try {
      const data = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) {
        agWarn('Orchestrator', '히스토리 로드 실패', err);
      }
      return [];
    }
  }

  /**
   * 프로젝트 설정을 로드합니다.
   */
  static loadConfig(projectPath: string): OrchestratorConfig | null {
    const configPath = path.join(projectPath, 'ag-orchestrator.config.json');
    if (!fs.existsSync(configPath)) return null;

    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!raw || typeof raw !== 'object') return null;
      return {
        project: {
          name: raw.name || path.basename(projectPath),
          description: raw.description || '',
          rootPath: projectPath,
          techStack: raw.techStack || { language: 'typescript' },
          requirements: raw.requirements || [],
          deployment: raw.deployment,
          browserTestUrl: raw.browserTestUrl,
        },
        pipeline: { ...DEFAULT_PIPELINE_CONFIG, ...raw.pipeline },
        agents: raw.agents || [],
        stateDir: path.join(projectPath, '.ag-review'),
        logLevel: raw.logLevel || 'info',
        webhookUrl: raw.webhookUrl,
        slackWebhook: raw.slackWebhook,
      };
    } catch (err: unknown) {
      agWarn('Orchestrator', '설정 파일 로드 실패', err);
      return null;
    }
  }

  /**
   * 기본 설정으로 빠르게 시작합니다.
   */
  static quickStart(projectPath: string, description?: string): Orchestrator {
    const projectName = path.basename(projectPath);

    const config: OrchestratorConfig = {
      project: {
        name: projectName,
        description: description || `Auto-detected project: ${projectName}`,
        rootPath: projectPath,
        techStack: detectTechStack(projectPath),
        requirements: [
          {
            id: 'req-1',
            title: 'Full System Review',
            description: 'Analyze, review, test, and secure the entire project',
            priority: 'high',
            type: 'refactor',
          },
        ],
      },
      pipeline: { ...DEFAULT_PIPELINE_CONFIG, humanGates: [] },
      agents: [],
      stateDir: path.join(projectPath, '.ag-review'),
      logLevel: 'info',
    };

    return new Orchestrator(config);
  }

  private ensureStateDir(): void {
    if (!fs.existsSync(this.config.stateDir)) {
      fs.mkdirSync(this.config.stateDir, { recursive: true });
    }
  }

  private saveState(state: PipelineState): void {
    try {
      // 현재 상태 저장
      const statePath = path.join(this.config.stateDir, 'pipeline-state.json');
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

      // 히스토리 추가
      const historyPath = path.join(this.config.stateDir, 'pipeline-history.json');
      const history = this.loadHistory();
      history.push(state);
      // 최대 50개 유지
      const trimmed = history.slice(-50);
      fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2));
    } catch (err: unknown) {
      agWarn('Orchestrator', '파이프라인 상태 저장 실패', err);
    }
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }
}

/**
 * 프로젝트 기술 스택을 자동 감지합니다.
 */
function detectTechStack(projectPath: string): ProjectSpec['techStack'] {
  const exists = (f: string) => fs.existsSync(path.join(projectPath, f));

  let language: ProjectSpec['techStack']['language'] = 'typescript';
  let framework: string | undefined;
  let runtime: string | undefined;
  let packageManager: ProjectSpec['techStack']['packageManager'] = 'npm';

  if (exists('tsconfig.json')) language = 'typescript';
  else if (exists('Cargo.toml')) language = 'rust';
  else if (exists('go.mod')) language = 'go';
  else if (exists('requirements.txt') || exists('setup.py')) language = 'python';
  else if (exists('pom.xml') || exists('build.gradle')) language = 'java';
  else if (exists('package.json')) language = 'javascript';

  if (exists('yarn.lock')) packageManager = 'yarn';
  else if (exists('pnpm-lock.yaml')) packageManager = 'pnpm';

  // 프레임워크 감지
  if (exists('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps.next) framework = 'Next.js';
      else if (allDeps.nuxt) framework = 'Nuxt';
      else if (allDeps.react) framework = 'React';
      else if (allDeps.vue) framework = 'Vue';
      else if (allDeps['@angular/core']) framework = 'Angular';
      else if (allDeps.express) framework = 'Express';
      else if (allDeps['@nestjs/core']) framework = 'NestJS';
      else if (allDeps.fastify) framework = 'Fastify';

      if (allDeps.electron) runtime = 'Electron';
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) {
        agWarn('Orchestrator', '기술 스택 감지 실패', err);
      }
    }
  }

  return { language, framework, runtime, packageManager };
}
