/**
 * Agent Registry - 서브에이전트 팩토리 및 레지스트리
 */

export { BaseSubAgent } from './base-agent';
export { PlannerAgent } from './planner-agent';
export { CoderAgent } from './coder-agent';
export { ReviewerAgent } from './reviewer-agent';
export { TesterAgent } from './tester-agent';
export { SecurityAgent } from './security-agent';
export { BrowserAgent } from './browser-agent';
export { DeployerAgent } from './deployer-agent';

import { AgentRole, SubAgentConfig } from '../types';
import { BaseSubAgent } from './base-agent';
import { PlannerAgent } from './planner-agent';
import { CoderAgent } from './coder-agent';
import { ReviewerAgent } from './reviewer-agent';
import { TesterAgent } from './tester-agent';
import { SecurityAgent } from './security-agent';
import { BrowserAgent } from './browser-agent';
import { DeployerAgent } from './deployer-agent';

/**
 * 역할별 에이전트를 생성합니다.
 */
export function createAgent(config: SubAgentConfig): BaseSubAgent {
  switch (config.role) {
    case 'planner': return new PlannerAgent(config);
    case 'coder': return new CoderAgent(config);
    case 'reviewer': return new ReviewerAgent(config);
    case 'tester': return new TesterAgent(config);
    case 'security': return new SecurityAgent(config);
    case 'browser': return new BrowserAgent(config);
    case 'deployer': return new DeployerAgent(config);
    default:
      throw new Error(`Unknown agent role: ${config.role}`);
  }
}

/**
 * 기본 에이전트 설정을 생성합니다.
 */
export function createDefaultAgentConfigs(): SubAgentConfig[] {
  const roles: AgentRole[] = ['planner', 'coder', 'reviewer', 'tester', 'security', 'browser', 'deployer'];
  return roles.map((role) => ({
    role,
    concurrency: 1,
    maxRetries: 3,
    timeout: role === 'deployer' ? 600000 : role === 'browser' ? 120000 : 300000,
  }));
}
