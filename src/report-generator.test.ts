import { generateReport, formatReportAsText, formatReportAsJson } from './report-generator';
import { StageResult } from './types';

describe('generateReport', () => {
  const passResult: StageResult = {
    stage: 'compile',
    status: 'pass',
    issues: [],
    duration: 1000,
    summary: 'Compilation succeeded.',
  };

  const failResult: StageResult = {
    stage: 'lint',
    status: 'fail',
    issues: [
      {
        stage: 'lint',
        severity: 'error',
        file: 'src/index.ts',
        line: 5,
        message: 'Unused variable',
        rule: 'no-unused-vars',
      },
      {
        stage: 'lint',
        severity: 'warning',
        file: 'src/utils.ts',
        line: 10,
        message: 'Unexpected any',
        rule: '@typescript-eslint/no-explicit-any',
      },
    ],
    duration: 500,
    summary: '1 error, 1 warning.',
  };

  it('should generate a passing report when all stages pass', () => {
    const report = generateReport('/project', [passResult]);

    expect(report.passed).toBe(true);
    expect(report.totalIssues).toBe(0);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.duration).toBe(1000);
  });

  it('should generate a failing report when any stage fails', () => {
    const report = generateReport('/project', [passResult, failResult]);

    expect(report.passed).toBe(false);
    expect(report.totalIssues).toBe(2);
    expect(report.errorCount).toBe(1);
    expect(report.warningCount).toBe(1);
    expect(report.duration).toBe(1500);
  });

  it('should treat skip status as pass', () => {
    const skipResult: StageResult = {
      stage: 'test',
      status: 'skip',
      issues: [],
      duration: 0,
      summary: 'Skipped.',
    };
    const report = generateReport('/project', [passResult, skipResult]);
    expect(report.passed).toBe(true);
  });

  it('should correctly count info severity issues', () => {
    const infoResult: StageResult = {
      stage: 'compile',
      status: 'pass',
      issues: [
        { stage: 'compile', severity: 'info', file: 'src/a.ts', message: 'Note' },
      ],
      duration: 200,
      summary: '1 info.',
    };
    const report = generateReport('/project', [infoResult]);
    expect(report.infoCount).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('should include correct metadata', () => {
    const report = generateReport('/my/project', [passResult]);

    expect(report.projectPath).toBe('/my/project');
    expect(report.timestamp).toBeDefined();
    expect(report.stages).toHaveLength(1);
  });
});

describe('formatReportAsText', () => {
  it('should produce readable text for a passing report', () => {
    const report = generateReport('/project', [
      {
        stage: 'compile',
        status: 'pass',
        issues: [],
        duration: 100,
        summary: 'OK',
      },
    ]);

    const text = formatReportAsText(report);

    expect(text).toContain('Antigravity Code Review Report');
    expect(text).toContain('ALL CHECKS PASSED');
    expect(text).toContain('/project');
  });

  it('should show issues in failing report', () => {
    const report = generateReport('/project', [
      {
        stage: 'lint',
        status: 'fail',
        issues: [
          {
            stage: 'lint',
            severity: 'error',
            file: 'src/a.ts',
            line: 5,
            message: 'Bad code',
            suggestion: 'Fix it',
          },
        ],
        duration: 200,
        summary: '1 error',
      },
    ]);

    const text = formatReportAsText(report);

    expect(text).toContain('REVIEW FAILED');
    expect(text).toContain('src/a.ts:5');
    expect(text).toContain('Bad code');
    expect(text).toContain('Fix it');
  });
});

describe('formatReportAsJson', () => {
  it('should produce valid JSON', () => {
    const report = generateReport('/project', []);
    const json = formatReportAsJson(report);
    const parsed = JSON.parse(json);

    expect(parsed.projectPath).toBe('/project');
    expect(parsed.passed).toBe(true);
  });
});
