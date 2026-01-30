import { parseTestOutput, parseTestTextOutput } from './test-analyzer';

describe('parseTestOutput', () => {
  it('should parse Jest JSON output with failures', () => {
    const jestOutput = JSON.stringify({
      success: false,
      numTotalTests: 5,
      numPassedTests: 3,
      numFailedTests: 2,
      numPendingTests: 0,
      testResults: [
        {
          testFilePath: '/project/src/__tests__/utils.test.ts',
          testResults: [
            {
              ancestorTitles: ['Utils'],
              title: 'should add numbers',
              status: 'passed',
              failureMessages: [],
            },
            {
              ancestorTitles: ['Utils'],
              title: 'should handle edge cases',
              status: 'failed',
              failureMessages: ['Expected 1 to equal 2'],
            },
          ],
        },
        {
          testFilePath: '/project/src/__tests__/app.test.ts',
          testResults: [
            {
              ancestorTitles: ['App', 'render'],
              title: 'should render correctly',
              status: 'failed',
              failureMessages: ['Component not found'],
            },
          ],
        },
      ],
    });

    const issues = parseTestOutput(jestOutput);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      stage: 'test',
      severity: 'error',
      file: '/project/src/__tests__/utils.test.ts',
      message: 'Test failed: Utils > should handle edge cases',
      suggestion: 'Expected 1 to equal 2',
    });
    expect(issues[1]).toEqual({
      stage: 'test',
      severity: 'error',
      file: '/project/src/__tests__/app.test.ts',
      message: 'Test failed: App > render > should render correctly',
      suggestion: 'Component not found',
    });
  });

  it('should return empty for all passing tests', () => {
    const jestOutput = JSON.stringify({
      success: true,
      numTotalTests: 3,
      numPassedTests: 3,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: [
        {
          testFilePath: '/project/src/a.test.ts',
          testResults: [
            { ancestorTitles: [], title: 'works', status: 'passed', failureMessages: [] },
          ],
        },
      ],
    });

    const issues = parseTestOutput(jestOutput);
    expect(issues).toHaveLength(0);
  });

  it('should fall back to text parsing for invalid JSON', () => {
    const textOutput = `FAIL src/utils.test.ts
  ● Utils > should work

    Expected: true
    Received: false`;

    const issues = parseTestOutput(textOutput);
    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe('src/utils.test.ts');
  });
});

describe('parseTestTextOutput', () => {
  it('should parse Jest text output with failures', () => {
    const output = `PASS src/a.test.ts
FAIL src/b.test.ts
  ● MyComponent > should render

    Expected element not found
FAIL src/c.test.ts
  ● Utility > should parse

    Invalid input`;

    const issues = parseTestTextOutput(output);

    expect(issues).toHaveLength(2);
    expect(issues[0].file).toBe('src/b.test.ts');
    expect(issues[0].message).toContain('MyComponent > should render');
    expect(issues[1].file).toBe('src/c.test.ts');
    expect(issues[1].message).toContain('Utility > should parse');
  });

  it('should return empty for all passing output', () => {
    const output = `PASS src/a.test.ts
PASS src/b.test.ts

Test Suites: 2 passed, 2 total`;

    const issues = parseTestTextOutput(output);
    expect(issues).toHaveLength(0);
  });
});
