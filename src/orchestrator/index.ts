/**
 * Antigravity Orchestration System
 *
 * 세계 최고의 자율 코딩 팀 오케스트레이션.
 * 기획 → 개발 → 리뷰 → 테스트 → 보안 → 브라우저검증 → 배포
 */

export { Orchestrator } from './orchestrator';
export { PipelineEngine } from './pipeline';
export { decomposeProject, getReadyTasks, isPhaseComplete, hasPhaseFailure, getProgress } from './task-manager';
export { createAgent, createDefaultAgentConfigs } from './sub-agents';
export { BaseSubAgent } from './sub-agents/base-agent';
export { PlannerAgent } from './sub-agents/planner-agent';
export { CoderAgent } from './sub-agents/coder-agent';
export { ReviewerAgent } from './sub-agents/reviewer-agent';
export { TesterAgent } from './sub-agents/tester-agent';
export { SecurityAgent } from './sub-agents/security-agent';
export { BrowserAgent } from './sub-agents/browser-agent';
export { DeployerAgent } from './sub-agents/deployer-agent';
export { generateCode, autoDetectProvider, loadAPIKeysFromEnv, extractCode } from './ai-provider';
export type { AICodeRequest, AICodeResponse } from './ai-provider';
export { AutonomousLoop, DEFAULT_AUTONOMOUS_CONFIG } from './autonomous-loop';
export type { AutonomousConfig, AgentFeedback, LoopState, LoopSummary, FixAttempt } from './autonomous-loop';

export type {
  ProjectSpec,
  TechStack,
  Requirement,
  DeploymentConfig,
  Task,
  TaskResult,
  TaskIssue,
  TaskStatus,
  TaskPhase,
  SubAgentInfo,
  SubAgentConfig,
  AgentRole,
  AIProviderConfig,
  BrowserConfig,
  PipelineConfig,
  PipelineState,
  PipelineLog,
  OrchestratorConfig,
} from './types';
