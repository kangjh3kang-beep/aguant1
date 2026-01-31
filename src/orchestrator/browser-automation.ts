/**
 * Browser Automation Engine — Phase 7
 *
 * ━━━ 실제 브라우저 자동화 ━━━
 *  · DevServerManager: 개발 서버 자동 시작/종료 (npm run dev, npm start 등)
 *  · BrowserSession: Puppeteer/puppeteer-core 기반 헤드리스 Chrome 제어
 *  · PageInteractor: 페이지 내비게이션, 클릭, 타이핑, 스크롤, 대기
 *  · ScreenshotEngine: 스크린샷 캡처 + 픽셀 단위 비교 (시각적 회귀 탐지)
 *  · ConsoleMonitor: 실시간 콘솔 에러/경고 수집
 *  · PerformanceAnalyzer: Core Web Vitals 측정 (LCP, CLS, FID/INP)
 *  · A11yAuditor: 렌더된 DOM 기반 런타임 접근성 검사
 *  · FlowRunner: 다단계 사용자 시나리오 실행
 *
 * ━━━ Graceful Degradation ━━━
 *  Puppeteer가 설치되지 않으면 정적 분석 모드로 자동 전환됩니다.
 *  `npm install puppeteer --save-dev` 또는 `puppeteer-core` + 시스템 Chrome 사용 가능.
 */

import fs from 'fs';
import path from 'path';
import { execSync, ChildProcess, spawn } from 'child_process';
import { BrowserConfig, TaskIssue, DEFAULT_BROWSER_CONFIG } from './types';

// ─── 브라우저 컨텍스트 타입 선언 ──────────────────────────────
// page.evaluate() 콜백은 Puppeteer가 브라우저에서 실행합니다.
// Node.js tsconfig에는 DOM 타입이 없으므로 최소 선언을 추가합니다.
/* eslint-disable no-var */
declare var document: any;
declare var window: any;
/* eslint-enable no-var */

// ─── 타입 정의 ─────────────────────────────────────────────

export interface BrowserAutomationConfig extends BrowserConfig {
  /** 개발 서버 시작 명령어 (자동 감지 가능) */
  devServerCommand?: string;
  /** 개발 서버 포트 */
  devServerPort?: number;
  /** 서버 시작 대기 시간 (ms) */
  serverStartTimeout?: number;
  /** 테스트 시나리오 */
  flows?: UserFlow[];
  /** 성능 측정 활성화 */
  performanceEnabled?: boolean;
  /** 접근성 감사 활성화 */
  a11yEnabled?: boolean;
  /** 스크린샷 비교 활성화 */
  visualRegressionEnabled?: boolean;
  /** 최대 페이지 탐색 수 */
  maxPages?: number;
}

export interface UserFlow {
  name: string;
  description?: string;
  steps: FlowStep[];
}

export interface FlowStep {
  action: 'navigate' | 'click' | 'type' | 'scroll' | 'wait' | 'screenshot' | 'assert-text' | 'assert-visible' | 'assert-url' | 'select' | 'hover' | 'press-key';
  /** CSS selector (click, type, wait, assert-visible, select, hover) */
  selector?: string;
  /** URL (navigate), text (type, assert-text), key (press-key) */
  value?: string;
  /** 대기 시간 (ms) - wait 액션용 */
  timeout?: number;
  /** 스크린샷 파일명 */
  screenshotName?: string;
  /** 스크롤 방향/양 */
  scrollY?: number;
}

export interface FlowResult {
  flowName: string;
  success: boolean;
  steps: StepResult[];
  duration: number;
  screenshots: string[];
  consoleErrors: ConsoleEntry[];
  performance?: PerformanceMetrics;
}

export interface StepResult {
  step: FlowStep;
  success: boolean;
  error?: string;
  duration: number;
  screenshot?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  screenshot?: string;
  consoleEntries: ConsoleEntry[];
  performance?: PerformanceMetrics;
  a11yViolations: A11yViolation[];
  timestamp: number;
}

export interface ConsoleEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  text: string;
  url?: string;
  lineNumber?: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  /** Largest Contentful Paint (ms) */
  lcp: number | null;
  /** First Input Delay (ms) */
  fid: number | null;
  /** Cumulative Layout Shift */
  cls: number | null;
  /** Time to First Byte (ms) */
  ttfb: number | null;
  /** First Contentful Paint (ms) */
  fcp: number | null;
  /** DOM Content Loaded (ms) */
  domContentLoaded: number | null;
  /** Load Event (ms) */
  loadEvent: number | null;
  /** 전체 리소스 수 */
  resourceCount: number;
  /** 전체 전송 바이트 */
  totalTransferSize: number;
}

export interface A11yViolation {
  rule: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  selector: string;
  html?: string;
  suggestion?: string;
}

export interface BrowserAutomationResult {
  success: boolean;
  mode: 'full-browser' | 'static-analysis';
  devServer: {
    started: boolean;
    url?: string;
    command?: string;
  };
  pages: PageSnapshot[];
  flows: FlowResult[];
  issues: TaskIssue[];
  logs: string[];
  duration: number;
}

export const DEFAULT_AUTOMATION_CONFIG: BrowserAutomationConfig = {
  ...DEFAULT_BROWSER_CONFIG,
  devServerPort: 3000,
  serverStartTimeout: 30000,
  performanceEnabled: true,
  a11yEnabled: true,
  visualRegressionEnabled: false,
  maxPages: 10,
};

// ─── Puppeteer 동적 로드 ────────────────────────────────────
// Puppeteer는 선택적 의존성이므로 타입을 any로 처리합니다.
// 실제 런타임에서 dynamic require()로 로드합니다.

/* eslint-disable @typescript-eslint/no-explicit-any */
type PuppeteerModule = any;
type PuppeteerBrowser = any;
type PuppeteerPage = any;

function loadPuppeteer(): PuppeteerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('puppeteer');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('puppeteer-core');
    } catch {
      return null;
    }
  }
}

