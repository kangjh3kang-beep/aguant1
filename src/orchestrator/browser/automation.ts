/**
 * BrowserAutomation — Main Orchestrator Class
 *
 * Coordinates all browser automation sub-components:
 *  1. Dev server start (if needed)
 *  2. Browser session start
 *  3. Main page snapshot (console, performance, accessibility)
 *  4. User flow execution (if configured)
 *  5. Visual regression comparison (if baseline exists)
 *  6. Cleanup and result return
 *
 * Falls back to static analysis mode when Puppeteer is not installed.
 */

import fs from 'fs';
import path from 'path';
import {
  BrowserAutomationConfig,
  BrowserAutomationResult,
  PageSnapshot,
  FlowResult,
  PerformanceMetrics,
  A11yViolation,
  PuppeteerPage,
  DEFAULT_AUTOMATION_CONFIG,
  loadPuppeteer,
  TaskIssue,
} from './types';
// Browser context type declarations for page.evaluate() callbacks
/* eslint-disable no-var, @typescript-eslint/no-explicit-any */
declare var document: Record<string, any>;
/* eslint-enable no-var, @typescript-eslint/no-explicit-any */

import { DevServerManager } from './dev-server';
import { BrowserSession } from './session';
import { PageInteractor } from './interactor';
import { ScreenshotEngine } from './screenshot';
import { ConsoleMonitor } from './console-monitor';
import { PerformanceAnalyzer } from './performance';
import { A11yAuditor } from './a11y';
import { FlowRunner } from './flow-runner';

export class BrowserAutomation {
  private projectPath: string;
  private config: BrowserAutomationConfig;

  // Sub-components
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
   * Run the full browser automation pipeline.
   *
   * 1. Start dev server (if needed)
   * 2. Launch browser session
   * 3. Capture main page snapshot (console, performance, accessibility)
   * 4. Execute user flows (if configured)
   * 5. Visual regression comparison (if baseline exists)
   * 6. Cleanup and return results
   *
   * Falls back to static analysis mode when Puppeteer is not installed.
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

    // 1. Check Puppeteer
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

    // 2. Start dev server
    logs.push('[STEP 1] Starting dev server...');
    const serverResult = this.devServer.start();
    logs.push(...serverResult.logs);

    const baseUrl = serverResult.url || this.config.baseUrl || `http://localhost:${this.config.devServerPort || 3000}`;

    // 3. Launch browser session
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
      // 4. Main page snapshot
      logs.push('');
      logs.push('[STEP 3] Capturing main page snapshot...');

      const mainPage = await this.session.newPage();
      if (mainPage) {
        const snapshot = await this.capturePageSnapshot(mainPage, baseUrl, 'main');
        pages.push(snapshot);
        issues.push(...this.consoleMonitor.toIssues());

        // Performance issues
        if (snapshot.performance && this.config.performanceEnabled) {
          issues.push(...this.performanceAnalyzer.toIssues(snapshot.performance, baseUrl));
          this.logPerformance(logs, snapshot.performance, baseUrl);
        }

        // Accessibility issues
        if (this.config.a11yEnabled && snapshot.a11yViolations.length > 0) {
          issues.push(...this.a11yAuditor.toIssues(snapshot.a11yViolations));
          logs.push(`[A11Y] ${snapshot.a11yViolations.length} accessibility violations found`);
          for (const v of snapshot.a11yViolations.slice(0, 10)) {
            logs.push(`  [${v.impact.toUpperCase()}] ${v.rule}: ${v.description}`);
          }
        }

        // Visual regression check
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
              } catch (err: unknown) {
                if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] baseline screenshot copy:', err instanceof Error ? err.message : String(err)); }
              }
            }
          }
        }

        // Console error logging
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

      // 5. Execute user flows
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

          // Flow console errors
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

      // 6. Additional page exploration (link-based auto-discovery)
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
      // 7. Cleanup
      await this.session.close();
      this.devServer.stop();
    }

    // Generate results
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
   * Capture a single page snapshot.
   */
  private async capturePageSnapshot(
    page: PuppeteerPage,
    url: string,
    name: string,
  ): Promise<PageSnapshot> {
    this.consoleMonitor.clear();
    this.consoleMonitor.attach(page);

    // Navigation
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: this.config.waitTimeout });
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] page navigation timeout (partial load):', err instanceof Error ? err.message : String(err)); }
    }

    // Title
    const title = await page.title();

    // Screenshot
    let screenshot: string | undefined;
    try {
      screenshot = await this.screenshotEngine.capture(page, name);
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] screenshot capture:', err instanceof Error ? err.message : String(err)); }
    }

    // Performance measurement
    let performance: PerformanceMetrics | undefined;
    if (this.config.performanceEnabled) {
      try {
        performance = await this.performanceAnalyzer.measure(page);
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] performance measurement:', err instanceof Error ? err.message : String(err)); }
      }
    }

    // Accessibility audit
    let a11yViolations: A11yViolation[] = [];
    if (this.config.a11yEnabled) {
      try {
        a11yViolations = await this.a11yAuditor.audit(page);
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] a11y audit:', err instanceof Error ? err.message : String(err)); }
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
   * Auto-discover internal links from the main page.
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
          } catch (err: unknown) {
            if (typeof process !== 'undefined' && process.env?.AG_DEBUG) { console.debug('[BrowserAutomation] invalid URL parse:', err instanceof Error ? err.message : String(err)); }
          }
        });

        return urls;
      }, baseUrl);

      await page.close();
      return links.slice(0, 20);
    } catch {
      try { await page.close(); } catch (err: unknown) { if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] page close cleanup:', err instanceof Error ? err.message : String(err)); } }
      return [];
    }
  }

  /**
   * Log performance metrics.
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

  // ─── Sub-component accessors ───────────────────────────

  getDevServer(): DevServerManager { return this.devServer; }
  getSession(): BrowserSession { return this.session; }
  getInteractor(): PageInteractor { return this.interactor; }
  getScreenshotEngine(): ScreenshotEngine { return this.screenshotEngine; }
  getConsoleMonitor(): ConsoleMonitor { return this.consoleMonitor; }
  getPerformanceAnalyzer(): PerformanceAnalyzer { return this.performanceAnalyzer; }
  getA11yAuditor(): A11yAuditor { return this.a11yAuditor; }
  getFlowRunner(): FlowRunner { return this.flowRunner; }
}
