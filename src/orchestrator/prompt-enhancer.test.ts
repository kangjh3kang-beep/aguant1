import { PromptEnhancer, EnhancedPrompt, PromptQualityScore } from './prompt-enhancer';
import { Task, TaskPhase } from './types';
import type { AgentRole } from './types';

const ALL_ROLES: AgentRole[] = ['planner', 'coder', 'reviewer', 'tester', 'security', 'browser', 'deployer'];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    phase: 'review' as TaskPhase,
    title: 'Code Review',
    description: 'Review code',
    assignedAgent: 'reviewer',
    status: 'pending' as const,
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('PromptEnhancer', () => {
  let enhancer: PromptEnhancer;

  beforeEach(() => {
    enhancer = new PromptEnhancer();
  });

  // ─── enhance() ───────────────────────────────────────────

  describe('enhance()', () => {
    it('should return all required EnhancedPrompt fields for each role', () => {
      for (const role of ALL_ROLES) {
        const task = makeTask({ assignedAgent: role });
        const result: EnhancedPrompt = enhancer.enhance(role, task);

        expect(result.systemPrompt).toBeDefined();
        expect(typeof result.systemPrompt).toBe('string');
        expect(result.systemPrompt.length).toBeGreaterThan(0);

        expect(result.enhancedDescription).toBeDefined();
        expect(typeof result.enhancedDescription).toBe('string');
        expect(result.enhancedDescription.length).toBeGreaterThan(0);

        expect(result.thinkingFramework).toBeDefined();
        expect(typeof result.thinkingFramework).toBe('string');
        expect(result.thinkingFramework.length).toBeGreaterThan(0);

        expect(result.outputFormat).toBeDefined();
        expect(typeof result.outputFormat).toBe('string');
        expect(result.outputFormat.length).toBeGreaterThan(0);

        expect(Array.isArray(result.qualityChecklist)).toBe(true);
        expect(result.qualityChecklist.length).toBeGreaterThan(0);

        expect(result.fullPrompt).toBeDefined();
        expect(typeof result.fullPrompt).toBe('string');
        expect(result.fullPrompt.length).toBeGreaterThan(0);
      }
    });

    it('should include systemPrompt and enhanced description in fullPrompt', () => {
      const task = makeTask();
      const result = enhancer.enhance('reviewer', task);

      expect(result.fullPrompt).toContain(result.systemPrompt);
      // fullPrompt assembles the description with a "## 태스크:" prefix
      expect(result.fullPrompt).toContain(task.title);
    });

    it('should include thinking framework and output format in fullPrompt', () => {
      const task = makeTask({ description: 'Implement the feature', assignedAgent: 'coder' });
      const result = enhancer.enhance('coder', task);

      expect(result.fullPrompt).toContain(result.thinkingFramework);
      expect(result.fullPrompt).toContain(result.outputFormat);
    });

    it('should include quality checklist items in fullPrompt', () => {
      const task = makeTask();
      const result = enhancer.enhance('reviewer', task);

      for (const item of result.qualityChecklist) {
        expect(result.fullPrompt).toContain(item);
      }
    });
  });

  // ─── buildSystemPrompt() ─────────────────────────────────

  describe('buildSystemPrompt()', () => {
    it('should return a non-empty string for every role', () => {
      for (const role of ALL_ROLES) {
        const prompt = enhancer.buildSystemPrompt(role);
        expect(prompt.length).toBeGreaterThan(0);
      }
    });

    it('should produce different prompts for different roles', () => {
      const prompts = ALL_ROLES.map((role) => enhancer.buildSystemPrompt(role));
      const uniquePrompts = new Set(prompts);
      expect(uniquePrompts.size).toBe(ALL_ROLES.length);
    });

    it('should contain the role persona title and principles', () => {
      const prompt = enhancer.buildSystemPrompt('security');
      // The security persona title contains "CISO"
      expect(prompt).toContain('CISO');
      expect(prompt).toContain('핵심 원칙');
      expect(prompt).toContain('안티패턴');
    });
  });

  // ─── expandDescription() ─────────────────────────────────

  describe('expandDescription()', () => {
    it('should expand a short description with role-specific content', () => {
      const expanded = enhancer.expandDescription('reviewer', 'Review code');
      // Short descriptions (< 50 chars) get the default expansion format
      expect(expanded).toContain('[원본 요청]');
      expect(expanded).toContain('Review code');
      expect(expanded.length).toBeGreaterThan('Review code'.length);
    });

    it('should match keywords and trigger specific expansion for reviewer role', () => {
      const expanded = enhancer.expandDescription('reviewer', 'review the code');
      // "review" keyword should match the reviewer expansion rule
      expect(expanded).toContain('코드 스멜');
    });

    it('should match keywords and trigger specific expansion for security role', () => {
      const expanded = enhancer.expandDescription('security', 'Run security audit');
      // "security" keyword should match the security expansion rule
      expect(expanded).toContain('OWASP');
    });

    it('should use default expansion when no keywords match', () => {
      const expanded = enhancer.expandDescription('coder', 'Do something unique');
      // No keyword match -> default expansion for coder
      expect(expanded).toContain('Clean Code');
      expect(expanded).toContain('SOLID');
    });

    it('should preserve long descriptions (>100 chars) and append expert reinforcement', () => {
      const longDesc = 'Please review the entire codebase thoroughly, ' +
        'checking every module for correctness, performance issues, ' +
        'and potential security vulnerabilities in all endpoints';
      const expanded = enhancer.expandDescription('reviewer', longDesc);
      // Long descriptions with keyword match get "전문가 보강 지시"
      expect(expanded).toContain(longDesc);
      expect(expanded).toContain('전문가 보강 지시');
    });
  });

  // ─── buildThinkingFramework() ────────────────────────────

  describe('buildThinkingFramework()', () => {
    it('should return structured thinking steps for each role', () => {
      for (const role of ALL_ROLES) {
        const framework = enhancer.buildThinkingFramework(role);
        expect(framework).toContain('사고 프레임워크');
        // Should contain numbered steps (1단계, 2단계, etc.)
        expect(framework).toContain('1단계');
        expect(framework).toContain('2단계');
      }
    });

    it('should contain at least 5 steps per role', () => {
      for (const role of ALL_ROLES) {
        const framework = enhancer.buildThinkingFramework(role);
        // Count occurrences of "단계" (step marker)
        const stepMatches = framework.match(/\d단계/g);
        expect(stepMatches).not.toBeNull();
        expect(stepMatches!.length).toBeGreaterThanOrEqual(5);
      }
    });
  });

  // ─── buildOutputFormat() ─────────────────────────────────

  describe('buildOutputFormat()', () => {
    it('should return format guidelines for each role', () => {
      for (const role of ALL_ROLES) {
        const format = enhancer.buildOutputFormat(role);
        expect(format.length).toBeGreaterThan(0);
        expect(format).toContain('출력 형식 가이드');
      }
    });

    it('should return role-specific format content', () => {
      const securityFormat = enhancer.buildOutputFormat('security');
      expect(securityFormat).toContain('OWASP');
      expect(securityFormat).toContain('CWE');

      const deployerFormat = enhancer.buildOutputFormat('deployer');
      expect(deployerFormat).toContain('롤백');
    });
  });

  // ─── getQualityChecklist() ───────────────────────────────

  describe('getQualityChecklist()', () => {
    it('should return an array of checklist items for each role', () => {
      for (const role of ALL_ROLES) {
        const checklist = enhancer.getQualityChecklist(role);
        expect(Array.isArray(checklist)).toBe(true);
        expect(checklist.length).toBeGreaterThanOrEqual(5);
        for (const item of checklist) {
          expect(typeof item).toBe('string');
          expect(item.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ─── scoreQuality() ─────────────────────────────────────

  describe('scoreQuality()', () => {
    it('should give a low score for an empty string', () => {
      const result: PromptQualityScore = enhancer.scoreQuality('');
      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.breakdown.specificity).toBeLessThanOrEqual(5);
      expect(result.breakdown.context).toBe(0);
      expect(result.breakdown.constraints).toBe(0);
      expect(result.breakdown.format).toBe(0);
      expect(result.breakdown.expertise).toBe(0);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should give a higher score for a detailed prompt', () => {
      const detailed = [
        '프로젝트 소스 코드 파일을 분석하여 OWASP Top 10 기준으로 보안 감사를 수행하세요.',
        '반드시 모든 엔드포인트에서 인젝션(SQL, XSS) 취약점을 검사하고,',
        '결과를 심각도별로 분류하여 JSON 형식으로 출력하세요.',
        'TypeScript strict 모드와 SOLID 원칙을 준수하며,',
        'Clean Code 기준으로 코드 품질도 함께 평가하세요.',
        'SAST 분석과 coverage 리포트를 포함하고,',
        '최소 80% 이상의 브랜치 커버리지를 목표로 하세요.',
        'Docker 컨테이너 보안과 CI/CD 파이프라인 설정도 확인하세요.',
      ].join(' ');
      const emptyResult = enhancer.scoreQuality('');
      const detailedResult = enhancer.scoreQuality(detailed);

      expect(detailedResult.score).toBeGreaterThan(emptyResult.score);
      expect(detailedResult.score).toBeGreaterThanOrEqual(40);
    });

    it('should provide suggestions for low-scoring areas', () => {
      // A prompt with no context, no constraints, no format, no expertise keywords
      const vague = 'do something with the stuff';
      const result = enhancer.scoreQuality(vague);

      // Should have multiple suggestions since it lacks many quality dimensions
      expect(result.suggestions.length).toBeGreaterThanOrEqual(3);
    });

    it('should return breakdown scores that sum to the total score', () => {
      const prompt = '프로젝트 파일을 분석하여 반드시 보고서를 출력 형식으로 작성하세요. OWASP SOLID TypeScript strict';
      const result = enhancer.scoreQuality(prompt);
      const { specificity, context, constraints, format, expertise } = result.breakdown;

      expect(result.score).toBe(specificity + context + constraints + format + expertise);
    });

    it('should cap each breakdown dimension at 20', () => {
      // Craft a prompt that heavily hits all keyword patterns
      const maxPrompt = [
        // Lots of words for specificity
        ...Array(50).fill('파일 경로 프로젝트 소스 코드베이스'),
        // context keywords
        '파일 파일명 경로 프로젝트 디렉토리 소스 코드베이스 기존 현재 path file src project',
        // constraint keywords
        '반드시 필수 금지 하지마 않도록 주의 제한 최대 최소 이내 이상 must should must not avoid limit',
        // format keywords
        '형식 포맷 출력 결과 보고 리포트 JSON 마크다운 목록 표 분류 format output report list table',
        // expertise keywords
        'SOLID Clean Code OWASP WCAG DDD CQRS SRP OCP DIP TDD BDD CI/CD Docker K8s TypeScript strict coverage lint SAST XSS 인젝션 injection',
      ].join(' ');
      const result = enhancer.scoreQuality(maxPrompt);

      expect(result.breakdown.specificity).toBeLessThanOrEqual(20);
      expect(result.breakdown.context).toBeLessThanOrEqual(20);
      expect(result.breakdown.constraints).toBeLessThanOrEqual(20);
      expect(result.breakdown.format).toBeLessThanOrEqual(20);
      expect(result.breakdown.expertise).toBeLessThanOrEqual(20);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