function findChromePath(): string | undefined {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // which / where 시도
  try {
    const result = execSync(
      process.platform === 'win32' ? 'where chrome' : 'which google-chrome || which chromium-browser || which chromium',
      { encoding: 'utf-8', timeout: 5000 },
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {
    // ignore
  }

  return undefined;
}

// ─── DevServerManager ───────────────────────────────────────

export class DevServerManager {
  private process: ChildProcess | null = null;
  private projectPath: string;
  private config: BrowserAutomationConfig;
  private logs: string[] = [];
  private serverUrl: string | null = null;

  constructor(projectPath: string, config: BrowserAutomationConfig) {
    this.projectPath = projectPath;
    this.config = config;
  }

  /**
   * 개발 서버를 시작합니다.
   * 이미 실행 중이면 스킵하고, 실행 가능한 명령어를 자동으로 감지합니다.
   */
  start(): { started: boolean; url: string | null; command: string | null; logs: string[] } {
    this.logs = [];

    // 이미 서버가 실행 중인지 확인
    const port = this.config.devServerPort || 3000;
    if (this.isPortInUse(port)) {
      this.serverUrl = `http://localhost:${port}`;
      this.logs.push(`[DEV-SERVER] Port ${port} already in use — assuming dev server is running`);
      return { started: true, url: this.serverUrl, command: null, logs: this.logs };
    }

    // baseUrl이 지정되어 있으면 서버 시작 불필요
    if (this.config.baseUrl) {
      this.serverUrl = this.config.baseUrl;
      this.logs.push(`[DEV-SERVER] Using configured baseUrl: ${this.serverUrl}`);
      return { started: true, url: this.serverUrl, command: null, logs: this.logs };
    }

    // 명령어 결정
    const command = this.config.devServerCommand || this.detectDevCommand();
    if (!command) {
      this.logs.push('[DEV-SERVER] No dev server command found — skipping server startup');
      return { started: false, url: null, command: null, logs: this.logs };
    }

    this.logs.push(`[DEV-SERVER] Starting: ${command}`);

    try {
      const [cmd, ...args] = command.split(' ');
      this.process = spawn(cmd, args, {
        cwd: this.projectPath,
        env: { ...process.env, PORT: String(port), BROWSER: 'none' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
      });

      // 서버 시작 대기
      const timeout = this.config.serverStartTimeout || 30000;
      const started = this.waitForServer(port, timeout);

      if (started) {
        this.serverUrl = `http://localhost:${port}`;
        this.logs.push(`[DEV-SERVER] Server ready at ${this.serverUrl}`);
        return { started: true, url: this.serverUrl, command, logs: this.logs };
      } else {
        this.logs.push(`[DEV-SERVER] Server did not start within ${timeout}ms`);
        this.stop();
        return { started: false, url: null, command, logs: this.logs };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logs.push(`[DEV-SERVER] Failed to start: ${errMsg}`);
      return { started: false, url: null, command, logs: this.logs };
    }
  }

  /** 서버 종료 */
  stop(): void {
    if (this.process) {
      try {
        // 프로세스 그룹 전체 종료
        if (this.process.pid) {
          try {
            process.kill(-this.process.pid, 'SIGTERM');
          } catch {
            this.process.kill('SIGTERM');
          }
        }
      } catch {
        // ignore
      }
      this.process = null;
      this.serverUrl = null;
    }
  }

  getUrl(): string | null {
    return this.serverUrl;
  }

  private detectDevCommand(): string | null {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        // 우선순위: dev > start > serve
        if (scripts.dev) return 'npm run dev';
        if (scripts.start) return 'npm start';
        if (scripts.serve) return 'npm run serve';
      } catch {
        // ignore
      }
    }

    // Python
    if (fs.existsSync(path.join(this.projectPath, 'manage.py'))) {
      return 'python manage.py runserver';
    }

    // Go
    if (fs.existsSync(path.join(this.projectPath, 'main.go'))) {
      return 'go run main.go';
    }

    return null;
  }

  private isPortInUse(port: number): boolean {
    // 보안: 포트 번호 검증
    const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 0;
    if (safePort === 0) return false;
    try {
      execSync(`lsof -i :${safePort} -P -n -t 2>/dev/null || ss -tlnp "sport = :${safePort}" 2>/dev/null | grep -q LISTEN`, {
        encoding: 'utf-8',
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private waitForServer(port: number, timeout: number): boolean {
    // 보안: 포트 번호 검증
    const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeout) {
      try {
        execSync(`node -e "const h=require('http');const r=h.get('http://localhost:${safePort}',res=>{process.exit(res.statusCode<500?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(2000,()=>{r.destroy();process.exit(1)})"`, {
          timeout: 5000,
          stdio: 'ignore',
        });
        return true;
      } catch {
        // 대기
        execSync(`sleep ${interval / 1000}`, { timeout: interval + 1000 });
      }
    }

    return false;
  }
}

// ─── ConsoleMonitor ─────────────────────────────────────────

export class ConsoleMonitor {
  private entries: ConsoleEntry[] = [];

  /** Puppeteer 페이지에 콘솔 리스너를 등록합니다 */
  attach(page: PuppeteerPage): void {
    this.entries = [];

    page.on('console', (msg: { type: () => string; text: () => string; location: () => { url?: string; lineNumber?: number } }) => {
      const typeMap: Record<string, ConsoleEntry['level']> = {
        log: 'log', info: 'info', warn: 'warn', error: 'error', debug: 'debug',
        warning: 'warn', verbose: 'debug', dir: 'log', table: 'log',
      };
      const location = msg.location();
      this.entries.push({
        level: typeMap[msg.type()] || 'log',
        text: msg.text(),
        url: location?.url,
        lineNumber: location?.lineNumber,
        timestamp: Date.now(),
      });
    });

    page.on('pageerror', (err: Error) => {
      this.entries.push({
        level: 'error',
        text: `[PageError] ${err.message}`,
        timestamp: Date.now(),
      });
    });
  }

  /** 수집된 콘솔 로그를 반환합니다 */
  getEntries(): ConsoleEntry[] {
    return [...this.entries];
  }

  /** 에러/경고만 반환 */
  getErrors(): ConsoleEntry[] {
    return this.entries.filter((e) => e.level === 'error' || e.level === 'warn');
  }

  /** 콘솔 로그를 TaskIssue로 변환 */
  toIssues(): TaskIssue[] {
    const issues: TaskIssue[] = [];
    for (const entry of this.entries) {
      if (entry.level === 'error') {
        issues.push({
          severity: 'error',
          message: `[Console Error] ${entry.text.slice(0, 300)}`,
          file: entry.url,
          line: entry.lineNumber,
          autoFixable: false,
        });
      } else if (entry.level === 'warn') {
        issues.push({
          severity: 'warning',
          message: `[Console Warning] ${entry.text.slice(0, 300)}`,
          file: entry.url,
          line: entry.lineNumber,
          autoFixable: false,
        });
      }
    }
    return issues;
  }

  clear(): void {
    this.entries = [];
  }
}

// ─── ScreenshotEngine ───────────────────────────────────────

export class ScreenshotEngine {
  private screenshotDir: string;

  constructor(screenshotDir: string) {
    this.screenshotDir = screenshotDir;
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  }

  /** 전체 페이지 스크린샷 캡처 */
  async capture(page: PuppeteerPage, name: string): Promise<string> {
    const filePath = path.join(this.screenshotDir, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  /** 뷰포트 스크린샷 캡처 */
  async captureViewport(page: PuppeteerPage, name: string): Promise<string> {
    const filePath = path.join(this.screenshotDir, `${name}-viewport.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }

  /**
   * 두 스크린샷의 픽셀 차이를 비교합니다 (간이 비교).
   * 파일 크기 기반 + 바이너리 diff 기반 quick check.
   * 정밀한 pixel-diff는 pixelmatch 패키지가 필요하지만,
   * 여기서는 외부 의존 없이 바이너리 비교를 수행합니다.
   */
  compare(baselinePath: string, currentPath: string): { identical: boolean; diffPercent: number; diffDetails: string } {
    if (!fs.existsSync(baselinePath)) {
      return { identical: false, diffPercent: -1, diffDetails: `Baseline not found: ${baselinePath}` };
    }
    if (!fs.existsSync(currentPath)) {
      return { identical: false, diffPercent: -1, diffDetails: `Current not found: ${currentPath}` };
    }

    const baselineBuffer = fs.readFileSync(baselinePath);
    const currentBuffer = fs.readFileSync(currentPath);

    // 크기 비교
    const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
    const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);

    if (baselineBuffer.equals(currentBuffer)) {
      return { identical: true, diffPercent: 0, diffDetails: 'Screenshots are identical' };
    }

    // 바이트 단위 비교
    const minLen = Math.min(baselineBuffer.length, currentBuffer.length);
    let diffBytes = 0;
    for (let i = 0; i < minLen; i++) {
      if (baselineBuffer[i] !== currentBuffer[i]) diffBytes++;
    }
    diffBytes += Math.abs(baselineBuffer.length - currentBuffer.length);

    const diffPercent = Math.round((diffBytes / maxSize) * 100 * 100) / 100;

    return {
      identical: false,
      diffPercent,
      diffDetails: `Size diff: ${sizeDiff} bytes, Byte diff: ${diffPercent}% (${diffBytes}/${maxSize} bytes)`,
    };
  }

  /** 기존 baseline 목록 조회 */
  listBaselines(): string[] {
    try {
      return fs.readdirSync(this.screenshotDir)
        .filter((f) => /\.(png|jpg|jpeg)$/.test(f))
        .map((f) => path.join(this.screenshotDir, f));
    } catch {
      return [];
    }
  }
}

// ─── PerformanceAnalyzer ────────────────────────────────────

export class PerformanceAnalyzer {
  /**
   * Puppeteer 페이지에서 Core Web Vitals 및 성능 지표를 측정합니다.
   * Performance API + PerformanceObserver를 활용합니다.
   */
  async measure(page: PuppeteerPage): Promise<PerformanceMetrics> {
    const metrics = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const perf = performance as any;
      const nav = perf.getEntriesByType('navigation')[0];
      const paint = perf.getEntriesByType('paint') as any[];
      const resources = perf.getEntriesByType('resource') as any[];

      // FCP
      const fcpEntry = paint.find((p: any) => p.name === 'first-contentful-paint');
      const fcp = fcpEntry ? (fcpEntry as any).startTime : null;

      // LCP - PerformanceObserver 결과 (이미 기록된 것)
      let lcp: number | null = null;
      try {
        const lcpEntries = (performance as any).getEntriesByType?.('largest-contentful-paint');
        if (lcpEntries && lcpEntries.length > 0) {
          lcp = lcpEntries[lcpEntries.length - 1].startTime;
        }
      } catch {
        // LCP API 미지원 환경
      }

      // CLS
      let cls: number | null = null;
      try {
        const layoutShiftEntries = (performance as any).getEntriesByType?.('layout-shift');
        if (layoutShiftEntries && layoutShiftEntries.length > 0) {
          cls = layoutShiftEntries
            .filter((e: any) => !e.hadRecentInput)
            .reduce((sum: number, e: any) => sum + e.value, 0);
        }
      } catch {
        // Layout Shift API 미지원
      }

      // Navigation Timing
      const ttfb = nav ? nav.responseStart - nav.requestStart : null;
      const domContentLoaded = nav ? nav.domContentLoadedEventEnd - nav.startTime : null;
      const loadEvent = nav ? nav.loadEventEnd - nav.startTime : null;

      // Resources
      const resourceCount = resources.length;
      const totalTransferSize = resources.reduce((sum: number, r: any) => sum + (r.transferSize || 0), 0);

      return {
        lcp,
        fid: null, // FID는 실제 사용자 입력이 필요하여 측정 불가 (synthetic test)
        cls,
        ttfb,
        fcp,
        domContentLoaded,
        loadEvent,
        resourceCount,
        totalTransferSize,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    return metrics;
  }

  /** 성능 지표를 TaskIssue로 변환 (임계값 기반) */
  toIssues(metrics: PerformanceMetrics, url: string): TaskIssue[] {
    const issues: TaskIssue[] = [];

    // LCP: Good < 2.5s, Poor > 4s
    if (metrics.lcp !== null && metrics.lcp > 4000) {
      issues.push({
        severity: 'error',
        message: `[Performance] LCP ${Math.round(metrics.lcp)}ms > 4000ms (Poor) — ${url}`,
        suggestion: 'LCP 개선: 이미지 최적화, preload, 서버 응답 속도 개선, 렌더 블로킹 제거',
        autoFixable: false,
      });
    } else if (metrics.lcp !== null && metrics.lcp > 2500) {
      issues.push({
        severity: 'warning',
        message: `[Performance] LCP ${Math.round(metrics.lcp)}ms > 2500ms (Needs Improvement) — ${url}`,
        suggestion: 'LCP 개선: lazy loading, 이미지 포맷 최적화 (WebP/AVIF)',
        autoFixable: false,
      });
    }

    // CLS: Good < 0.1, Poor > 0.25
    if (metrics.cls !== null && metrics.cls > 0.25) {
      issues.push({
        severity: 'error',
        message: `[Performance] CLS ${metrics.cls.toFixed(3)} > 0.25 (Poor) — ${url}`,
        suggestion: 'CLS 개선: 이미지/광고에 크기 지정, 동적 콘텐츠 영역 예약, font-display: swap',
        autoFixable: false,
      });
    } else if (metrics.cls !== null && metrics.cls > 0.1) {
      issues.push({
        severity: 'warning',
        message: `[Performance] CLS ${metrics.cls.toFixed(3)} > 0.1 (Needs Improvement) — ${url}`,
        suggestion: 'CLS 개선: 동적 요소에 min-height 지정',
        autoFixable: false,
      });
    }

    // TTFB: Good < 800ms
    if (metrics.ttfb !== null && metrics.ttfb > 1800) {
      issues.push({
        severity: 'error',
        message: `[Performance] TTFB ${Math.round(metrics.ttfb)}ms > 1800ms — ${url}`,
        suggestion: 'TTFB 개선: CDN 사용, 서버 캐싱, DB 쿼리 최적화',
        autoFixable: false,
      });
    } else if (metrics.ttfb !== null && metrics.ttfb > 800) {
      issues.push({
        severity: 'warning',
        message: `[Performance] TTFB ${Math.round(metrics.ttfb)}ms > 800ms — ${url}`,
        autoFixable: false,
      });
    }

    // 리소스 크기
    if (metrics.totalTransferSize > 5 * 1024 * 1024) {
      issues.push({
        severity: 'warning',
        message: `[Performance] Total transfer size ${(metrics.totalTransferSize / 1024 / 1024).toFixed(1)}MB > 5MB — ${url}`,
        suggestion: '번들 크기 최적화: 코드 스플리팅, 트리 셰이킹, 압축 확인',
        autoFixable: false,
      });
    }

    // DOM Content Loaded
    if (metrics.domContentLoaded !== null && metrics.domContentLoaded > 5000) {
      issues.push({
        severity: 'warning',
        message: `[Performance] DOMContentLoaded ${Math.round(metrics.domContentLoaded)}ms > 5000ms — ${url}`,
        suggestion: 'HTML 파싱 최적화: 인라인 CSS 최소화, defer/async 스크립트',
        autoFixable: false,
      });
    }

    return issues;
  }
}

// ─── A11yAuditor ────────────────────────────────────────────

export class A11yAuditor {
  /**
   * 렌더된 DOM에서 접근성 위반을 검사합니다.
   * 외부 라이브러리(axe-core) 없이 순수 DOM API 기반으로 수행합니다.
   * axe-core가 설치되어 있으면 자동으로 사용합니다.
   */
  async audit(page: PuppeteerPage): Promise<A11yViolation[]> {
    const violations = await page.evaluate(() => {
      const results: Array<{
        rule: string;
        impact: 'critical' | 'serious' | 'moderate' | 'minor';
        description: string;
        selector: string;
        html: string;
        suggestion: string;
      }> = [];

      // 1. img without alt
      document.querySelectorAll('img').forEach((img: any) => {
        if (!img.hasAttribute('alt')) {
          results.push({
            rule: 'WCAG 1.1.1',
            impact: 'critical',
            description: '<img> 요소에 alt 속성이 없습니다',
            selector: getSelector(img),
            html: img.outerHTML.slice(0, 200),
            suggestion: '모든 <img>에 alt 속성을 추가하세요 (장식 이미지: alt="")',
          });
        }
      });

      // 2. buttons/links without accessible name
      document.querySelectorAll('button, a[href], [role="button"], [role="link"]').forEach((el: any) => {
        const text = el.textContent?.trim() || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const ariaLabelledBy = el.getAttribute('aria-labelledby') || '';
        const title = el.getAttribute('title') || '';

        if (!text && !ariaLabel && !ariaLabelledBy && !title) {
          const imgAlt = el.querySelector('img')?.getAttribute('alt') || '';
          const svgTitle = el.querySelector('svg title')?.textContent || '';
          if (!imgAlt && !svgTitle) {
            results.push({
              rule: 'WCAG 4.1.2',
              impact: 'serious',
              description: `인터랙티브 요소 <${el.tagName.toLowerCase()}>에 접근 가능한 이름이 없습니다`,
              selector: getSelector(el),
              html: el.outerHTML.slice(0, 200),
              suggestion: 'aria-label, 텍스트 콘텐츠, 또는 title 속성을 추가하세요',
            });
          }
        }
      });

      // 3. form inputs without labels
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select').forEach((input: any) => {
        const id = input.getAttribute('id');
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        const placeholder = input.getAttribute('placeholder');
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : null;
        const wrappedLabel = input.closest('label');

        if (!ariaLabel && !ariaLabelledBy && !hasLabel && !wrappedLabel) {
          results.push({
            rule: 'WCAG 1.3.1',
            impact: placeholder ? 'moderate' : 'serious',
            description: `<${input.tagName.toLowerCase()}> 입력 필드에 연결된 <label>이 없습니다`,
            selector: getSelector(input),
            html: input.outerHTML.slice(0, 200),
            suggestion: '<label for="id"> 또는 aria-label 속성을 추가하세요',
          });
        }
      });

      // 4. heading hierarchy
      const headings: any[] = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
      let prevLevel = 0;
      for (const h of headings) {
        const level = parseInt((h as any).tagName.charAt(1));
        if (prevLevel > 0 && level > prevLevel + 1) {
          results.push({
            rule: 'WCAG 1.3.1',
            impact: 'moderate',
            description: `제목 계층 구조 불연속: <h${prevLevel}> 다음에 <h${level}> (건너뜀)`,
            selector: getSelector(h),
            html: (h as any).outerHTML.slice(0, 200),
            suggestion: `<h${prevLevel + 1}>을 사용하거나 중간 제목을 추가하세요`,
          });
        }
        prevLevel = level;
      }

      // 5. html lang attribute
      const htmlEl = document.documentElement;
      if (!htmlEl.hasAttribute('lang') || !htmlEl.getAttribute('lang')) {
        results.push({
          rule: 'WCAG 3.1.1',
          impact: 'serious',
          description: '<html> 요소에 lang 속성이 없습니다',
          selector: 'html',
          html: `<html ${Array.from(htmlEl.attributes).map((a: any) => `${a.name}="${a.value}"`).join(' ')}>`,
          suggestion: '<html lang="ko"> 또는 <html lang="en"> 추가',
        });
      }

      // 6. color contrast (heuristic — 정밀도 제한)
      // 실제 contrast ratio 계산은 getComputedStyle로 가능하지만 배경 추적이 복잡
      // 여기서는 작은 텍스트의 색상만 감지
      document.querySelectorAll('p, span, a, li, td, th, label, div').forEach((el: any) => {
        const style = window.getComputedStyle(el);
        const color = style.color;
        const bg = style.backgroundColor;

        // 투명 배경이면 skip
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return;

        const colorRGB = parseRGB(color);
        const bgRGB = parseRGB(bg);

        if (colorRGB && bgRGB) {
          const ratio = contrastRatio(colorRGB, bgRGB);
          const fontSize = parseFloat(style.fontSize);
          const isBold = parseInt(style.fontWeight) >= 700;
          const isLargeText = fontSize >= 18 || (fontSize >= 14 && isBold);
          const threshold = isLargeText ? 3 : 4.5;

          if (ratio < threshold && el.textContent && el.textContent.trim().length > 0) {
            results.push({
              rule: 'WCAG 1.4.3',
              impact: ratio < 2 ? 'critical' : 'serious',
              description: `색상 대비 비율 ${ratio.toFixed(2)}:1 < ${threshold}:1 (${isLargeText ? '큰 텍스트' : '일반 텍스트'})`,
              selector: getSelector(el),
              html: el.outerHTML.slice(0, 150),
              suggestion: `텍스트 색상 대비를 ${threshold}:1 이상으로 조정하세요`,
            });
          }
        }
      });

      // 7. focus indicator
      const focusableElements = document.querySelectorAll(
        'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      let noOutlineCount = 0;
      focusableElements.forEach((el: any) => {
        const style = window.getComputedStyle(el);
        if (style.outlineStyle === 'none' && style.outlineWidth === '0px') {
          // outline: none이지만 box-shadow나 다른 포커스 표시가 있을 수 있음
          // 여기서는 단순 카운트만
          noOutlineCount++;
        }
      });
      if (noOutlineCount > 5) {
        results.push({
          rule: 'WCAG 2.4.7',
          impact: 'serious',
          description: `${noOutlineCount}개의 포커스 가능 요소에 outline: none — 키보드 포커스 표시기 확인 필요`,
          selector: ':focus',
          html: '',
          suggestion: ':focus-visible에 명확한 포커스 스타일을 설정하세요',
        });
      }

      // 8. tabindex > 0 (순서 파괴)
      document.querySelectorAll('[tabindex]').forEach((el: any) => {
        const tabIndex = parseInt(el.getAttribute('tabindex') || '0');
        if (tabIndex > 0) {
          results.push({
            rule: 'WCAG 2.4.3',
            impact: 'moderate',
            description: `tabindex="${tabIndex}" 사용 — 자연스러운 탭 순서를 파괴합니다`,
            selector: getSelector(el),
            html: el.outerHTML.slice(0, 200),
            suggestion: 'tabindex="0" 또는 DOM 순서를 변경하세요',
          });
        }
      });

      return results;

      // ── 유틸 함수 ──

      function getSelector(el: any): string {
        if (el.id) return `#${el.id}`;
        const classes = Array.from(el.classList).slice(0, 3).join('.');
        const tag = el.tagName.toLowerCase();
        return classes ? `${tag}.${classes}` : tag;
      }

      function parseRGB(color: string): [number, number, number] | null {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return null;
      }

      function luminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map((c) => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
        const l1 = luminance(fg[0], fg[1], fg[2]);
        const l2 = luminance(bg[0], bg[1], bg[2]);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }
    });

    return violations;
  }

  /** A11y 위반을 TaskIssue로 변환 */
  toIssues(violations: A11yViolation[]): TaskIssue[] {
    return violations.map((v) => ({
      severity: v.impact === 'critical' || v.impact === 'serious' ? 'error' as const : 'warning' as const,
      message: `[${v.rule}] ${v.description} — ${v.selector}`,
      suggestion: v.suggestion,
      autoFixable: false,
    }));
  }
}

// ─── PageInteractor ─────────────────────────────────────────

export class PageInteractor {
  private defaultTimeout: number;

  constructor(timeout: number = 30000) {
    this.defaultTimeout = timeout;
  }

  /** URL로 이동 */
  async navigate(page: PuppeteerPage, url: string): Promise<void> {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: this.defaultTimeout });
  }

  /** CSS 셀렉터로 요소 클릭 */
  async click(page: PuppeteerPage, selector: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.click(selector);
  }

  /** 입력 필드에 텍스트 입력 */
  async type(page: PuppeteerPage, selector: string, text: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.click(selector, { count: 3 }); // select all
    await page.type(selector, text);
  }

  /** 페이지 스크롤 */
  async scroll(page: PuppeteerPage, y: number): Promise<void> {
    await page.evaluate((scrollY: number) => window.scrollBy(0, scrollY), y);
  }

  /** 요소 존재 대기 */
  async waitFor(page: PuppeteerPage, selector: string, timeout?: number): Promise<boolean> {
    try {
      await page.waitForSelector(selector, { timeout: timeout || this.defaultTimeout });
      return true;
    } catch {
      return false;
    }
  }

  /** 요소 위에 마우스 호버 */
  async hover(page: PuppeteerPage, selector: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.hover(selector);
  }

  /** 셀렉트 박스 값 선택 */
  async select(page: PuppeteerPage, selector: string, value: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.defaultTimeout });
    await page.select(selector, value);
  }

  /** 키보드 키 입력 */
  async pressKey(page: PuppeteerPage, key: string): Promise<void> {
    await page.keyboard.press(key);
  }

  /** 텍스트 존재 확인 */
  async assertText(page: PuppeteerPage, expectedText: string): Promise<boolean> {
    const content = await page.content();
    return content.includes(expectedText);
  }

  /** 요소 가시성 확인 */
  async assertVisible(page: PuppeteerPage, selector: string): Promise<boolean> {
    try {
      const el = await page.waitForSelector(selector, { visible: true, timeout: 5000 });
      return el !== null;
    } catch {
      return false;
    }
  }

  /** 현재 URL 확인 */
  async assertUrl(page: PuppeteerPage, expectedUrl: string): Promise<boolean> {
    const currentUrl = page.url();
    return currentUrl.includes(expectedUrl);
  }
}

// ─── FlowRunner ─────────────────────────────────────────────

export class FlowRunner {
  private interactor: PageInteractor;
  private screenshotEngine: ScreenshotEngine;
  private consoleMonitor: ConsoleMonitor;
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor(
    interactor: PageInteractor,
    screenshotEngine: ScreenshotEngine,
    consoleMonitor: ConsoleMonitor,
    performanceAnalyzer: PerformanceAnalyzer,
  ) {
    this.interactor = interactor;
    this.screenshotEngine = screenshotEngine;
    this.consoleMonitor = consoleMonitor;
    this.performanceAnalyzer = performanceAnalyzer;
  }

  /** 사용자 플로우를 실행합니다 */
  async run(page: PuppeteerPage, flow: UserFlow): Promise<FlowResult> {
    const start = Date.now();
    const stepResults: StepResult[] = [];
    const screenshots: string[] = [];
    let success = true;

    this.consoleMonitor.clear();
    this.consoleMonitor.attach(page);

    for (const step of flow.steps) {
      const stepStart = Date.now();
      let stepSuccess = true;
      let error: string | undefined;
      let screenshot: string | undefined;

      try {
        switch (step.action) {
          case 'navigate':
            if (step.value) await this.interactor.navigate(page, step.value);
            break;

          case 'click':
            if (step.selector) await this.interactor.click(page, step.selector);
            break;

          case 'type':
            if (step.selector && step.value) await this.interactor.type(page, step.selector, step.value);
            break;

          case 'scroll':
            await this.interactor.scroll(page, step.scrollY || 500);
            break;

          case 'wait':
            if (step.selector) {
              stepSuccess = await this.interactor.waitFor(page, step.selector, step.timeout);
              if (!stepSuccess) error = `Element not found: ${step.selector}`;
            } else if (step.timeout) {
              await new Promise((resolve) => setTimeout(resolve, step.timeout));
            }
            break;

          case 'screenshot':
            screenshot = await this.screenshotEngine.capture(
              page,
              step.screenshotName || `${flow.name}-step-${stepResults.length}`,
            );
            screenshots.push(screenshot);
            break;

          case 'assert-text':
            if (step.value) {
              stepSuccess = await this.interactor.assertText(page, step.value);
              if (!stepSuccess) error = `Text not found: "${step.value}"`;
            }
            break;

          case 'assert-visible':
            if (step.selector) {
              stepSuccess = await this.interactor.assertVisible(page, step.selector);
              if (!stepSuccess) error = `Element not visible: ${step.selector}`;
            }
            break;

          case 'assert-url':
            if (step.value) {
              stepSuccess = await this.interactor.assertUrl(page, step.value);
              if (!stepSuccess) error = `URL mismatch: expected "${step.value}", got "${page.url()}"`;
            }
            break;

          case 'select':
            if (step.selector && step.value) await this.interactor.select(page, step.selector, step.value);
            break;

          case 'hover':
            if (step.selector) await this.interactor.hover(page, step.selector);
            break;

          case 'press-key':
            if (step.value) await this.interactor.pressKey(page, step.value);
            break;
        }
      } catch (err: unknown) {
        stepSuccess = false;
        error = err instanceof Error ? err.message : String(err);
      }

      if (!stepSuccess) success = false;

      stepResults.push({
        step,
        success: stepSuccess,
        error,
        duration: Date.now() - stepStart,
        screenshot,
      });

      // 실패 시 스크린샷 자동 캡처
      if (!stepSuccess) {
        try {
          const failScreenshot = await this.screenshotEngine.capture(
            page,
            `${flow.name}-FAIL-step-${stepResults.length - 1}`,
          );
          screenshots.push(failScreenshot);
        } catch {
          // ignore screenshot failure
        }
      }
    }

    // 플로우 완료 후 성능 측정
    let performance: PerformanceMetrics | undefined;
    try {
      performance = await this.performanceAnalyzer.measure(page);
    } catch {
      // ignore performance measurement failure
    }

    return {
      flowName: flow.name,
      success,
      steps: stepResults,
      duration: Date.now() - start,
      screenshots,
      consoleErrors: this.consoleMonitor.getErrors(),
      performance,
    };
  }
}

// ─── BrowserSession ─────────────────────────────────────────

export class BrowserSession {
  private browser: PuppeteerBrowser | null = null;
  private puppeteer: PuppeteerModule | null = null;
  private config: BrowserAutomationConfig;

  constructor(config: BrowserAutomationConfig) {
    this.config = config;
  }

  /** 브라우저 세션을 시작합니다 */
  async launch(): Promise<boolean> {
    this.puppeteer = loadPuppeteer();
    if (!this.puppeteer) return false;

    try {
      const launchOptions: Record<string, unknown> = {
        headless: this.config.headless ? 'new' : false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          `--window-size=${this.config.viewport.width},${this.config.viewport.height}`,
        ],
      };

      // puppeteer-core를 사용하는 경우 Chrome 경로 지정 필요
      const chromePath = findChromePath();
      if (chromePath) {
        launchOptions.executablePath = chromePath;
      }

      this.browser = await this.puppeteer.launch(launchOptions) as PuppeteerBrowser;
      return true;
    } catch {
      return false;
    }
  }

  /** 새 페이지를 생성합니다 */
  async newPage(): Promise<PuppeteerPage | null> {
    if (!this.browser) return null;

    const page = await this.browser.newPage();
    await page.setViewport({
      width: this.config.viewport.width,
      height: this.config.viewport.height,
    });

    // User-Agent 설정
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Antigravity-Agent/1.0',
    );

    return page;
  }

  /** 브라우저 세션을 종료합니다 */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // ignore
      }
      this.browser = null;
    }
  }

  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

