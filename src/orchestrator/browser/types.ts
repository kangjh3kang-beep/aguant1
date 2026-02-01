/**
 * Browser Automation Engine — Type Definitions
 *
 * Interfaces, config constants, and Puppeteer type declarations
 * used by all browser automation sub-modules.
 */
import fs from 'fs';
import { execSync } from 'child_process';
import { BrowserConfig, TaskIssue, DEFAULT_BROWSER_CONFIG } from '../types';
// Re-export TaskIssue so sub-modules can import from a single location
export type { TaskIssue };
/* eslint-enable no-var, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// ─── Type Definitions ────────────────────────────────────────
export interface BrowserAutomationConfig extends BrowserConfig {
    /** Dev server start command (auto-detectable) */
    devServerCommand?: string;
    /** Dev server port */
    devServerPort?: number;
    /** Server start timeout (ms) */
    serverStartTimeout?: number;
    /** Test scenarios */
    flows?: UserFlow[];
    /** Enable performance measurement */
    performanceEnabled?: boolean;
    /** Enable accessibility audit */
    a11yEnabled?: boolean;
    /** Enable screenshot comparison */
    visualRegressionEnabled?: boolean;
    /** Max number of pages to explore */
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
    /** Wait time (ms) - for wait action */
    timeout?: number;
    /** Screenshot filename */
    screenshotName?: string;
    /** Scroll direction/amount */
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
    /** Total resource count */
    resourceCount: number;
    /** Total transfer bytes */
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
// ─── Puppeteer Dynamic Load ──────────────────────────────────
// Puppeteer is an optional dependency, so we define minimal interfaces.
// Loaded at runtime via dynamic require().
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PuppeteerPage {
    goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
    screenshot(opts?: Record<string, unknown>): Promise<Buffer>;
    evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
    setViewport(viewport: {
        width: number;
        height: number;
    }): Promise<void>;
    close(): Promise<void>;
    on(event: string, handler: (...args: unknown[]) => void): void;
    url(): string;
    title(): Promise<string>;
    waitForSelector(selector: string, opts?: Record<string, unknown>): Promise<unknown>;
    click(selector: string, opts?: Record<string, unknown>): Promise<void>;
    type(selector: string, text: string): Promise<void>;
    select(selector: string, ...values: string[]): Promise<string[]>;
    waitForNavigation(opts?: Record<string, unknown>): Promise<unknown>;
    content(): Promise<string>;
    $eval(selector: string, fn: (el: unknown) => any): Promise<any>;
    $$eval(selector: string, fn: (els: unknown[]) => any): Promise<any>;
    hover(selector: string): Promise<void>;
    keyboard: {
        press(key: string): Promise<void>;
    };
    setUserAgent(ua: string): Promise<void>;
}
export interface PuppeteerBrowser {
    newPage(): Promise<PuppeteerPage>;
    close(): Promise<void>;
    pages(): Promise<PuppeteerPage[]>;
    isConnected(): boolean;
}
export interface PuppeteerModule {
    launch(opts?: Record<string, unknown>): Promise<PuppeteerBrowser>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
export function loadPuppeteer(): PuppeteerModule | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('puppeteer');
    }
    catch (_err: unknown) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            return require('puppeteer-core');
        }
        catch (_err2: unknown) {
            return null;
        }
    }
}
export function findChromePath(): string | undefined {
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
        if (fs.existsSync(p))
            return p;
    }
    // which / where attempt
    try {
        const result = execSync(process.platform === 'win32' ? 'where chrome' : 'which google-chrome || which chromium-browser || which chromium', { encoding: 'utf-8', timeout: 5000 }).trim();
        if (result)
            return result.split('\n')[0];
    }
    catch (err: unknown) {
        if (process.env.AG_DEBUG) {
            console.debug('[BrowserAutomation] chrome path detection:', err instanceof Error ? err.message : String(err));
        }
    }
    return undefined;
}
