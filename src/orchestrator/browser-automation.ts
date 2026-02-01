/**
 * Browser Automation Engine — Phase 7
 *
 * This file is a backwards-compatibility barrel that re-exports
 * everything from the modularized browser/ directory.
 *
 * The actual implementations live in:
 *   browser/types.ts          — interfaces, config, Puppeteer types
 *   browser/dev-server.ts     — DevServerManager
 *   browser/session.ts        — BrowserSession
 *   browser/interactor.ts     — PageInteractor
 *   browser/screenshot.ts     — ScreenshotEngine
 *   browser/console-monitor.ts — ConsoleMonitor
 *   browser/performance.ts    — PerformanceAnalyzer
 *   browser/a11y.ts           — A11yAuditor
 *   browser/flow-runner.ts    — FlowRunner
 *   browser/automation.ts     — BrowserAutomation (main class)
 */

export * from './browser/index';
