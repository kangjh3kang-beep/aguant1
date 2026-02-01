/**
 * Tests for utils/git-diff.ts
 */

jest.mock('./process-runner');

import { runProcess } from './process-runner';
import { getChangedFiles, filterByExtension, getCurrentBranch, isGitRepo } from './git-diff';

const mockRunProcess = runProcess as jest.MockedFunction<typeof runProcess>;

function pr(stdout: string, exitCode = 0) {
  return { stdout, stderr: '', exitCode, timedOut: false };
}
function prErr(stderr: string, exitCode = 128) {
  return { stdout: '', stderr, exitCode, timedOut: false };
}

describe('git-diff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getChangedFiles', () => {
    it('returns changed files from git diff', () => {
      mockRunProcess.mockReturnValueOnce(pr('M\tsrc/index.ts\nA\tsrc/new.ts\nD\tsrc/old.ts\n'));
      mockRunProcess.mockReturnValueOnce(pr(''));

      const files = getChangedFiles('/project');
      expect(files).toEqual([
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/new.ts', status: 'added' },
        { path: 'src/old.ts', status: 'deleted' },
      ]);
      expect(mockRunProcess).toHaveBeenCalledWith('git diff --name-status HEAD', '/project', 30000);
    });

    it('includes untracked files when not staged', () => {
      mockRunProcess.mockReturnValueOnce(pr('M\tsrc/file.ts\n'));
      mockRunProcess.mockReturnValueOnce(pr('src/untracked.ts\nsrc/another.ts\n'));

      const files = getChangedFiles('/project');
      expect(files).toHaveLength(3);
      expect(files[1]).toEqual({ path: 'src/untracked.ts', status: 'added' });
      expect(files[2]).toEqual({ path: 'src/another.ts', status: 'added' });
    });

    it('uses staged diff when staged option is true', () => {
      mockRunProcess.mockReturnValueOnce(pr('A\tsrc/staged.ts\n'));

      const files = getChangedFiles('/project', { staged: true });
      expect(mockRunProcess).toHaveBeenCalledWith('git diff --cached --name-status', '/project', 30000);
      expect(files).toEqual([{ path: 'src/staged.ts', status: 'added' }]);
    });

    it('uses baseBranch diff when specified', () => {
      mockRunProcess.mockReturnValueOnce(pr('M\tsrc/feature.ts\n'));

      const files = getChangedFiles('/project', { baseBranch: 'develop' });
      expect(mockRunProcess).toHaveBeenCalledWith('git diff --name-status develop...HEAD', '/project', 30000);
      expect(files).toEqual([{ path: 'src/feature.ts', status: 'modified' }]);
    });

    it('returns empty array on git error', () => {
      mockRunProcess.mockReturnValueOnce(prErr('not a git repo'));

      const files = getChangedFiles('/not-a-repo');
      expect(files).toEqual([]);
    });

    it('handles renamed files', () => {
      mockRunProcess.mockReturnValueOnce(pr('R100\told.ts\tnew.ts\n'));
      mockRunProcess.mockReturnValueOnce(pr(''));

      const files = getChangedFiles('/project');
      expect(files[0]).toEqual({ path: 'new.ts', status: 'renamed' });
    });

    it('defaults unknown status chars to modified', () => {
      mockRunProcess.mockReturnValueOnce(pr('X\tsrc/unknown.ts\n'));
      mockRunProcess.mockReturnValueOnce(pr(''));

      const files = getChangedFiles('/project');
      expect(files[0].status).toBe('modified');
    });

    it('skips malformed lines', () => {
      mockRunProcess.mockReturnValueOnce(pr('M\tsrc/good.ts\nbadline\n\n'));
      mockRunProcess.mockReturnValueOnce(pr(''));

      const files = getChangedFiles('/project');
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/good.ts');
    });
  });

  describe('filterByExtension', () => {
    const files = [
      { path: 'src/app.ts', status: 'modified' as const },
      { path: 'src/style.css', status: 'added' as const },
      { path: 'src/index.tsx', status: 'modified' as const },
      { path: 'README.md', status: 'modified' as const },
    ];

    it('filters files by extension with dot prefix', () => {
      const result = filterByExtension(files, ['.ts', '.tsx']);
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('src/app.ts');
      expect(result[1].path).toBe('src/index.tsx');
    });

    it('accepts extensions without dot prefix', () => {
      const result = filterByExtension(files, ['css']);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/style.css');
    });

    it('returns empty array when no matches', () => {
      const result = filterByExtension(files, ['.py']);
      expect(result).toHaveLength(0);
    });
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name', () => {
      mockRunProcess.mockReturnValueOnce(pr('feature/my-branch\n'));
      expect(getCurrentBranch('/project')).toBe('feature/my-branch');
    });

    it('returns null on failure', () => {
      mockRunProcess.mockReturnValueOnce(prErr('error'));
      expect(getCurrentBranch('/project')).toBeNull();
    });

    it('returns null for empty output', () => {
      mockRunProcess.mockReturnValueOnce(pr('   '));
      expect(getCurrentBranch('/project')).toBeNull();
    });
  });

  describe('isGitRepo', () => {
    it('returns true for git repo', () => {
      mockRunProcess.mockReturnValueOnce(pr('true\n'));
      expect(isGitRepo('/project')).toBe(true);
    });

    it('returns false for non-git directory', () => {
      mockRunProcess.mockReturnValueOnce(prErr('fatal: not a git repo'));
      expect(isGitRepo('/not-a-repo')).toBe(false);
    });

    it('returns false when output is not "true"', () => {
      mockRunProcess.mockReturnValueOnce(pr('false\n'));
      expect(isGitRepo('/project')).toBe(false);
    });
  });
});
