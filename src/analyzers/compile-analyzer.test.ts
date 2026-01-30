import { parseCompileOutput } from './compile-analyzer';

describe('parseCompileOutput', () => {
  it('should parse TypeScript parenthesis format errors', () => {
    const output = `src/index.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.
src/utils.ts(25,12): error TS2339: Property 'foo' does not exist on type 'Bar'.`;

    const issues = parseCompileOutput(output);

    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      stage: 'compile',
      severity: 'error',
      file: 'src/index.ts',
      line: 10,
      column: 5,
      message: "Type 'string' is not assignable to type 'number'.",
      rule: 'TS2322',
    });
    expect(issues[1]).toEqual({
      stage: 'compile',
      severity: 'error',
      file: 'src/utils.ts',
      line: 25,
      column: 12,
      message: "Property 'foo' does not exist on type 'Bar'.",
      rule: 'TS2339',
    });
  });

  it('should parse colon-separated format errors', () => {
    const output = `src/app.ts:5:3 - error TS1005: ';' expected.`;

    const issues = parseCompileOutput(output);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      stage: 'compile',
      severity: 'error',
      file: 'src/app.ts',
      line: 5,
      column: 3,
      message: "';' expected.",
      rule: 'TS1005',
    });
  });

  it('should return empty array for clean output', () => {
    const output = `\n\n`;
    const issues = parseCompileOutput(output);
    expect(issues).toHaveLength(0);
  });

  it('should ignore non-error lines', () => {
    const output = `Starting compilation...
Found 0 errors.
Done in 1.5s.`;

    const issues = parseCompileOutput(output);
    expect(issues).toHaveLength(0);
  });
});
