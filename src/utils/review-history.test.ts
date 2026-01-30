import fs from 'fs';
import path from 'path';
import {
  getHistoryPath,
  loadHistory,
  saveToHistory,
  compareWithPrevious,
  analyzeTrend,
  formatTrendReport,
  HistoryEntry,
} from './review-history';
import { ReviewReport } from '../types';

// fs 모킹
jest.mock('fs');

const mockFs = fs as jest.Mocked<typeof fs>;

function makeReport(overrides: Partial<ReviewReport> = {}): ReviewReport {
  return {
    projectPath: '/test/project',
    timestamp: '2025-01-01T00:00:00.000Z',
    stages: [
      {
        stage: 'compile',
        status: 'pass',
        issues: [],
        duration: 100,
        summary: 'OK',
      },
      {
        stage: 'lint',
        status: 'pass',
        issues: [],
        duration: 200,
        summary: 'OK',
      },
      {
        stage: 'test',
        status: 'pass',
        issues: [],
        duration: 300,
        summary: 'OK',
      },
    ],
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    passed: true,
    duration: 600,
    ...overrides,
  };
}

function makeHistoryEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'test-id',
    timestamp: '2025-01-01T00:00:00.000Z',
    passed: true,
    errorCount: 0,
    warningCount: 0,
    totalIssues: 0,
    duration: 600,
    stages: [
      { stage: 'compile', status: 'pass', issueCount: 0, duration: 100 },
      { stage: 'lint', status: 'pass', issueCount: 0, duration: 200 },
      { stage: 'test', status: 'pass', issueCount: 0, duration: 300 },
    ],
    ...overrides,
  };
}

