/**
 * Browser Automation Engine -- Unit Tests
 *
 * Puppeteer is an optional dynamic require, so we do NOT mock it.
 * Instead we test the logic that works without a real browser:
 *   - DevServerManager: port detection, dev command detection
 *   - BrowserAutomation constructor / config merging
 *   - ScreenshotEngine file operations (via mocked fs)
 *   - PerformanceAnalyzer.toIssues threshold logic
 *   - A11yAuditor.toIssues mapping
 *   - ConsoleMonitor.toIssues mapping
 *   - BrowserAutomation.run() graceful degradation (puppeteer unavailable)
 */

jest.mock('fs');
jest.mock('child_process');

import fs from 'fs';
import { execSync } from 'child_process';

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

import {
  DevServerManager,
  BrowserAutomation,
  BrowserAutomationConfig,
  ScreenshotEngine,
  PerformanceAnalyzer,
  A11yAuditor,
  ConsoleMonitor,
  DEFAULT_AUTOMATION_CONFIG,
  PerformanceMetrics,
  A11yViolation,
} from './browser-automation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<BrowserAutomationConfig> = {}): BrowserAutomationConfig {
  return { ...DEFAULT_AUTOMATION_CONFIG, ...overrides };
}

const nullMetrics: PerformanceMetrics = {
  lcp: null,
  fid: null,
  cls: null,
  ttfb: null,
  fcp: null,
  domContentLoaded: null,
  loadEvent: null,
  resourceCount: 0,
  totalTransferSize: 0,
};

// ---------------------------------------------------------------------------
// DevServerManager
// ---------------------------------------------------------------------------

