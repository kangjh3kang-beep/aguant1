/**
 * Browser Automation Engine — Phase 7
 *
 * Re-exports all browser automation modules for convenient access.
 *
 * ━━━ Real Browser Automation ━━━
 *  · DevServerManager: Dev server auto start/stop (npm run dev, npm start, etc.)
 *  · BrowserSession: Puppeteer/puppeteer-core based headless Chrome control
 *  · PageInteractor: Page navigation, click, type, scroll, wait
 *  · ScreenshotEngine: Screenshot capture + pixel-level comparison (visual regression)
 *  · ConsoleMonitor: Real-time console error/warning collection
 *  · PerformanceAnalyzer: Core Web Vitals measurement (LCP, CLS, FID/INP)
 *  · A11yAuditor: Runtime DOM-based accessibility audit
 *  · FlowRunner: Multi-step user scenario execution
 *
 * ━━━ Graceful Degradation ━━━
 *  Falls back to static analysis mode when Puppeteer is not installed.
 *  `npm install puppeteer --save-dev` or `puppeteer-core` + system Chrome.
 */

// Types & config
export type {
  BrowserAutomationConfig,
  UserFlow,
  FlowStep,
  FlowResult,
  StepResult,
  PageSnapshot,
  ConsoleEntry,
  PerformanceMetrics,
  A11yViolation,
  BrowserAutomationResult,
  PuppeteerPage,
  PuppeteerBrowser,
  PuppeteerModule,
  TaskIssue,
} from './types';
export { DEFAULT_AUTOMATION_CONFIG, loadPuppeteer, findChromePath } from './types';

// Classes
export { DevServerManager } from './dev-server';
export { BrowserSession } from './session';
export { PageInteractor } from './interactor';
export { ScreenshotEngine } from './screenshot';
export { ConsoleMonitor } from './console-monitor';
export { PerformanceAnalyzer } from './performance';
export { A11yAuditor } from './a11y';
export { FlowRunner } from './flow-runner';
export { BrowserAutomation } from './automation';
