/**
 * Antigravity Orchestration System - Core Types
 *
 * 세계 최고의 자율 코딩 팀 오케스트레이션 시스템.
 * 기획 → 개발 → 리뷰 → 테스트 → 보안 → 브라우저검증 → 배포 전 과정을 자동화합니다.
 */

// ─── 프로젝트 정의 ────────────────────────────────────────

export interface ProjectSpec {
  /** 프로젝트 이름 */
  name: string;
  /** 프로젝트 설명 */
  description: string;
  /** 프로젝트 루트 경로 */
  rootPath: string;
  /** 기술 스택 */
  techStack: TechStack;
  /** 요구사항 목록 */
  requirements: Requirement[];
  /** 배포 설정 */
  deployment?: DeploymentConfig;
  /** 브라우저 검증 URL */
  browserTestUrl?: string;
}

export interface TechStack {
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';
  framework?: string;
  runtime?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go';
  database?: string;
  extras?: string[];
}

export interface Requirement {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'feature' | 'bugfix' | 'refactor' | 'security' | 'performance' | 'ui';
}

export interface DeploymentConfig {
  target: 'docker' | 'kubernetes' | 'vercel' | 'aws' | 'gcp' | 'azure' | 'custom';
  environment: 'development' | 'staging' | 'production';
  customCommand?: string;
  registry?: string;
}

// ─── 태스크 관리 ──────────────────────────────────────────

export type TaskStatus = 'pending' | 'in_progress' | 'review' | 'completed' | 'failed' | 'blocked';
export type TaskPhase = 'plan' | 'code' | 'review' | 'test' | 'security' | 'browser' | 'deploy';

export interface Task {
  id: string;
  phase: TaskPhase;
  title: string;
  description: string;
  assignedAgent: string;
  status: TaskStatus;
  dependencies: string[];
  files: string[];
  result?: TaskResult;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskResult {
  success: boolean;
  output: string;
  artifacts: string[];
  issues: TaskIssue[];
  duration: number;
  metrics?: Record<string, number>;
}

export interface TaskIssue {
  severity: 'critical' | 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
  autoFixable: boolean;
}

// ─── 서브에이전트 ─────────────────────────────────────────

export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester' | 'security' | 'browser' | 'deployer';
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'error' | 'offline';

export interface SubAgentInfo {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  capabilities: string[];
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  avgDuration: number;
}

export interface SubAgentConfig {
  role: AgentRole;
  /** 외부 AI API 키 (Claude, OpenAI 등) */
  aiProvider?: AIProviderConfig;
  /** 브라우저 에이전트 전용: 스크린샷 설정 */
  browserConfig?: BrowserConfig;
  /** 최대 동시 작업 수 */
  concurrency: number;
  /** 재시도 횟수 */
  maxRetries: number;
  /** 타임아웃 (ms) */
  timeout: number;
}

export interface AIProviderConfig {
  provider: 'claude' | 'openai' | 'local' | 'custom';
  apiKey?: string;
  model?: string;
  endpoint?: string;
  maxTokens?: number;
}

export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  screenshotDir: string;
  baseUrl?: string;
  waitTimeout: number;
  /** 클라우드 브라우저 사용 (예: claude.ai/computer-use) */
  cloudBrowser?: {
    enabled: boolean;
    provider: string;
    endpoint: string;
  };
}

// ─── 파이프라인 ───────────────────────────────────────────

export type PipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface PipelineConfig {
  /** 파이프라인 단계 순서 */
  phases: TaskPhase[];
  /** 자동 수정 허용 */
  autoFix: boolean;
  /** 실패 시 중단 */
  failFast: boolean;
  /** 인간 개입 필요 시점 */
  humanGates: TaskPhase[];
  /** 최대 반복 횟수 (리뷰 → 수정 루프) */
  maxIterations: number;
  /** 병렬 실행 허용 */
  parallel: boolean;
}

export interface PipelineState {
  id: string;
  project: ProjectSpec;
  config: PipelineConfig;
  status: PipelineStatus;
  currentPhase: TaskPhase;
  iteration: number;
  tasks: Task[];
  agents: SubAgentInfo[];
  startedAt: string;
  completedAt?: string;
  logs: PipelineLog[];
}

export interface PipelineLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  agent?: string;
  phase?: TaskPhase;
  message: string;
}

// ─── 오케스트레이터 설정 ──────────────────────────────────

export interface OrchestratorConfig {
  project: ProjectSpec;
  pipeline: PipelineConfig;
  agents: SubAgentConfig[];
  /** 상태 저장 경로 */
  stateDir: string;
  /** 로그 수준 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 웹훅 알림 URL */
  webhookUrl?: string;
  /** Slack 알림 */
  slackWebhook?: string;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  phases: ['plan', 'code', 'review', 'test', 'security', 'browser', 'deploy'],
  autoFix: true,
  failFast: false,
  humanGates: [],
  maxIterations: 3,
  parallel: true,
};

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  headless: true,
  viewport: { width: 1920, height: 1080 },
  screenshotDir: '.ag-review/screenshots',
  waitTimeout: 30000,
};