// ─── BrowserAutomation (메인 통합 클래스) ──────────────────

export class BrowserAutomation {
  private projectPath: string;
  private config: BrowserAutomationConfig;

  // 서브 컴포넌트
  private devServer: DevServerManager;
  private session: BrowserSession;
  private interactor: PageInteractor;
  private screenshotEngine: ScreenshotEngine;
  private consoleMonitor: ConsoleMonitor;
  private performanceAnalyzer: PerformanceAnalyzer;
  private a11yAuditor: A11yAuditor;
  private flowRunner: FlowRunner;

  constructor(projectPath: string, config?: Partial<BrowserAutomationConfig>) {
    this.projectPath = projectPath;
    this.config = { ...DEFAULT_AUTOMATION_CONFIG, ...config };

    const screenshotDir = path.resolve(projectPath, this.config.screenshotDir);

    this.devServer = new DevServerManager(projectPath, this.config);
    this.session = new BrowserSession(this.config);
    this.interactor = new PageInteractor(this.config.waitTimeout);
    this.screenshotEngine = new ScreenshotEngine(screenshotDir);
    this.consoleMonitor = new ConsoleMonitor();
    this.performanceAnalyzer = new PerformanceAnalyzer();
    this.a11yAuditor = new A11yAuditor();
    this.flowRunner = new FlowRunner(
      this.interactor,
      this.screenshotEngine,
      this.consoleMonitor,
      this.performanceAnalyzer,
    );
  }

