import { analyzeRuntime, detectWebProject, findServerModule } from './runtime-analyzer';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

jest.mock('fs');
jest.mock('child_process');

const mockedFs = jest.mocked(fs);
const mockedSpawnSync = jest.mocked(spawnSync);

describe('runtime-analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('detectWebProject', () => {
    it('returns true when express is in dependencies', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );
      expect(detectWebProject('/project/package.json')).toBe(true);
    });

    it('returns true when fastify is in devDependencies', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ devDependencies: { fastify: '^4.0.0' } }),
      );
      expect(detectWebProject('/project/package.json')).toBe(true);
    });

    it('returns false when no web framework detected', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      );
      expect(detectWebProject('/project/package.json')).toBe(false);
    });

    it('returns false when package.json does not exist', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      expect(detectWebProject('/project/package.json')).toBe(false);
    });

    it('returns false when package.json is invalid JSON', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue('not json');
      expect(detectWebProject('/project/package.json')).toBe(false);
    });
  });

  describe('findServerModule', () => {
    it('finds web/server.js first', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        return (p as string).endsWith('web/server.js');
      });
      const result = findServerModule('/project/dist');
      expect(result).toBe(path.join('/project/dist', 'web', 'server.js'));
    });

    it('falls back to server.js', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        return (p as string).endsWith('dist/server.js') && !(p as string).includes('web');
      });
      const result = findServerModule('/project/dist');
      expect(result).toBe(path.join('/project/dist', 'server.js'));
    });

    it('returns null when no server module found', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      expect(findServerModule('/project/dist')).toBeNull();
    });
  });

  describe('analyzeRuntime', () => {
    it('fails when dist/ directory is missing', () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);

      const result = analyzeRuntime('/project');
      expect(result.stage).toBe('runtime');
      expect(result.status).toBe('fail');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].message).toContain('dist/');
    });

    it('passes when dist/ exists but no web project and no server module', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        // dist/ exists, package.json exists, but no server modules
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { lodash: '^4.0.0' } }),
      );

      const result = analyzeRuntime('/project');
      expect(result.stage).toBe('runtime');
      expect(result.status).toBe('pass');
    });

    it('warns when web project detected but no server module', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('index.html')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );

      const result = analyzeRuntime('/project');
      expect(result.status).toBe('pass');
      expect(result.issues.some((i) => i.message.includes('no server entry point'))).toBe(true);
    });

    it('warns when public/index.html is missing for web project', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('index.html')) return false;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );

      const result = analyzeRuntime('/project');
      expect(result.issues.some((i) => i.message.includes('index.html'))).toBe(true);
    });

    it('runs HTTP health check when server module found', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('web/server.js')) return true;
        if ((p as string).endsWith('index.html')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );
      (mockedSpawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          results: [
            { endpoint: '/api/project', status: 200 },
            { endpoint: '/api/team', status: 200 },
            { endpoint: '/', status: 200 },
          ],
        }),
        stderr: '',
      });

      const result = analyzeRuntime('/project');
      expect(result.status).toBe('pass');
      expect(result.summary).toContain('passed');
    });

    it('fails when server cannot start', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('web/server.js')) return true;
        if ((p as string).endsWith('index.html')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );
      (mockedSpawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: JSON.stringify({
          ok: false,
          error: 'Cannot find module express',
        }),
        stderr: '',
      });

      const result = analyzeRuntime('/project');
      expect(result.status).toBe('fail');
      expect(result.issues.some((i) => i.message.includes('Cannot find module'))).toBe(true);
    });

    it('reports failing endpoints', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('web/server.js')) return true;
        if ((p as string).endsWith('index.html')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );
      (mockedSpawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          results: [
            { endpoint: '/api/project', status: 200 },
            { endpoint: '/api/team', status: 500 },
            { endpoint: '/', status: 200 },
          ],
        }),
        stderr: '',
      });

      const result = analyzeRuntime('/project');
      expect(result.status).toBe('fail');
      expect(result.issues.some((i) => i.message.includes('/api/team') && i.message.includes('500'))).toBe(true);
    });

    it('handles process crash gracefully', () => {
      (mockedFs.existsSync as jest.Mock).mockImplementation((p: unknown) => {
        if ((p as string).endsWith('dist')) return true;
        if ((p as string).endsWith('package.json')) return true;
        if ((p as string).endsWith('web/server.js')) return true;
        if ((p as string).endsWith('index.html')) return true;
        return false;
      });
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      );
      (mockedSpawnSync as jest.Mock).mockReturnValue({
        status: 1,
        stdout: '',
        stderr: 'Segmentation fault',
      });

      const result = analyzeRuntime('/project');
      expect(result.status).toBe('fail');
      expect(result.issues.some((i) => i.message.includes('Segmentation fault'))).toBe(true);
    });
  });
});
