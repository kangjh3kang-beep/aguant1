/**
 * SecurityAgent Tests
 *
 * Covers:
 *  - Basic behavior (getInfo, capabilities)
 *  - executeTask via run() — prompt enhancement, full audit pipeline
 *  - Dependency audit (npm audit via execSync)
 *  - Secret scanning (API keys, tokens, private keys, JWT)
 *  - SAST patterns (eval, innerHTML, SQL injection, etc.)
 *  - Auth pattern analysis (helmet, rate-limit, bcrypt, gitignore)
 *  - AI security analysis (with/without provider)
 *  - .env file not in .gitignore
 *  - Success/failure determination (based on critical count)
 *  - SharedKnowledge integration
 *  - Error handling (unreadable files, parse failures)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');
jest.mock('../prompt-enhancer', () => ({
  PromptEnhancer: jest.fn().mockImplementation(() => ({
    enhance: jest.fn().mockReturnValue({
      systemPrompt: 'sys',
      enhancedDescription: 'enhanced description for reviewer agent testing padded to exceed 120 characters so slice works correctly here and there and more',
      thinkingFramework: '1단계\n2단계\n3단계',
      outputFormat: '',
      qualityChecklist: [],
      fullPrompt: '',
    }),
    expandDescription: jest.fn().mockReturnValue('expanded'),
    buildSystemPrompt: jest.fn().mockReturnValue('system prompt'),
  })),
}));
jest.mock('../shared-knowledge', () => ({
  SharedKnowledgeBase: jest.fn().mockImplementation(() => ({
    addInsight: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    buildContextForAgent: jest.fn().mockReturnValue(''),
  })),
  EventBus: jest.fn().mockImplementation(() => ({
    emit: jest.fn(),
    on: jest.fn(),
  })),
  ContextChain: jest.fn().mockImplementation(() => ({
    buildContextForNextPhase: jest.fn().mockReturnValue(''),
    addPhaseResult: jest.fn(),
  })),
}));
jest.mock('../ai-provider', () => ({
  autoDetectProvider: jest.fn().mockReturnValue(null),
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import { SecurityAgent } from './security-agent';
import { SubAgentConfig, Task, TaskPhase } from '../types';

// ── Helpers ──

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    role: 'security',
    concurrency: 1,
    maxRetries: 2,
    timeout: 60000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-sec-1',
    phase: 'security' as TaskPhase,
    title: 'Security Audit',
    description: 'Perform full security audit',
    assignedAgent: 'security',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function dirent(name: string, isDir: boolean): fs.Dirent {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: '',
    parentPath: '',
  };
}

const PROJECT_PATH = '/test/project';

// ── Tests ──

describe('SecurityAgent', () => {
  let agent: SecurityAgent;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no files, no audit
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('');
    (mockFs.readdirSync as jest.Mock).mockReturnValue([]);
    mockExecSync.mockReturnValue('{}');

    agent = new SecurityAgent(makeConfig());
  });

  // ═══ Basic behavior ═══

  describe('basic behavior', () => {
    it('should return agent info with correct name and role', () => {
      const info = agent.getInfo();
      expect(info.name).toBe('Security Agent');
      expect(info.role).toBe('security');
    });

    it('should have security-related capabilities', () => {
      const info = agent.getInfo();
      expect(info.capabilities).toContain('dependency-audit');
      expect(info.capabilities).toContain('secret-scanning');
      expect(info.capabilities).toContain('sast-analysis');
      expect(info.capabilities).toContain('owasp-top10-full');
      expect(info.capabilities).toContain('injection-detection');
    });

    it('should start in idle status', () => {
      expect(agent.getStatus()).toBe('idle');
    });
  });

  // ═══ executeTask — happy path ═══

  describe('executeTask (via run)', () => {
    it('should succeed when no critical issues found', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(true);
      expect(result.output).toContain('[SECURITY]');
      expect(result.output).toContain('보안 감사 최종 보고');
    });

    it('should include prompt enhancement info in output', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('[SECURITY] ── Prompt Enhancement Applied ──');
      expect(result.output).toContain('강화된 지시');
      expect(result.output).toContain('STRIDE 위협 모델링');
    });

    it('should include OWASP coverage in output', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('OWASP 커버리지');
      expect(result.output).toContain('A01~A10');
    });
  });

  // ═══ Dependency audit ═══

  describe('dependency audit', () => {
    it('should run npm audit when package.json exists', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockExecSync.mockReturnValue(JSON.stringify({
        metadata: { vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0 } },
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('npm audit: 0 vulnerabilities found');
    });

    it('should detect critical vulnerabilities', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockExecSync.mockReturnValue(JSON.stringify({
        metadata: { vulnerabilities: { critical: 3, high: 1, moderate: 2, low: 5 } },
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.severity === 'critical' && i.message.includes('3 critical'))).toBe(true);
      expect(result.issues.some((i) => i.severity === 'error' && i.message.includes('1 high'))).toBe(true);
      expect(result.issues.some((i) => i.severity === 'warning' && i.message.includes('2 moderate'))).toBe(true);
    });

    it('should handle npm audit failure gracefully', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockExecSync.mockImplementation(() => { throw new Error('npm not found'); });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('npm audit not available');
    });

    it('should handle invalid npm audit JSON gracefully', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockExecSync.mockReturnValue('NOT_VALID_JSON{{{');

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('npm audit');
      // Should not crash
      expect(result).toBeDefined();
    });
  });

  // ═══ Secret scanning ═══

  describe('secret scanning', () => {
    it('should detect hardcoded API keys', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('config.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('config.ts')) {
          return 'const api_key = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const secretIssue = result.issues.find((i) => i.message.includes('API key'));
      expect(secretIssue).toBeDefined();
      expect(secretIssue!.severity).toBe('critical');
    });

    it('should detect hardcoded passwords', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('db.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('db.ts')) {
          return 'const password = "SuperSecret123!@#";';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const passIssue = result.issues.find((i) => i.message.includes('secret/password'));
      expect(passIssue).toBeDefined();
      expect(passIssue!.severity).toBe('critical');
    });

    it('should detect AWS access keys', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('aws.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('aws.ts')) {
          return 'const key = "AKIAIOSFODNN7EXAMPLE";';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const awsIssue = result.issues.find((i) => i.message.includes('AWS Access Key'));
      expect(awsIssue).toBeDefined();
    });

    it('should flag .env file not in .gitignore', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, '.env')) return true;
        if (s === path.join(PROJECT_PATH, '.gitignore')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('.gitignore')) return 'node_modules\n';
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const envIssue = result.issues.find((i) => i.message.includes('.env') && i.message.includes('.gitignore'));
      expect(envIssue).toBeDefined();
      expect(envIssue!.severity).toBe('critical');
    });

    it('should skip hidden directories and node_modules', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('.git', true), dirent('node_modules', true), dirent('coverage', true)];
        }
        return [];
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      // No secret issues from skipped directories
      const secretIssues = result.issues.filter((i) =>
        i.message.includes('API key') || i.message.includes('secret'));
      expect(secretIssues).toHaveLength(0);
    });
  });

  // ═══ SAST analysis ═══

  describe('SAST analysis', () => {
    it('should detect eval() usage', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('parser.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('parser.ts')) {
          return 'const result = eval(userInput);';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const evalIssue = result.issues.find((i) => i.message.includes('eval()'));
      expect(evalIssue).toBeDefined();
      expect(evalIssue!.message).toContain('OWASP A03');
    });

    it('should detect innerHTML assignment (XSS)', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('ui.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('ui.ts')) {
          return 'element.innerHTML = userInput;';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const xssIssue = result.issues.find((i) => i.message.includes('innerHTML'));
      expect(xssIssue).toBeDefined();
      expect(xssIssue!.message).toContain('OWASP A07');
    });

    it('should detect Math.random() for crypto use', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('token.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('token.ts')) {
          return 'const token = Math.random().toString(36);';
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const randomIssue = result.issues.find((i) => i.message.includes('Math.random()'));
      expect(randomIssue).toBeDefined();
      expect(randomIssue!.message).toContain('OWASP A02');
    });

    it('should skip test files in SAST scanning', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('parser.test.ts', false)];
        }
        return [];
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const sastIssues = result.issues.filter((i) => i.message.includes('OWASP'));
      expect(sastIssues).toHaveLength(0);
    });

    it('should handle file read errors gracefully in SAST', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('broken.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('broken.ts')) {
          throw new Error('EACCES');
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ Auth pattern analysis ═══

  describe('auth pattern analysis', () => {
    it('should flag missing helmet in Express project', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, 'package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0' },
          });
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('helmet'))).toBe(true);
    });

    it('should flag missing rate limiter', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, 'package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0' },
          });
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('Rate Limiter'))).toBe(true);
    });

    it('should flag missing password hashing when auth is present', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, 'package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0', passport: '^0.6.0' },
          });
        }
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('비밀번호 해싱'))).toBe(true);
    });

    it('should flag missing .gitignore file', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = agent.run(makeTask(), PROJECT_PATH);

      // The .gitignore check only runs inside auditAuthPatterns if gitignorePath exists.
      // If it doesn't exist, it flags "no .gitignore"
      expect(result.issues.some((i) => i.message.includes('.gitignore 파일이 없습니다'))).toBe(true);
    });

    it('should flag missing .env entry in .gitignore', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, '.gitignore')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('.gitignore')) return 'node_modules\ndist\n';
        return '';
      });

      const result = agent.run(makeTask(), PROJECT_PATH);

      const gitignoreIssue = result.issues.find((i) =>
        i.message.includes('.gitignore') && i.message.includes('.env'));
      expect(gitignoreIssue).toBeDefined();
    });
  });

  // ═══ AI security analysis ═══

  describe('AI security analysis', () => {
    it('should skip AI analysis when no AI provider is available', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('AI 프로바이더 없음');
    });

    it('should skip AI analysis when no sensitive files found', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { autoDetectProvider } = require('../ai-provider');
      (autoDetectProvider as jest.Mock).mockReturnValue({ provider: 'claude', apiKey: 'test-key' });

      // No files matching sensitive patterns
      (mockFs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === PROJECT_PATH) {
          return [dirent('readme.ts', false)];
        }
        return [];
      });
      mockFs.readFileSync.mockReturnValue('');

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.output).toContain('보안 민감 파일 없음');
    });
  });

  // ═══ Success/failure determination ═══

  describe('success determination', () => {
    it('should succeed when no critical issues exist', () => {
      const result = agent.run(makeTask(), PROJECT_PATH);

      // Only warning-level missing .gitignore
      expect(result.success).toBe(true);
    });

    it('should fail when critical vulnerabilities are found', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockExecSync.mockReturnValue(JSON.stringify({
        metadata: { vulnerabilities: { critical: 5, high: 0, moderate: 0, low: 0 } },
      }));

      const result = agent.run(makeTask(), PROJECT_PATH);

      expect(result.success).toBe(false);
    });
  });

  // ═══ Error handling ═══

  describe('error handling', () => {
    it('should handle readdirSync errors in scanSecrets', () => {
      (mockFs.readdirSync as jest.Mock).mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = agent.run(makeTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });

    it('should handle package.json parse error in auth audit', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s === path.join(PROJECT_PATH, 'package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('INVALID JSON {{{');

      const result = agent.run(makeTask(), PROJECT_PATH);

      // Should not crash
      expect(result).toBeDefined();
    });
  });

  // ═══ BaseSubAgent integration ═══

  describe('BaseSubAgent integration', () => {
    it('should increment completedTasks on success', () => {
      agent.run(makeTask(), PROJECT_PATH);
      expect(agent.getInfo().completedTasks).toBe(1);
    });

    it('should set status to idle after task completion', () => {
      agent.run(makeTask(), PROJECT_PATH);
      expect(agent.getStatus()).toBe('idle');
    });

    it('should return role as security', () => {
      expect(agent.getRole()).toBe('security');
    });
  });
});