describe('review-history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getHistoryPath', () => {
    it('should return correct path', () => {
      const result = getHistoryPath('/my/project');
      expect(result).toBe(path.join('/my/project', '.ag-review', 'history.json'));
    });
  });

  describe('loadHistory', () => {
    it('should return empty history when file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const history = loadHistory('/test/project');

      expect(history.projectPath).toBe('/test/project');
      expect(history.entries).toEqual([]);
    });

    it('should load history from file', () => {
      const stored = {
        projectPath: '/test/project',
        entries: [makeHistoryEntry()],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const history = loadHistory('/test/project');

      expect(history.entries).toHaveLength(1);
      expect(history.entries[0].passed).toBe(true);
    });

    it('should return empty history on parse error', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json!!!');

      const history = loadHistory('/test/project');

      expect(history.entries).toEqual([]);
    });
  });

  describe('saveToHistory', () => {
    it('should save report to history file', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue('{}');

      const report = makeReport();
      const entry = saveToHistory('/test/project', report);

      expect(entry.passed).toBe(true);
      expect(entry.errorCount).toBe(0);
      expect(entry.stages).toHaveLength(3);
      expect(mockFs.mkdirSync).toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should trim history to MAX_HISTORY (100)', () => {
      const existingEntries = Array.from({ length: 100 }, (_, i) =>
        makeHistoryEntry({ id: `entry-${i}` }),
      );
      const stored = {
        projectPath: '/test/project',
        entries: existingEntries,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      // First call for loadHistory check, second for save dir check
      mockFs.existsSync
        .mockReturnValueOnce(true)   // history file exists
        .mockReturnValueOnce(true);  // dir exists
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport();
      saveToHistory('/test/project', report);

      // Check the written data has at most 100 entries
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);
      expect(writtenData.entries.length).toBeLessThanOrEqual(100);
    });

    it('should include fixReport data when present', () => {
      mockFs.existsSync.mockReturnValue(false);

      const report = makeReport({
        fixReport: {
          lintFixedCount: 5,
          snapshotsUpdated: true,
          suggestions: ['Fix A', 'Fix B'],
          duration: 150,
        },
      });

      const entry = saveToHistory('/test/project', report);

      expect(entry.fixReport).toBeDefined();
      expect(entry.fixReport?.lintFixedCount).toBe(5);
      expect(entry.fixReport?.snapshotsUpdated).toBe(true);
      expect(entry.fixReport?.suggestionCount).toBe(2);
    });
  });

  describe('compareWithPrevious', () => {
    it('should return baseline message on first run', () => {
      mockFs.existsSync.mockReturnValue(false);

      const report = makeReport();
      const insights = compareWithPrevious('/test/project', report);

      expect(insights).toHaveLength(1);
      expect(insights[0]).toContain('First review');
    });

    it('should detect error reduction', () => {
      const prevEntry = makeHistoryEntry({ errorCount: 5 });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({ errorCount: 2 });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('Errors reduced'))).toBe(true);
    });

    it('should detect new errors', () => {
      const prevEntry = makeHistoryEntry({ errorCount: 1 });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({ errorCount: 5 });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('New errors introduced'))).toBe(true);
    });

    it('should detect status improvement', () => {
      const prevEntry = makeHistoryEntry({ passed: false });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({ passed: true });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('IMPROVED'))).toBe(true);
    });

    it('should detect regression', () => {
      const prevEntry = makeHistoryEntry({ passed: true });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({ passed: false });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('REGRESSION'))).toBe(true);
    });

    it('should detect performance changes', () => {
      const prevEntry = makeHistoryEntry({ duration: 1000 });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({ duration: 500 });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('Performance improved'))).toBe(true);
    });

    it('should detect stage-level changes', () => {
      const prevEntry = makeHistoryEntry({
        stages: [
          { stage: 'compile', status: 'fail', issueCount: 3, duration: 100 },
          { stage: 'lint', status: 'pass', issueCount: 0, duration: 200 },
          { stage: 'test', status: 'pass', issueCount: 0, duration: 300 },
        ],
      });
      const stored = {
        projectPath: '/test/project',
        entries: [prevEntry],
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const report = makeReport({
        stages: [
          { stage: 'compile', status: 'pass', issues: [], duration: 100, summary: 'OK' },
          { stage: 'lint', status: 'pass', issues: [], duration: 200, summary: 'OK' },
          { stage: 'test', status: 'pass', issues: [], duration: 300, summary: 'OK' },
        ],
      });
      const insights = compareWithPrevious('/test/project', report);

      expect(insights.some((i) => i.includes('[COMPILE]') && i.includes('Fixed'))).toBe(true);
    });
  });

  describe('analyzeTrend', () => {
    it('should return zeroed analysis for empty history', () => {
      mockFs.existsSync.mockReturnValue(false);

      const trend = analyzeTrend('/test/project');

      expect(trend.totalRuns).toBe(0);
      expect(trend.passRate).toBe(0);
      expect(trend.errorTrend).toBe('stable');
    });

    it('should calculate pass rate correctly', () => {
      const entries = [
        makeHistoryEntry({ passed: true }),
        makeHistoryEntry({ passed: true }),
        makeHistoryEntry({ passed: false }),
        makeHistoryEntry({ passed: true }),
      ];
      const stored = {
        projectPath: '/test/project',
        entries,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const trend = analyzeTrend('/test/project');

      expect(trend.totalRuns).toBe(4);
      expect(trend.passRate).toBe(75);
    });

    it('should detect improving error trend', () => {
      // 10 entries: first 5 have high errors, last 5 have low errors
      const entries = [
        ...Array.from({ length: 5 }, () => makeHistoryEntry({ errorCount: 20 })),
        ...Array.from({ length: 5 }, () => makeHistoryEntry({ errorCount: 2 })),
      ];
      const stored = {
        projectPath: '/test/project',
        entries,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const trend = analyzeTrend('/test/project');

      expect(trend.errorTrend).toBe('improving');
    });

    it('should detect recurring issues (3+ consecutive fails)', () => {
      const entries = [
        makeHistoryEntry({
          stages: [
            { stage: 'compile', status: 'fail', issueCount: 3, duration: 100 },
            { stage: 'lint', status: 'pass', issueCount: 0, duration: 200 },
            { stage: 'test', status: 'pass', issueCount: 0, duration: 300 },
          ],
        }),
        makeHistoryEntry({
          stages: [
            { stage: 'compile', status: 'fail', issueCount: 2, duration: 100 },
            { stage: 'lint', status: 'pass', issueCount: 0, duration: 200 },
            { stage: 'test', status: 'pass', issueCount: 0, duration: 300 },
          ],
        }),
        makeHistoryEntry({
          stages: [
            { stage: 'compile', status: 'fail', issueCount: 1, duration: 100 },
            { stage: 'lint', status: 'pass', issueCount: 0, duration: 200 },
            { stage: 'test', status: 'pass', issueCount: 0, duration: 300 },
          ],
        }),
      ];
      const stored = {
        projectPath: '/test/project',
        entries,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const trend = analyzeTrend('/test/project');

      expect(trend.recurringIssues.length).toBeGreaterThan(0);
      expect(trend.recurringIssues[0]).toContain('compile');
      expect(trend.recurringIssues[0]).toContain('3');
    });

    it('should detect improvements from first to last entry', () => {
      const entries = [
        makeHistoryEntry({ errorCount: 10, passed: false }),
        makeHistoryEntry({ errorCount: 5, passed: false }),
        makeHistoryEntry({ errorCount: 0, passed: true }),
      ];
      const stored = {
        projectPath: '/test/project',
        entries,
        lastUpdated: '2025-01-01T00:00:00.000Z',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(stored));

      const trend = analyzeTrend('/test/project');

      expect(trend.improvements.length).toBeGreaterThan(0);
      expect(trend.improvements.some((i) => i.includes('Errors'))).toBe(true);
      expect(trend.improvements.some((i) => i.includes('passes all checks'))).toBe(true);
    });
  });

  describe('formatTrendReport', () => {
    it('should format trend as readable text', () => {
      const trend = {
        totalRuns: 10,
        passRate: 80,
        errorTrend: 'improving' as const,
        warningTrend: 'stable' as const,
        durationTrend: 'faster' as const,
        avgErrors: 5.2,
        avgWarnings: 3.1,
        avgDuration: 1500,
        recentErrors: 2.0,
        recentWarnings: 3.0,
        recentDuration: 1200,
        recurringIssues: ['compile: failing for 3 consecutive runs'],
        improvements: ['Errors: 10 -> 2'],
        regressions: [],
      };

      const text = formatTrendReport(trend);

      expect(text).toContain('Trend Analysis');
      expect(text).toContain('Total runs:    10');
      expect(text).toContain('Pass rate:     80%');
      expect(text).toContain('IMPROVING');
      expect(text).toContain('FASTER');
      expect(text).toContain('Recurring Issues');
      expect(text).toContain('compile: failing for 3 consecutive runs');
      expect(text).toContain('Improvements');
      expect(text).toContain('Errors: 10 -> 2');
    });

    it('should not show sections when empty', () => {
      const trend = {
        totalRuns: 5,
        passRate: 100,
        errorTrend: 'stable' as const,
        warningTrend: 'stable' as const,
        durationTrend: 'stable' as const,
        avgErrors: 0,
        avgWarnings: 0,
        avgDuration: 500,
        recentErrors: 0,
        recentWarnings: 0,
        recentDuration: 500,
        recurringIssues: [],
        improvements: [],
        regressions: [],
      };

      const text = formatTrendReport(trend);

      expect(text).not.toContain('Recurring Issues');
      expect(text).not.toContain('Improvements');
      expect(text).not.toContain('Regressions');
    });
  });
});
