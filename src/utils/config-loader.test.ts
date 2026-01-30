import { validateConfig } from './config-loader';

describe('validateConfig', () => {
  it('should accept valid config', () => {
    const { config, errors } = validateConfig({
      stages: ['compile', 'lint', 'test'],
      compileCommand: 'npx tsc --noEmit',
      lintCommand: 'npx eslint src/',
      testCommand: 'npx jest',
      failFast: true,
      verbose: false,
    });

    expect(errors).toHaveLength(0);
    expect(config).not.toBeNull();
    expect(config?.stages).toEqual(['compile', 'lint', 'test']);
    expect(config?.failFast).toBe(true);
  });

  it('should accept partial config', () => {
    const { config, errors } = validateConfig({
      stages: ['compile'],
    });

    expect(errors).toHaveLength(0);
    expect(config?.stages).toEqual(['compile']);
  });

  it('should accept empty config', () => {
    const { config, errors } = validateConfig({});
    expect(errors).toHaveLength(0);
    expect(config).not.toBeNull();
  });

  it('should reject invalid stages', () => {
    const { errors } = validateConfig({
      stages: ['compile', 'invalid-stage'],
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('stages');
    expect(errors[0].message).toContain('invalid-stage');
  });

  it('should reject non-array stages', () => {
    const { errors } = validateConfig({
      stages: 'compile' as unknown,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('stages');
  });

  it('should reject non-string command', () => {
    const { errors } = validateConfig({
      compileCommand: 123 as unknown,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('compileCommand');
  });

  it('should reject non-boolean failFast', () => {
    const { errors } = validateConfig({
      failFast: 'yes' as unknown,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe('failFast');
  });

  it('should collect multiple errors', () => {
    const { errors } = validateConfig({
      stages: ['invalid'],
      compileCommand: 123 as unknown,
      failFast: 'yes' as unknown,
    });

    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