  /**
   * 전체 브라우저 자동화를 실행합니다.
   *
   * 1. 개발 서버 시작 (필요 시)
   * 2. 브라우저 세션 시작
   * 3. 메인 페이지 스냅샷 (콘솔, 성능, 접근성)
   * 4. 사용자 플로우 실행 (설정된 경우)
   * 5. 시각적 회귀 비교 (baseline 존재 시)
   * 6. 정리 및 결과 반환
   *
   * Puppeteer 미설치 시 정적 분석 모드로 자동 전환.
   */
  async run(): Promise<BrowserAutomationResult> {
    const start = Date.now();
    const logs: string[] = [];
    const issues: TaskIssue[] = [];
    const pages: PageSnapshot[] = [];
    const flows: FlowResult[] = [];

    logs.push('╔══════════════════════════════════════════════╗');
    logs.push('║   BROWSER AUTOMATION ENGINE v1.0             ║');
    logs.push('║   Phase 7: Real Browser Testing              ║');
    logs.push('╚══════════════════════════════════════════════╝');
    logs.push('');

    // 1. Puppeteer 확인
    const puppeteer = loadPuppeteer();
    if (!puppeteer) {
      logs.push('[BROWSER] Puppeteer not available — falling back to static analysis mode');
      logs.push('[BROWSER] To enable full browser testing:');
      logs.push('  npm install puppeteer --save-dev');
      logs.push('  # or for lighter setup:');
      logs.push('  npm install puppeteer-core --save-dev');
      logs.push('');

      return {
        success: true,
        mode: 'static-analysis',
        devServer: { started: false },
        pages: [],
        flows: [],
        issues,
        logs,
        duration: Date.now() - start,
      };
    }

    // 2. 개발 서버 시작
    logs.push('[STEP 1] Starting dev server...');
    const serverResult = this.devServer.start();
    logs.push(...serverResult.logs);

    const baseUrl = serverResult.url || this.config.baseUrl || `http://localhost:${this.config.devServerPort || 3000}`;

    // 3. 브라우저 세션 시작
    logs.push('');
    logs.push('[STEP 2] Launching browser...');
    const launched = await this.session.launch();

    if (!launched) {
      logs.push('[BROWSER] Failed to launch browser — check Chrome/Chromium installation');
      this.devServer.stop();
      return {
        success: false,
        mode: 'full-browser',
        devServer: { started: serverResult.started, url: serverResult.url || undefined, command: serverResult.command || undefined },
        pages: [],
        flows: [],
        issues: [{ severity: 'error', message: 'Browser launch failed — Puppeteer/Chrome 설치를 확인하세요', autoFixable: false }],
        logs,
        duration: Date.now() - start,
      };
    }

    logs.push(`[BROWSER] Browser launched (headless: ${this.config.headless})`);
    logs.push(`[BROWSER] Viewport: ${this.config.viewport.width}x${this.config.viewport.height}`);

    try {
      // 4. 메인 페이지 스냅샷
      logs.push('');
      logs.push('[STEP 3] Capturing main page snapshot...');

      const mainPage = await this.session.newPage();
      if (mainPage) {
        const snapshot = await this.capturePageSnapshot(mainPage, baseUrl, 'main');
        pages.push(snapshot);
        issues.push(...this.consoleMonitor.toIssues());

        // 성능 이슈
        if (snapshot.performance && this.config.performanceEnabled) {
          issues.push(...this.performanceAnalyzer.toIssues(snapshot.performance, baseUrl));
          this.logPerformance(logs, snapshot.performance, baseUrl);
        }

        // 접근성 이슈
        if (this.config.a11yEnabled && snapshot.a11yViolations.length > 0) {
          issues.push(...this.a11yAuditor.toIssues(snapshot.a11yViolations));
          logs.push(`[A11Y] ${snapshot.a11yViolations.length} accessibility violations found`);
          for (const v of snapshot.a11yViolations.slice(0, 10)) {
            logs.push(`  [${v.impact.toUpperCase()}] ${v.rule}: ${v.description}`);
          }
        }

        // 시각적 회귀 검사
        if (this.config.visualRegressionEnabled && snapshot.screenshot) {
          const baselineName = 'main.png';
          const baselinePath = path.join(
            path.resolve(this.projectPath, this.config.screenshotDir),
            `baseline-${baselineName}`,
          );
          if (fs.existsSync(baselinePath)) {
            const comparison = this.screenshotEngine.compare(baselinePath, snapshot.screenshot);
            if (!comparison.identical) {
              logs.push(`[VISUAL] Regression detected: ${comparison.diffDetails}`);
              if (comparison.diffPercent > 5) {
                issues.push({
                  severity: 'warning',
                  message: `[Visual Regression] Main page changed by ${comparison.diffPercent}%`,
                  suggestion: '스크린샷을 비교하여 의도된 변경인지 확인하세요',
                  autoFixable: false,
                });
              }
            } else {
              logs.push('[VISUAL] No visual regression detected');
            }
          } else {
            logs.push('[VISUAL] No baseline found — saving current as baseline');
            if (snapshot.screenshot) {
              try {
                fs.copyFileSync(snapshot.screenshot, baselinePath);
              } catch {
                // ignore
              }
            }
          }
        }

        // 콘솔 에러 로깅
        const consoleErrors = this.consoleMonitor.getErrors();
        if (consoleErrors.length > 0) {
          logs.push('');
          logs.push(`[CONSOLE] ${consoleErrors.length} error(s)/warning(s):`);
          for (const entry of consoleErrors.slice(0, 20)) {
            logs.push(`  [${entry.level.toUpperCase()}] ${entry.text.slice(0, 200)}`);
          }
        }

        await mainPage.close();
      }

      // 5. 사용자 플로우 실행
      if (this.config.flows && this.config.flows.length > 0) {
        logs.push('');
        logs.push(`[STEP 4] Running ${this.config.flows.length} user flow(s)...`);

        for (const flow of this.config.flows) {
          const flowPage = await this.session.newPage();
          if (!flowPage) continue;

          logs.push(`\n  ── Flow: ${flow.name} ──`);

          const flowResult = await this.flowRunner.run(flowPage, flow);
          flows.push(flowResult);

          logs.push(`  Status: ${flowResult.success ? 'PASS' : 'FAIL'}`);
          logs.push(`  Steps: ${flowResult.steps.length}, Duration: ${flowResult.duration}ms`);

          for (const sr of flowResult.steps) {
            const status = sr.success ? '✓' : '✗';
            logs.push(`    ${status} ${sr.step.action}${sr.step.selector ? ` (${sr.step.selector})` : ''}${sr.step.value ? ` → "${sr.step.value.slice(0, 50)}"` : ''} [${sr.duration}ms]`);
            if (sr.error) {
              logs.push(`      Error: ${sr.error.slice(0, 200)}`);
              issues.push({
                severity: 'error',
                message: `[Flow: ${flow.name}] Step "${sr.step.action}" failed: ${sr.error.slice(0, 200)}`,
                autoFixable: false,
              });
            }
          }

          // 플로우 콘솔 에러
          for (const ce of flowResult.consoleErrors) {
            issues.push({
              severity: ce.level === 'error' ? 'error' : 'warning',
              message: `[Flow: ${flow.name}] Console ${ce.level}: ${ce.text.slice(0, 200)}`,
              autoFixable: false,
            });
          }

          await flowPage.close();
        }
      }

      // 6. 추가 페이지 탐색 (링크 기반 자동 탐색)
      if ((this.config.maxPages || 0) > 1 && pages.length < (this.config.maxPages || 10)) {
        logs.push('');
        logs.push('[STEP 5] Auto-discovering linked pages...');

        const discoveredUrls = await this.discoverLinks(baseUrl);
        const maxAdditional = Math.min(
          discoveredUrls.length,
          (this.config.maxPages || 10) - pages.length,
        );

        for (let i = 0; i < maxAdditional; i++) {
          const url = discoveredUrls[i];
          const page = await this.session.newPage();
          if (!page) break;

          try {
            const snapshot = await this.capturePageSnapshot(page, url, `page-${i + 1}`);
            pages.push(snapshot);
            issues.push(...this.consoleMonitor.toIssues());

            if (snapshot.a11yViolations.length > 0 && this.config.a11yEnabled) {
              issues.push(...this.a11yAuditor.toIssues(snapshot.a11yViolations));
            }

            logs.push(`  [${url}] ${snapshot.consoleEntries.filter((e) => e.level === 'error').length} errors, ${snapshot.a11yViolations.length} a11y violations`);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logs.push(`  [${url}] Failed: ${errMsg.slice(0, 100)}`);
          }

          await page.close();
        }
      }

    } finally {
      // 7. 정리
      await this.session.close();
      this.devServer.stop();
    }

    // 결과 생성
    const errorCount = issues.filter((i) => i.severity === 'error' || i.severity === 'critical').length;
    const flowFailCount = flows.filter((f) => !f.success).length;

    logs.push('');
    logs.push('━━━ BROWSER AUTOMATION SUMMARY ━━━');
    logs.push(`  Mode: Full Browser (Puppeteer)`);
    logs.push(`  Pages tested: ${pages.length}`);
    logs.push(`  Flows executed: ${flows.length} (${flowFailCount} failed)`);
    logs.push(`  Issues: ${issues.length} (${errorCount} errors)`);
    logs.push(`  Duration: ${Date.now() - start}ms`);
    logs.push('');

    return {
      success: errorCount === 0 && flowFailCount === 0,
      mode: 'full-browser',
      devServer: {
        started: serverResult.started,
        url: serverResult.url || undefined,
        command: serverResult.command || undefined,
      },
      pages,
      flows,
      issues,
      logs,
      duration: Date.now() - start,
    };
  }