describe('DevServerManager', () => {
  const projectPath = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('port detection', () => {
    it('returns already-started when the port is already in use', () => {
      // isPortInUse calls execSync -- if it does NOT throw, port is in use
      mockExecSync.mockReturnValueOnce(Buffer.from('12345'));

      const mgr = new DevServerManager(projectPath, makeConfig({ devServerPort: 4000 }));
      const result = mgr.start();

      expect(result.started).toBe(true);
      expect(result.url).toBe('http://localhost:4000');
      expect(result.logs.some((l) => l.includes('already in use'))).toBe(true);
    });

    it('uses default port 3000 when devServerPort is not set', () => {
      // Port check: port is in use
      mockExecSync.mockReturnValueOnce(Buffer.from('99'));

      const mgr = new DevServerManager(projectPath, makeConfig({ devServerPort: undefined }));
      const result = mgr.start();

      expect(result.url).toBe('http://localhost:3000');
    });
  });

  describe('dev command detection', () => {
    it('detects "npm run dev" from package.json scripts.dev', () => {
      // isPortInUse -> throws (port not in use)
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        scripts: { dev: 'vite', start: 'node server.js' },
      }));

      const mgr = new DevServerManager(projectPath, makeConfig());
      const result = mgr.start();

      // Command was detected but spawn will fail in test env -- that is fine
      // We verify the detected command was logged
      expect(result.logs.some((l) => l.includes('npm run dev'))).toBe(true);
    });

    it('detects "npm start" when only scripts.start exists', () => {
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        scripts: { start: 'react-scripts start' },
      }));

      const mgr = new DevServerManager(projectPath, makeConfig());
      const result = mgr.start();

      expect(result.logs.some((l) => l.includes('npm start'))).toBe(true);
    });

    it('detects "npm run serve" when only scripts.serve exists', () => {
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).endsWith('package.json')) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({
        scripts: { serve: 'vue-cli-service serve' },
      }));

      const mgr = new DevServerManager(projectPath, makeConfig());
      const result = mgr.start();

      expect(result.logs.some((l) => l.includes('npm run serve'))).toBe(true);
    });

    it('detects Python manage.py project', () => {
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });
      mockFs.existsSync.mockImplementation((p) => {
        if (String(p).endsWith('manage.py')) return true;
        return false;
      });

      const mgr = new DevServerManager(projectPath, makeConfig());
      const result = mgr.start();

      expect(result.logs.some((l) => l.includes('python manage.py runserver'))).toBe(true);
    });

    it('returns no command when nothing is detected', () => {
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });
      mockFs.existsSync.mockReturnValue(false);

      const mgr = new DevServerManager(projectPath, makeConfig());
      const result = mgr.start();

      expect(result.started).toBe(false);
      expect(result.command).toBeNull();
      expect(result.logs.some((l) => l.includes('No dev server command found'))).toBe(true);
    });
  });

  describe('baseUrl configuration', () => {
    it('uses configured baseUrl without starting a server', () => {
      // isPortInUse -> throws (port not in use)
      mockExecSync.mockImplementation(() => { throw new Error('no port'); });

      const mgr = new DevServerManager(projectPath, makeConfig({ baseUrl: 'https://staging.example.com' }));
      const result = mgr.start();

      expect(result.started).toBe(true);
      expect(result.url).toBe('https://staging.example.com');
      expect(result.command).toBeNull();
    });
  });

  describe('stop', () => {
    it('can be called safely even when no process is running', () => {
      const mgr = new DevServerManager(projectPath, makeConfig());
      expect(() => mgr.stop()).not.toThrow();
    });

    it('getUrl returns null before start', () => {
      const mgr = new DevServerManager(projectPath, makeConfig());
      expect(mgr.getUrl()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// BrowserAutomation -- constructor & config
// ---------------------------------------------------------------------------

describe('BrowserAutomation', () => {
  const projectPath = '/test/project';

  beforeEach(() => {
    jest.clearAllMocks();
    // ScreenshotEngine constructor calls mkdirSync via fs
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);
  });

  it('merges user config with defaults', () => {
    const ba = new BrowserAutomation(projectPath, {
      headless: false,
      devServerPort: 8080,
      a11yEnabled: false,
    });

    // sub-components should be accessible
    expect(ba.getDevServer()).toBeInstanceOf(DevServerManager);
    expect(ba.getPerformanceAnalyzer()).toBeInstanceOf(PerformanceAnalyzer);
    expect(ba.getA11yAuditor()).toBeInstanceOf(A11yAuditor);
    expect(ba.getConsoleMonitor()).toBeInstanceOf(ConsoleMonitor);
  });

  it('uses default config when no overrides given', () => {
    const ba = new BrowserAutomation(projectPath);
    expect(ba.getInteractor()).toBeDefined();
    expect(ba.getScreenshotEngine()).toBeInstanceOf(ScreenshotEngine);
    expect(ba.getFlowRunner()).toBeDefined();
    expect(ba.getSession()).toBeDefined();
  });

  it('run() falls back to static-analysis mode when puppeteer is unavailable', async () => {
    const ba = new BrowserAutomation(projectPath);
    const result = await ba.run();

    // puppeteer is not installed in test environment
    expect(result.mode).toBe('static-analysis');
    expect(result.success).toBe(true);
    expect(result.pages).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.logs.some((l) => l.includes('Puppeteer not available'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ScreenshotEngine -- file operations
// ---------------------------------------------------------------------------

describe('ScreenshotEngine', () => {
  const dir = '/tmp/screenshots';

  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
  });

  it('creates the screenshot directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockReturnValue(undefined);

    new ScreenshotEngine(dir);

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });
  });

  it('does not create the directory if it already exists', () => {
    mockFs.existsSync.mockReturnValue(true);

    new ScreenshotEngine(dir);

    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  describe('compare', () => {
    it('reports baseline not found when baseline does not exist', () => {
      mockFs.existsSync.mockImplementation((p) => String(p) !== '/base.png');
      const engine = new ScreenshotEngine(dir);
      const result = engine.compare('/base.png', '/current.png');

      expect(result.identical).toBe(false);
      expect(result.diffPercent).toBe(-1);
      expect(result.diffDetails).toContain('Baseline not found');
    });

    it('reports current not found when current screenshot does not exist', () => {
      mockFs.existsSync.mockImplementation((p) => String(p) !== '/current.png');
      const engine = new ScreenshotEngine(dir);
      const result = engine.compare('/base.png', '/current.png');

      expect(result.identical).toBe(false);
      expect(result.diffPercent).toBe(-1);
      expect(result.diffDetails).toContain('Current not found');
    });

    it('reports identical when buffers are equal', () => {
      mockFs.existsSync.mockReturnValue(true);
      const buf = Buffer.from([1, 2, 3, 4]);
      mockFs.readFileSync.mockReturnValue(buf);

      const engine = new ScreenshotEngine(dir);
      const result = engine.compare('/a.png', '/b.png');

      expect(result.identical).toBe(true);
      expect(result.diffPercent).toBe(0);
    });

    it('calculates diff percentage for different buffers', () => {
      mockFs.existsSync.mockReturnValue(true);
      const buf1 = Buffer.from([1, 2, 3, 4]);
      const buf2 = Buffer.from([1, 2, 99, 4]);
      mockFs.readFileSync
        .mockReturnValueOnce(buf1)
        .mockReturnValueOnce(buf2);

      const engine = new ScreenshotEngine(dir);
      const result = engine.compare('/a.png', '/b.png');

      expect(result.identical).toBe(false);
      expect(result.diffPercent).toBeGreaterThan(0);
      expect(result.diffDetails).toContain('Byte diff');
    });
  });

  describe('listBaselines', () => {
    it('returns only image files from the directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as jest.Mock).mockReturnValue([
        'shot1.png',
        'shot2.jpg',
        'readme.txt',
        'photo.jpeg',
        'data.json',
      ]);

      const engine = new ScreenshotEngine(dir);
      const baselines = engine.listBaselines();

      expect(baselines).toHaveLength(3);
      expect(baselines).toContain('/tmp/screenshots/shot1.png');
      expect(baselines).toContain('/tmp/screenshots/shot2.jpg');
      expect(baselines).toContain('/tmp/screenshots/photo.jpeg');
    });

    it('returns empty array when directory read fails', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });

      const engine = new ScreenshotEngine(dir);
      const baselines = engine.listBaselines();

      expect(baselines).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// PerformanceAnalyzer -- toIssues threshold logic
// ---------------------------------------------------------------------------

describe('PerformanceAnalyzer', () => {
  let analyzer: PerformanceAnalyzer;

  beforeEach(() => {
    analyzer = new PerformanceAnalyzer();
  });

  it('returns no issues when all metrics are null', () => {
    const issues = analyzer.toIssues(nullMetrics, 'http://localhost:3000');
    expect(issues).toEqual([]);
  });

  it('flags LCP > 4000 as error', () => {
    const metrics = { ...nullMetrics, lcp: 5000 };
    const issues = analyzer.toIssues(metrics, 'http://localhost:3000');
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('LCP'))).toBe(true);
  });

  it('flags LCP between 2500-4000 as warning', () => {
    const metrics = { ...nullMetrics, lcp: 3000 };
    const issues = analyzer.toIssues(metrics, 'http://localhost:3000');
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('LCP'))).toBe(true);
  });

  it('flags CLS > 0.25 as error', () => {
    const metrics = { ...nullMetrics, cls: 0.35 };
    const issues = analyzer.toIssues(metrics, 'http://localhost:3000');
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('CLS'))).toBe(true);
  });

  it('flags TTFB > 1800 as error', () => {
    const metrics = { ...nullMetrics, ttfb: 2500 };
    const issues = analyzer.toIssues(metrics, 'http://localhost:3000');
    expect(issues.some((i) => i.severity === 'error' && i.message.includes('TTFB'))).toBe(true);
  });

  it('flags large transfer size > 5MB as warning', () => {
    const metrics = { ...nullMetrics, totalTransferSize: 6 * 1024 * 1024 };
    const issues = analyzer.toIssues(metrics, 'http://localhost:3000');
    expect(issues.some((i) => i.severity === 'warning' && i.message.includes('transfer size'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A11yAuditor -- toIssues mapping
// ---------------------------------------------------------------------------

describe('A11yAuditor', () => {
  let auditor: A11yAuditor;

  beforeEach(() => {
    auditor = new A11yAuditor();
  });

  it('maps critical/serious violations to error severity', () => {
    const violations: A11yViolation[] = [
      { rule: 'WCAG 1.1.1', impact: 'critical', description: 'no alt', selector: 'img', suggestion: 'add alt' },
      { rule: 'WCAG 4.1.2', impact: 'serious', description: 'no name', selector: 'button', suggestion: 'add label' },
    ];

    const issues = auditor.toIssues(violations);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'error')).toBe(true);
  });

  it('maps moderate/minor violations to warning severity', () => {
    const violations: A11yViolation[] = [
      { rule: 'WCAG 1.3.1', impact: 'moderate', description: 'heading skip', selector: 'h3' },
      { rule: 'WCAG 2.4.3', impact: 'minor', description: 'tabindex', selector: 'div' },
    ];

    const issues = auditor.toIssues(violations);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('returns empty array for no violations', () => {
    expect(auditor.toIssues([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ConsoleMonitor -- toIssues mapping
// ---------------------------------------------------------------------------

describe('ConsoleMonitor', () => {
  let monitor: ConsoleMonitor;

  beforeEach(() => {
    monitor = new ConsoleMonitor();
  });

  it('starts with empty entries', () => {
    expect(monitor.getEntries()).toEqual([]);
    expect(monitor.getErrors()).toEqual([]);
    expect(monitor.toIssues()).toEqual([]);
  });

  it('clear resets all entries', () => {
    // We cannot easily push entries without a mock page,
    // but we can verify clear does not throw
    monitor.clear();
    expect(monitor.getEntries()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_AUTOMATION_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_AUTOMATION_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_AUTOMATION_CONFIG.headless).toBe(true);
    expect(DEFAULT_AUTOMATION_CONFIG.devServerPort).toBe(3000);
    expect(DEFAULT_AUTOMATION_CONFIG.serverStartTimeout).toBe(30000);
    expect(DEFAULT_AUTOMATION_CONFIG.performanceEnabled).toBe(true);
    expect(DEFAULT_AUTOMATION_CONFIG.a11yEnabled).toBe(true);
    expect(DEFAULT_AUTOMATION_CONFIG.visualRegressionEnabled).toBe(false);
    expect(DEFAULT_AUTOMATION_CONFIG.maxPages).toBe(10);
    expect(DEFAULT_AUTOMATION_CONFIG.viewport).toEqual({ width: 1920, height: 1080 });
  });
});
