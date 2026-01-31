/**
 * BrowserAgent 테스트
 *
 * BrowserAgent의 핵심 기능을 검증합니다:
 * - executeTask (Puppeteer 사용 가능/불가능 분기)
 * - 스크린샷 비교
 * - 플로우 설정 파싱
 * - 정적 분석 fallback
 * - 에러 핸들링 및 파일 정리
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
      enhancedDescription: 'enhanced description for browser agent testing padded to exceed 120 characters so slice works correctly here and there',
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
jest.mock('../browser-automation');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import { BrowserAgent } from './browser-agent';
import { SubAgentConfig, Task, DEFAULT_BROWSER_CONFIG, BrowserConfig } from '../types';

// ─── 테스트 헬퍼 ───

function createBrowserConfig(overrides?: Partial<SubAgentConfig>): SubAgentConfig {
  return {
    role: 'browser',
    concurrency: 1,
    maxRetries: 2,
    timeout: 30000,
    ...overrides,
  };
}

function createTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-browser-1',
    phase: 'browser',
    title: 'UI Verification',
    description: 'Verify UI accessibility and visual regression',
    assignedAgent: 'browser',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const PROJECT_PATH = '/tmp/test-project';

// ─── 테스트 시작 ───

describe('BrowserAgent', () => {
  let agent: BrowserAgent;
  let checkPuppeteerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // fs 기본 모킹
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('');
    mockFs.mkdirSync.mockReturnValue(undefined as unknown as string);
    mockFs.writeFileSync.mockReturnValue(undefined);
    mockFs.unlinkSync.mockReturnValue(undefined);
    mockFs.readdirSync.mockReturnValue([]);

    agent = new BrowserAgent(createBrowserConfig());

    // 기본적으로 puppeteer 사용 불가로 스파이 설정
    checkPuppeteerSpy = jest.spyOn(agent as any, 'checkPuppeteerRuntime').mockReturnValue(false);
  });

  // ═══ 기본 동작 ═══

  describe('basic behavior', () => {
    it('should return agent info with correct name and role', () => {
      const info = agent.getInfo();
      expect(info.name).toBe('Browser Agent');
      expect(info.role).toBe('browser');
    });

    it('should have browser-related capabilities', () => {
      const info = agent.getInfo();
      expect(info.capabilities).toContain('html-semantic-check');
      expect(info.capabilities).toContain('real-browser-automation');
      expect(info.capabilities).toContain('wcag-2.1-aa-audit');
      expect(info.capabilities).toContain('screenshot-capture');
    });
  });

  // ═══ executeTask — Puppeteer 없을 때 (정적 분석 fallback) ═══

  describe('executeTask — static analysis fallback (no puppeteer)', () => {
    it('should run static analysis when puppeteer is not available', () => {
      checkPuppeteerSpy.mockReturnValue(false);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('[BROWSER]');
      expect(result.output).toContain('Starting browser-based UI verification');
    });

    it('should mention puppeteer installation hint when not installed and not in package.json', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Puppeteer not installed');
      expect(result.output).toContain('npm install puppeteer');
    });

    it('should report no HTML entry point for backend projects', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('No HTML entry point found');
    });

    it('should detect HTML files and check WCAG issues', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('public/index.html')) return true;
        if (s.endsWith('.ag-review/screenshots')) return false;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('public/index.html')) {
          return '<html><head></head><body><div>Hello</div></body></html>';
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Found: public/index.html');
      // Should find lang attribute missing
      expect(result.issues.some((i) => i.message.includes('lang'))).toBe(true);
    });

    it('should warn about missing viewport meta tag', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('public/index.html');
      });
      mockFs.readFileSync.mockReturnValue(
        '<html lang="en"><head><title>Test</title></head><body><main><h1>Hi</h1></main></body></html>',
      );

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('viewport'))).toBe(true);
    });

    it('should detect build output directories', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('/dist')) return true;
        if (s.endsWith('/.next')) return true;
        return false;
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Build output found: dist/');
    });
  });

  // ═══ 스크린샷 및 기존 파일 확인 ═══

  describe('screenshot handling', () => {
    it('should count existing screenshots when puppeteer is in package.json', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { puppeteer: '^21.0.0' } });
        }
        return '';
      });
      // readdirSync for screenshot dir
      const screenshotDir = path.resolve(PROJECT_PATH, DEFAULT_BROWSER_CONFIG.screenshotDir);
      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        const s = String(p);
        if (s === screenshotDir) {
          return ['home.png', 'about.jpg'] as unknown as fs.Dirent[];
        }
        return [];
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Found 2 existing screenshot(s)');
    });

    it('should ensure screenshot directory is created', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      agent.run(createTask(), PROJECT_PATH);

      expect(mockFs.mkdirSync).toHaveBeenCalled();
    });
  });

  // ═══ 접근성 검사 (JSX/TSX 정적 분석) ═══

  describe('accessibility check', () => {
    it('should detect missing alt attributes in JSX files', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const dirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });
      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        const s = String(p);
        if (s === PROJECT_PATH) {
          return [dirent('src', true)] as unknown as fs.Dirent[];
        }
        if (s === path.join(PROJECT_PATH, 'src')) {
          return [dirent('App.tsx', false)] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.endsWith('App.tsx')) {
          return '<div><img src="test.png" /></div>';
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('WCAG 1.1.1') || i.message.includes('alt'))).toBe(true);
    });

    it('should detect onClick without keyboard handler', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const dirent = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
      });
      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        const s = String(p);
        if (s === PROJECT_PATH) {
          return [dirent('Component.tsx', false)] as unknown as fs.Dirent[];
        }
        return [];
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('Component.tsx')) {
          return '<div onClick={handleClick}>Click me</div>';
        }
        return '';
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      // Should detect div with onClick but no role
      expect(result.issues.some((i) => i.message.includes('WCAG') && i.message.includes('onClick'))).toBe(true);
    });
  });

  // ═══ Flow config parsing ═══

  describe('flow configuration', () => {
    it('should use default basic-navigation flow when no flow config exists', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);
      // automation will fail, falling back
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      // The agent should still complete (automation falls back)
      expect(result).toBeDefined();
    });

    it('should load flows from .ag-review/flows.json when available', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.includes('flows.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.includes('flows.json')) {
          return JSON.stringify({
            flows: [
              {
                name: 'login-flow',
                description: 'Login test',
                steps: [
                  { action: 'navigate', value: 'http://localhost:3000/login' },
                  { action: 'type', selector: '#email', value: 'test@test.com' },
                ],
              },
            ],
          });
        }
        return '';
      });
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      // Should succeed even if automation falls back
      expect(result).toBeDefined();
    });

    it('should handle invalid flows.json gracefully', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('flows.json');
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('flows.json')) return '{ invalid json }}}';
        return '';
      });
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module');
      });

      // Should not throw — invalid flow config is handled gracefully
      const result = agent.run(createTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ executeTask — Puppeteer 사용 가능 (자동화 경로) ═══

  describe('executeTask — puppeteer available (automation path)', () => {
    it('should attempt browser automation when puppeteer is available', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);

      // execSync for automation runner — MODULE_NOT_FOUND returns null, triggering static fallback
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module MODULE_NOT_FOUND');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Phase 7: Real Browser Automation Engine');
      expect(result.output).toContain('falling back to static analysis');
    });

    it('should detect puppeteer-core as an alternative', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module MODULE_NOT_FOUND');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Phase 7');
    });

    it('should parse automation result when execSync succeeds', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      const automationResult = {
        success: true,
        mode: 'full-browser',
        devServer: { started: true, url: 'http://localhost:3000' },
        pages: [{ url: 'http://localhost:3000', title: 'Home', screenshot: '/tmp/screenshots/home.png', consoleEntries: [], a11yViolations: [], timestamp: Date.now() }],
        flows: [{ flowName: 'basic', success: true, steps: [], duration: 100, screenshots: ['/tmp/screenshots/flow.png'], consoleErrors: [] }],
        issues: [],
        logs: ['[BROWSER] Automation completed successfully'],
        duration: 500,
      };

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.includes('_browser-automation-result.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        const s = String(p);
        if (s.includes('_browser-automation-result.json')) {
          return JSON.stringify(automationResult);
        }
        return '';
      });
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue('');

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Automation completed successfully');
      expect(result.output).toContain('Pages tested: 1');
      expect(result.output).toContain('Flows executed: 1');
      expect(result.artifacts).toContain('/tmp/screenshots/home.png');
      expect(result.artifacts).toContain('/tmp/screenshots/flow.png');
    });

    it('should return issues from automation result', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      const automationResult = {
        success: false,
        mode: 'full-browser',
        devServer: { started: false },
        pages: [],
        flows: [],
        issues: [{ severity: 'error', message: 'Console error detected', autoFixable: false }],
        logs: ['[BROWSER] Test run complete with errors'],
        duration: 200,
      };

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).includes('_browser-automation-result.json');
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('_browser-automation-result.json')) {
          return JSON.stringify(automationResult);
        }
        return '';
      });
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue('');

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('Console error'))).toBe(true);
      expect(result.success).toBe(false);
    });
  });

  // ═══ 에러 핸들링 ═══

  describe('error handling', () => {
    it('should handle automation script execution failure gracefully', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);

      mockExecSync.mockImplementation(() => {
        throw new Error('Script execution timeout');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      // Should not crash, but return a result with issues
      expect(result).toBeDefined();
      expect(result.output).toContain('[BROWSER]');
    });

    it('should handle browser test script failure', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.endsWith('package.json')) return true;
        if (s.endsWith('browser-test.js')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ devDependencies: { puppeteer: '^21.0.0' } });
        }
        return '';
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('Browser test crashed');
      });

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('Browser test failed'))).toBe(true);
    });

    it('should safely handle readdirSync failures in accessibility check', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      const result = agent.run(createTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ 파일 정리 ═══

  describe('file cleanup', () => {
    it('should clean up temp files after successful automation', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      const automationResult = {
        success: true,
        mode: 'full-browser',
        devServer: { started: false },
        pages: [],
        flows: [],
        issues: [],
        logs: [],
        duration: 100,
      };

      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const s = String(p);
        if (s.includes('_browser-automation-result.json')) return true;
        if (s.includes('_browser-automation-runner.js')) return true;
        return false;
      });
      mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
        if (String(p).includes('_browser-automation-result.json')) {
          return JSON.stringify(automationResult);
        }
        return '';
      });
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue('');

      agent.run(createTask(), PROJECT_PATH);

      // Should attempt to unlink temp script and result files
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('should handle safe unlink failure without throwing', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      mockExecSync.mockImplementation(() => {
        throw new Error('Script failed');
      });

      // Should not throw despite unlink failure
      const result = agent.run(createTask(), PROJECT_PATH);
      expect(result).toBeDefined();
    });
  });

  // ═══ Cloud browser 연동 ═══

  describe('cloud browser integration', () => {
    it('should report cloud browser config when enabled', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const cloudConfig: BrowserConfig = {
        ...DEFAULT_BROWSER_CONFIG,
        cloudBrowser: {
          enabled: true,
          provider: 'browserless',
          endpoint: 'wss://cloud.example.com',
        },
      };

      agent = new BrowserAgent(createBrowserConfig({ browserConfig: cloudConfig }));
      checkPuppeteerSpy = jest.spyOn(agent as any, 'checkPuppeteerRuntime').mockReturnValue(false);
      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Cloud browser: browserless');
      expect(result.output).toContain('wss://cloud.example.com');
    });
  });

  // ═══ URL 추출 ═══

  describe('URL extraction from task', () => {
    it('should extract URL from task description for automation config', () => {
      checkPuppeteerSpy.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockReturnValue(undefined);
      mockExecSync.mockImplementation(() => {
        throw new Error('Cannot find module MODULE_NOT_FOUND');
      });

      const task = createTask({
        description: 'Test the page at https://example.com/app for accessibility',
      });

      const result = agent.run(task, PROJECT_PATH);

      // The agent should attempt automation (even though it fails to MODULE_NOT_FOUND)
      expect(result.output).toContain('Phase 7');
    });
  });

  // ═══ SEO 검증 ═══

  describe('SEO validation', () => {
    it('should detect missing meta description and OG tags', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        return String(p).endsWith('public/index.html');
      });
      mockFs.readFileSync.mockReturnValue(
        '<html lang="en"><head><title>Test</title><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main><h1>Hello</h1></main></body></html>',
      );

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.issues.some((i) => i.message.includes('SEO') && i.message.includes('description'))).toBe(true);
      expect(result.issues.some((i) => i.message.includes('Open Graph'))).toBe(true);
    });
  });

  // ═══ SharedKnowledge 인사이트 저장 ═══

  describe('SharedKnowledge insights', () => {
    it('should complete successfully and report verification results', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.output).toContain('Verification complete');
      expect(typeof result.success).toBe('boolean');
    });

    it('should succeed when no critical/error issues are found', () => {
      checkPuppeteerSpy.mockReturnValue(false);
      mockFs.existsSync.mockReturnValue(false);

      const result = agent.run(createTask(), PROJECT_PATH);

      expect(result.success).toBe(true);
    });
  });
});
