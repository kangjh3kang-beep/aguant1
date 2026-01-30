/**
 * @antigravity/code-review-agent
 *
 * 자율 코딩 팀 오케스트레이션 시스템.
 * 코드리뷰 에이전트 + 7개 서브에이전트 파이프라인으로
 * 기획 → 개발 → 리뷰 → 테스트 → 보안 → 브라우저검증 → 배포 전 과정을 자동화합니다.
 */

// ─── Orchestration System ────────────────────────────────
export { Orchestrator } from './orchestrator';
export { PipelineEngine, createAgent, createDefaultAgentConfigs } from './orchestrator';
export { BaseSubAgent, PlannerAgent, CoderAgent, ReviewerAgent, TesterAgent, SecurityAgent, BrowserAgent, DeployerAgent } from './orchestrator';
export type { ProjectSpec, TaskPhase, PipelineConfig, PipelineState, OrchestratorConfig, SubAgentConfig } from './orchestrator';

// ─── Code Review Agent ──────────────────────────────────

export { CodeReviewAgent } from './agent';
export { generateReport, formatReportAsText, formatReportAsJson } from './report-generator';
export { analyzeCompile, parseCompileOutput } from './analyzers/compile-analyzer';
export { analyzeLint, parseLintOutput, parseLintTextOutput } from './analyzers/lint-analyzer';
export { analyzeTest, parseTestOutput, parseTestTextOutput } from './analyzers/test-analyzer';
export { autoFixLint, suggestCompileFixes, updateTestSnapshots } from './analyzers/auto-fixer';
export { loadConfig, validateConfig, findConfigFile } from './utils/config-loader';
export { getChangedFiles, filterByExtension, getCurrentBranch, isGitRepo } from './utils/git-diff';
export { runProcess, validateCommand, validateProjectPath } from './utils/process-runner';
export {
  loadHistory,
  saveToHistory,
  compareWithPrevious,
  analyzeTrend,
  formatTrendReport,
} from './utils/review-history';
export type { HistoryEntry, ReviewHistory, TrendAnalysis } from './utils/review-history';
export {
  ReviewIssue,
  ReviewReport,
  StageResult,
  AgentConfig,
  FixReport,
  Severity,
  ReviewStage,
  StageStatus,
  DEFAULT_CONFIG,
} from './types';