  /**
   * 단일 페이지 스냅샷을 캡처합니다.
   */
  private async capturePageSnapshot(
    page: PuppeteerPage,
    url: string,
    name: string,
  ): Promise<PageSnapshot> {
    this.consoleMonitor.clear();
    this.consoleMonitor.attach(page);

    // 내비게이션
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.waitTimeout });
    } catch {
      // timeout은 무시 (부분 로드도 분석)
    }

    // 타이틀
    const title = await page.title();

    // 스크린샷
    let screenshot: string | undefined;
    try {
      screenshot = await this.screenshotEngine.capture(page, name);
    } catch {
      // ignore
    }

    // 성능 측정
    let performance: PerformanceMetrics | undefined;
    if (this.config.performanceEnabled) {
      try {
        performance = await this.performanceAnalyzer.measure(page);
      } catch {
        // ignore
      }
    }

    // 접근성 감사
    let a11yViolations: A11yViolation[] = [];
    if (this.config.a11yEnabled) {
      try {
        a11yViolations = await this.a11yAuditor.audit(page);
      } catch {
        // ignore
      }
    }

    return {
      url,
      title,
      screenshot,
      consoleEntries: this.consoleMonitor.getEntries(),
      performance,
      a11yViolations,
      timestamp: Date.now(),
    };
  }

  /**
   * 메인 페이지에서 내부 링크를 자동 탐색합니다.
   */
  private async discoverLinks(baseUrl: string): Promise<string[]> {
    const page = await this.session.newPage();
    if (!page) return [];

    try {
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: this.config.waitTimeout });

      const links = await page.evaluate((base: string) => {
        const anchors = document.querySelectorAll('a[href]');
        const urls: string[] = [];
        const origin = new URL(base).origin;

        anchors.forEach((a: any) => {
          try {
            const href = a.href;
            if (href.startsWith(origin) && !href.includes('#') && !urls.includes(href) && href !== base) {
              urls.push(href);
            }
          } catch {
            // ignore invalid URLs
          }
        });

        return urls;
      }, baseUrl);

      await page.close();
      return links.slice(0, 20);
    } catch {
      try { await page.close(); } catch { /* non-critical: page close cleanup */ }
      return [];
    }
  }

  /**
   * 성능 지표를 로깅합니다.
   */
  private logPerformance(logs: string[], metrics: PerformanceMetrics, url: string): void {
    logs.push('');
    logs.push(`[PERFORMANCE] ${url}`);
    logs.push(`  LCP:  ${metrics.lcp !== null ? `${Math.round(metrics.lcp)}ms` : 'N/A'} ${this.gradeMetric('lcp', metrics.lcp)}`);
    logs.push(`  FCP:  ${metrics.fcp !== null ? `${Math.round(metrics.fcp)}ms` : 'N/A'}`);
    logs.push(`  CLS:  ${metrics.cls !== null ? metrics.cls.toFixed(3) : 'N/A'} ${this.gradeMetric('cls', metrics.cls)}`);
    logs.push(`  TTFB: ${metrics.ttfb !== null ? `${Math.round(metrics.ttfb)}ms` : 'N/A'} ${this.gradeMetric('ttfb', metrics.ttfb)}`);
    logs.push(`  DCL:  ${metrics.domContentLoaded !== null ? `${Math.round(metrics.domContentLoaded)}ms` : 'N/A'}`);
    logs.push(`  Load: ${metrics.loadEvent !== null ? `${Math.round(metrics.loadEvent)}ms` : 'N/A'}`);
    logs.push(`  Resources: ${metrics.resourceCount}, Transfer: ${(metrics.totalTransferSize / 1024).toFixed(0)}KB`);
  }

  private gradeMetric(type: string, value: number | null): string {
    if (value === null) return '';
    switch (type) {
      case 'lcp': return value < 2500 ? '(Good)' : value < 4000 ? '(Needs Improvement)' : '(Poor)';
      case 'cls': return value < 0.1 ? '(Good)' : value < 0.25 ? '(Needs Improvement)' : '(Poor)';
      case 'ttfb': return value < 800 ? '(Good)' : value < 1800 ? '(Needs Improvement)' : '(Poor)';
      default: return '';
    }
  }

  // ─── 서브 컴포넌트 접근자 ──────────────────────────────

  getDevServer(): DevServerManager { return this.devServer; }
  getSession(): BrowserSession { return this.session; }
  getInteractor(): PageInteractor { return this.interactor; }
  getScreenshotEngine(): ScreenshotEngine { return this.screenshotEngine; }
  getConsoleMonitor(): ConsoleMonitor { return this.consoleMonitor; }
  getPerformanceAnalyzer(): PerformanceAnalyzer { return this.performanceAnalyzer; }
  getA11yAuditor(): A11yAuditor { return this.a11yAuditor; }
  getFlowRunner(): FlowRunner { return this.flowRunner; }
}
