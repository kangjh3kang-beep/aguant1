/**
 * Antigravity Orchestration System
 *
 * 세계 최고의 자율 코딩 팀 오케스트레이션.
 * 기획 → 개발 → 리뷰 → 테스트 → 보안 → 브라우저검증 → 배포
 *
 * ━━━ Phase 1: 에이전트 간 지능 공유 ━━━
 *  SharedKnowledgeBase + EventBus + ContextChain
 *
 * ━━━ Phase 2: 적응형 자기학습 ━━━
 *  AdaptiveEngine + FailurePatternDB + StrategySelector
 *
 * ━━━ Phase 3: 코드 생성 자동 검증 ━━━
 *  CodeGenV2 + CodeValidator + FallbackChain + TestFirstPipeline
 *
 * ━━━ Phase 4: 프로그래매틱 코드 변환 ━━━
 *  CodeTransformer (패턴 기반 소스 코드 직접 수정)
 *
 * ━━━ Phase 4.5: AST 기반 코드 변환 ━━━
 *  ASTTransformer (TypeScript Compiler API 기반 정밀 변환)
 *
 * ━━━ Phase 5: 직접 패치 기반 자동 수정 ━━━
 *  DirectFeedbackPipeline + PatchGenerator + PatchApplicator + PatchValidator
 *
 * ━━━ Phase 7: 실제 브라우저 자동화 ━━━
 *  BrowserAutomation + DevServerManager + BrowserSession + PageInteractor
 *  ScreenshotEngine + ConsoleMonitor + PerformanceAnalyzer + A11yAuditor + FlowRunner
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
export { PromptEnhancer } from './prompt-enhancer';
export type { EnhancedPrompt, PromptQualityScore } from './prompt-enhancer';
export { AutonomousLoop, DEFAULT_AUTONOMOUS_CONFIG } from './autonomous-loop';
export type { AutonomousConfig, AgentFeedback, LoopState, LoopSummary, FixAttempt, SystemAnalysis, RootCause } from './autonomous-loop';

// Phase 1: 에이전트 간 지능 공유 시스템
export { SharedKnowledgeBase, EventBus, ContextChain } from './shared-knowledge';
export type { Insight, InsightCategory, InsightSeverity, AgentEvent, EventType, PhaseContext } from './shared-knowledge';

// Phase 2: 적응형 자기학습 엔진
export { AdaptiveEngine, FailurePatternDB, StrategySelector } from './adaptive-engine';
export type { FailurePattern, FailureCategory, FixStrategy, StrategyAttempt, LearningReport } from './adaptive-engine';

// Phase 3: 코드 생성 자동 검증
export { CodeGenV2, CodeValidator, FallbackChain, TestFirstPipeline, CodeQualityGate, DEFAULT_CODEGEN_V2_CONFIG } from './code-gen-v2';
export type { ValidationResult, QualityMetrics, GenerationAttempt, CodeGenV2Result, CodeGenV2Config } from './code-gen-v2';

// Phase 4: 프로그래매틱 코드 변환
export { CodeTransformer } from './code-transformer';
export type { TransformResult, TransformChange, TransformType, LinePatch } from './code-transformer';

// Phase 4.5: AST 기반 코드 변환 (TypeScript Compiler API)
export { ASTTransformer } from './ast-transformer';
export type { ASTTransformResult, ASTChange, ASTTransformType } from './ast-transformer';

// Phase 5: 직접 패치 기반 자동 수정
export { DirectFeedbackPipeline, PatchGenerator, PatchApplicator, PatchValidator, FeedbackRouter } from './direct-feedback-pipeline';
export type { Patch, PatchResult, PipelineResult as DirectPatchPipelineResult } from './direct-feedback-pipeline';

// Phase 7: 실제 브라우저 자동화
export {
  BrowserAutomation,
  DevServerManager,
  BrowserSession,
  PageInteractor,
  ScreenshotEngine,
  ConsoleMonitor,
  PerformanceAnalyzer,
  A11yAuditor,
  FlowRunner,
  DEFAULT_AUTOMATION_CONFIG,
} from './browser-automation';
export type {
  BrowserAutomationConfig,
  BrowserAutomationResult,
  UserFlow,
  FlowStep,
  FlowResult,
  StepResult,
  PageSnapshot,
  ConsoleEntry,
  PerformanceMetrics,
  A11yViolation,
} from './browser-automation';

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
