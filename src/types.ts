/**
 * 코드리뷰 에이전트 핵심 타입 정의
 */

export type Severity = 'error' | 'warning' | 'info';
export type ReviewStage = 'compile' | 'lint' | 'test';
export type StageStatus = 'pass' | 'fail' | 'skip' | 'running';

export interface ReviewIssue {
  stage: ReviewStage;
  severity: Severity;
  file: string;
  line?: number;
  column?: number;
  message: string;
  rule?: string;
  suggestion?: string;
}

export interface StageResult {
  stage: ReviewStage;
  status: StageStatus;
  issues: ReviewIssue[];
  duration: number; // ms
  summary: string;
}

export interface ReviewReport {
  projectPath: string;
  timestamp: string;
  stages: StageResult[];
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  passed: boolean;
  duration: number; // ms
  fixReport?: FixReport;
  gitBranch?: string;
  changedFiles?: string[];
  insights?: string[];
}

export interface AgentConfig {
  projectPath: string;
  stages: ReviewStage[];
  compileCommand?: string;
  lintCommand?: string;
  testCommand?: string;
  failFast?: boolean;
  verbose?: boolean;
  autoFix?: boolean;
  diffOnly?: boolean;
  baseBranch?: string;
}

export interface FixReport {
  lintFixedCount: number;
  snapshotsUpdated: boolean;
  suggestions: string[];
  duration: number;
}

export const DEFAULT_CONFIG: Partial<AgentConfig> = {
  stages: ['compile', 'lint', 'test'],
  failFast: false,
  verbose: false,
  autoFix: false,
  diffOnly: false,
};
