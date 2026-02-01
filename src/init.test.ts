/**
 * Tests for init.ts
 *
 * init.ts runs main() on import, so we test through jest.isolateModules()
 * with jest.doMock() to control fs behavior.
 */

describe('init', () => {
  let consoleSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let exitSpy: jest.SpyInstance;
  let cwdSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    cwdSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function runInit(fsMock: {
    existsSync: (p: string) => boolean;
    readFileSync?: (p: string) => string;
    writeFileSync?: jest.Mock;
  }) {
    const mockWriteFileSync = fsMock.writeFileSync || jest.fn();
    const mockReadFileSync = fsMock.readFileSync || (() => '{}');

    jest.isolateModules(() => {
      jest.doMock('fs', () => ({
        existsSync: jest.fn(fsMock.existsSync),
        readFileSync: jest.fn(mockReadFileSync),
        writeFileSync: mockWriteFileSync,
      }));
      require('./init');
    });

    return { writeFileSync: mockWriteFileSync };
  }

  it('exits early if config file already exists', () => {
    runInit({
      existsSync: (p: string) => p.includes('ag-review.config.json'),
    });

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allOutput).toContain('이미');
  });

  it('creates config for TypeScript + ESLint + Jest project', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: (p: string) => {
        if (p.includes('ag-review.config.json')) return false;
        if (p.includes('tsconfig.json')) return true;
        if (p.includes('.eslintrc.json')) return true;
        if (p.includes('jest.config.ts')) return true;
        if (p.endsWith('src')) return true;
        return false;
      },
      readFileSync: () => JSON.stringify({ dependencies: {}, devDependencies: {} }),
      writeFileSync,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const configStr = writeFileSync.mock.calls[0][1] as string;
    const config = JSON.parse(configStr.trim());
    expect(config.stages).toContain('compile');
    expect(config.stages).toContain('lint');
    expect(config.stages).toContain('test');
    expect(config.compileCommand).toContain('tsc');
    expect(config.lintCommand).toContain('eslint');
    expect(config.testCommand).toContain('jest');
  });

  it('creates config for Next.js project', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: (p: string) => {
        if (p.includes('ag-review.config.json')) return false;
        if (p.endsWith('src')) return false;
        return false;
      },
      readFileSync: () => JSON.stringify({
        dependencies: { next: '14.0.0', react: '18.0.0' },
        devDependencies: { typescript: '5.0.0', eslint: '8.0.0' },
      }),
      writeFileSync,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const configStr = writeFileSync.mock.calls[0][1] as string;
    const config = JSON.parse(configStr.trim());
    expect(config.compileCommand).toContain('next build');
    expect(config.lintCommand).toContain('next lint');
  });

  it('uses default stages when nothing detected', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: () => false,
      readFileSync: () => { throw new Error('no file'); },
      writeFileSync,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const configStr = writeFileSync.mock.calls[0][1] as string;
    const config = JSON.parse(configStr.trim());
    expect(config.stages).toEqual(['compile', 'lint', 'test', 'runtime']);
  });

  it('handles write error gracefully', () => {
    const writeFileSync = jest.fn().mockImplementation(() => {
      throw new Error('permission denied');
    });
    runInit({
      existsSync: () => false,
      readFileSync: () => { throw new Error('no pkg'); },
      writeFileSync,
    });

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('설정 파일 생성 실패'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('detects Vitest project', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: (p: string) => {
        if (p.includes('ag-review.config.json')) return false;
        if (p.endsWith('src')) return true;
        return false;
      },
      readFileSync: () => JSON.stringify({
        dependencies: {},
        devDependencies: { vitest: '1.0.0', typescript: '5.0.0' },
      }),
      writeFileSync,
    });

    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const configStr = writeFileSync.mock.calls[0][1] as string;
    const config = JSON.parse(configStr.trim());
    expect(config.testCommand).toContain('vitest');
  });

  it('detects React project with tsx extensions', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: (p: string) => {
        if (p.includes('ag-review.config.json')) return false;
        if (p.endsWith('src')) return true;
        return false;
      },
      readFileSync: () => JSON.stringify({
        dependencies: { react: '18.0.0' },
        devDependencies: { typescript: '5.0.0', eslint: '8.0.0' },
      }),
      writeFileSync,
    });

    const configStr = writeFileSync.mock.calls[0][1] as string;
    const config = JSON.parse(configStr.trim());
    expect(config.lintCommand).toContain('tsx');
  });

  it('prints initialization summary', () => {
    const writeFileSync = jest.fn();
    runInit({
      existsSync: () => false,
      readFileSync: () => { throw new Error('no pkg'); },
      writeFileSync,
    });

    const allOutput = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allOutput).toContain('Antigravity Code Review Agent 초기화');
    expect(allOutput).toContain('ag-review review');
  });
});
