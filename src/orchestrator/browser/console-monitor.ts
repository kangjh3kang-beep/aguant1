/**
 * ConsoleMonitor — Real-time Console Error/Warning Collection
 *
 * Attaches to a Puppeteer page and captures all console output,
 * converting errors and warnings into TaskIssues.
 */

import { PuppeteerPage, ConsoleEntry, TaskIssue } from './types';

export class ConsoleMonitor {
  private entries: ConsoleEntry[] = [];

  /** Attach console listener to a Puppeteer page */
  attach(page: PuppeteerPage): void {
    this.entries = [];

    page.on('console', ((_msg: unknown) => {
      const msg = _msg as { type: () => string; text: () => string; location: () => { url?: string; lineNumber?: number } };
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
    }) as (...args: unknown[]) => void);

    page.on('pageerror', ((_err: unknown) => {
      const err = _err as Error;
      this.entries.push({
        level: 'error',
        text: `[PageError] ${err.message}`,
        timestamp: Date.now(),
      });
    }) as (...args: unknown[]) => void);
  }

  /** Return collected console logs */
  getEntries(): ConsoleEntry[] {
    return [...this.entries];
  }

  /** Return only errors/warnings */
  getErrors(): ConsoleEntry[] {
    return this.entries.filter((e) => e.level === 'error' || e.level === 'warn');
  }

  /** Convert console logs to TaskIssues */
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
