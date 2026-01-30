import { parseLintOutput, parseLintTextOutput } from './lint-analyzer';

describe('parseLintOutput', () => {
  it('should parse ESLint JSON output', () => {
    const jsonOutput = JSON.stringify([
      {
        filePath: '/project/src/index.ts',
        messages: [
          {
            ruleId: 'no-unused-vars',
            severity: 2,
            message: "'x' is defined but never used.",
            line: 10,
            column: 7,
          },
          {
            ruleId: '@typescript-eslint/no-explicit-any',
            severity: 1,
            message: 'Unexpected any. Specify a different type.',
            line: 15,
            column: 20,
            suggestions: [{ desc: 'Use unknown instead' }],
          },
        ],
        errorCount: 1,
        warningCount: 1,
      },
    ]);

    const issues = parseLintOutput(jsonOutput);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      stage: 'lint',
      severity: 'error',
      file: '/project/src/index.ts',
      line: 10,
      column: 7,
      message: "'x' is defined but never used.",
      rule: 'no-unused-vars',
      suggestion: undefined,
    });
    expect(issues[1]).toEqual({
      stage: 'lint',
      severity: 'warning',
      file: '/project/src/index.ts',
      line: 15,
      column: 20,
      message: 'Unexpected any. Specify a different type.',
      rule: '@typescript-eslint/no-explicit-any',
      suggestion: 'Use unknown instead',
    });
  });

  it('should fall back to text parsing for invalid JSON', () => {
    const textOutput = `/project/src/index.ts
  10:7  error  'x' is defined but never used  no-unused-vars

1 problem (1 error, 0 warnings)`;

    const issues = parseLintOutput(textOutput);

    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].file).toBe('/project/src/index.ts');
    expect(issues[0].line).toBe(10);
  });

  it('should return empty array for clean JSON output', () => {
    const jsonOutput = JSON.stringify([
      {
        filePath: '/project/src/index.ts',
        messages: [],
        errorCount: 0,
        warningCount: 0,
      },
    ]);

    const issues = parseLintOutput(jsonOutput);
    expect(issues).toHaveLength(0);
  });
});

describe('parseLintTextOutput', () => {
  it('should parse ESLint text output with file paths and errors', () => {
    const output = `/project/src/app.ts
  3:10  warning  Unexpected console statement  no-console
  8:1   error    Missing return type           @typescript-eslint/explicit-function-return-type

/project/src/utils.ts
  12:5  error  'result' is never reassigned  prefer-const`;

    const issues = parseLintTextOutput(output);

    expect(issues).toHaveLength(3);
    expect(issues[0].file).toBe('/project/src/app.ts');
    expect(issues[0].severity).toBe('warning');
    expect(issues[1].file).toBe('/project/src/app.ts');
    expect(issues[1].severity).toBe('error');
    expect(issues[2].file).toBe('/project/src/utils.ts');
    expect(issues[2].severity).toBe('error');
  });

  it('should return empty for clean output', () => {
    const issues = parseLintTextOutput('All files pass linting.');
    expect(issues).toHaveLength(0);
  });
});
