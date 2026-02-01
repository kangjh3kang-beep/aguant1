/**
 * Tests for utils/logger.ts
 */

import chalk from 'chalk';
import { logStageStart, logStageResult, logIssue, logHeader, logSummary, agWarn, agError, agDebug } from './logger';

// Disable chalk colors for predictable test output
chalk.level = 0;

describe('logger', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('logStageStart', () => {
    it('prints stage start message for compile', () => {
      logStageStart('compile');
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[COMPILE]');
      expect(output).toContain('Starting...');
    });

    it('prints stage start message for lint', () => {
      logStageStart('lint');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[LINT]');
    });

    it('prints stage start message for test', () => {
      logStageStart('test');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[TEST]');
    });
  });

  describe('logStageResult', () => {
    it('prints PASS result with duration', () => {
      logStageResult('compile', 'pass', 1234);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[COMPILE]');
      expect(output).toContain('PASS');
      expect(output).toContain('1234ms');
    });

    it('prints FAIL result', () => {
      logStageResult('lint', 'fail', 500);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[LINT]');
      expect(output).toContain('FAIL');
      expect(output).toContain('500ms');
    });

    it('prints SKIP result', () => {
      logStageResult('test', 'skip', 0);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('[TEST]');
      expect(output).toContain('SKIP');
    });

    it('prints RUNNING result', () => {
      logStageResult('compile', 'running', 100);
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('RUNNING');
    });
  });

  describe('logIssue', () => {
    it('prints error issue with file and line', () => {
      logIssue('error', 'src/index.ts', 42, 'Missing semicolon');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('ERROR');
      expect(output).toContain('src/index.ts:42');
      expect(output).toContain('Missing semicolon');
    });

    it('prints warning issue', () => {
      logIssue('warning', 'src/app.ts', 10, 'Unused variable');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('WARN');
      expect(output).toContain('src/app.ts:10');
    });

    it('prints info issue', () => {
      logIssue('info', 'src/utils.ts', undefined, 'Consider refactoring');
      const output = consoleSpy.mock.calls[0][0] as string;
      expect(output).toContain('INFO');
      expect(output).toContain('src/utils.ts');
      expect(output).not.toContain(':undefined');
    });

    it('omits line number when undefined', () => {
      logIssue('error', 'file.ts', undefined, 'msg');
      const output = consoleSpy.mock.calls[0][0] as string;
      // Should show just 'file.ts' not 'file.ts:undefined'
      expect(output).toContain('file.ts');
      expect(output).not.toContain('file.ts:');
    });
  });

  describe('logHeader', () => {
    it('prints header with project path', () => {
      logHeader('/my/project');
      expect(consoleSpy).toHaveBeenCalledTimes(6);
      const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(allOutput).toContain('Antigravity Code Review Agent');
      expect(allOutput).toContain('/my/project');
    });
  });

  describe('logSummary', () => {
    it('prints passed summary', () => {
      logSummary(true, 0, 2, 5000);
      const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(allOutput).toContain('ALL CHECKS PASSED');
      expect(allOutput).toContain('Errors:   0');
      expect(allOutput).toContain('Warnings: 2');
      expect(allOutput).toContain('5000ms');
    });

    it('prints failed summary', () => {
      logSummary(false, 3, 1, 2000);
      const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => c[0]).join('\n');
      expect(allOutput).toContain('REVIEW FAILED');
      expect(allOutput).toContain('Errors:   3');
      expect(allOutput).toContain('Warnings: 1');
      expect(allOutput).toContain('2000ms');
    });
  });

  describe('agWarn', () => {
    let warnSpy: jest.SpyInstance;
    beforeEach(() => { warnSpy = jest.spyOn(console, 'warn').mockImplementation(); });
    afterEach(() => { warnSpy.mockRestore(); });

    it('logs module name and message', () => {
      agWarn('TestModule', 'something failed');
      expect(warnSpy).toHaveBeenCalledWith('[TestModule] something failed');
    });

    it('appends error detail when provided', () => {
      agWarn('TestModule', 'operation failed', new Error('disk full'));
      expect(warnSpy).toHaveBeenCalledWith('[TestModule] operation failed: disk full');
    });

    it('handles non-Error objects', () => {
      agWarn('TestModule', 'op failed', 'string error');
      expect(warnSpy).toHaveBeenCalledWith('[TestModule] op failed: string error');
    });
  });

  describe('agError', () => {
    let errSpy: jest.SpyInstance;
    beforeEach(() => { errSpy = jest.spyOn(console, 'error').mockImplementation(); });
    afterEach(() => { errSpy.mockRestore(); });

    it('logs module name and message', () => {
      agError('TestModule', 'critical failure');
      expect(errSpy).toHaveBeenCalledWith('[TestModule] critical failure');
    });

    it('appends error detail', () => {
      agError('TestModule', 'crash', new Error('OOM'));
      expect(errSpy).toHaveBeenCalledWith('[TestModule] crash: OOM');
    });
  });

  describe('agDebug', () => {
    let debugSpy: jest.SpyInstance;
    beforeEach(() => { debugSpy = jest.spyOn(console, 'debug').mockImplementation(); });
    afterEach(() => { debugSpy.mockRestore(); delete process.env.AG_DEBUG; });

    it('logs when AG_DEBUG is set', () => {
      process.env.AG_DEBUG = '1';
      agDebug('TestModule', 'debug info');
      expect(debugSpy).toHaveBeenCalledWith('[TestModule] debug info');
    });

    it('does not log when AG_DEBUG is not set', () => {
      delete process.env.AG_DEBUG;
      agDebug('TestModule', 'debug info');
      expect(debugSpy).not.toHaveBeenCalled();
    });
  });
});
