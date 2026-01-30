import { suggestCompileFixes } from './auto-fixer';
import { StageResult } from '../types';

describe('suggestCompileFixes', () => {
  it('should suggest fix for TS2307 (module not found)', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/index.ts',
          line: 5,
          message: "Cannot find module 'lodash'",
          rule: 'TS2307',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain('Module not found');
    expect(suggestions[0]).toContain('npm install');
  });

  it('should suggest fix for TS2322 (type mismatch)', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/app.ts',
          line: 10,
          message: "Type 'string' is not assignable to type 'number'",
          rule: 'TS2322',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain('Type mismatch');
  });

  it('should suggest fix for TS2339 (property does not exist)', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/utils.ts',
          line: 3,
          message: "Property 'foo' does not exist on type 'Bar'",
          rule: 'TS2339',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain("doesn't exist");
  });

  it('should suggest fix for TS1005 (syntax error)', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/app.ts',
          line: 7,
          message: "';' expected",
          rule: 'TS1005',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain('Syntax error');
  });

  it('should handle unknown error codes with generic suggestion', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/x.ts',
          line: 1,
          message: 'Some unknown error',
          rule: 'TS9999',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toContain('TS9999');
  });

  it('should skip issues without rule code', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        {
          stage: 'compile',
          severity: 'error',
          file: 'src/x.ts',
          line: 1,
          message: 'Generic error',
        },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(0);
  });

  it('should handle multiple issues', () => {
    const result: StageResult = {
      stage: 'compile',
      status: 'fail',
      issues: [
        { stage: 'compile', severity: 'error', file: 'a.ts', line: 1, message: 'err1', rule: 'TS2307' },
        { stage: 'compile', severity: 'error', file: 'b.ts', line: 2, message: 'err2', rule: 'TS2322' },
        { stage: 'compile', severity: 'error', file: 'c.ts', line: 3, message: 'err3', rule: 'TS1005' },
      ],
      duration: 100,
      summary: 'Failed',
    };

    const suggestions = suggestCompileFixes(result);
    expect(suggestions).toHaveLength(3);
  });
});
