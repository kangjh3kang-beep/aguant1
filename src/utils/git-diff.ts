import { runProcess } from './process-runner';

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
}

/**
 * Git diff로 변경된 파일 목록을 가져옵니다.
 * staged: true이면 staged 파일만, false이면 unstaged + untracked
 */
export function getChangedFiles(
  projectPath: string,
  options: { staged?: boolean; baseBranch?: string } = {},
): DiffFile[] {
  const { staged, baseBranch } = options;

  let cmd: string;
  if (baseBranch) {
    cmd = `git diff --name-status ${baseBranch}...HEAD`;
  } else if (staged) {
    cmd = 'git diff --cached --name-status';
  } else {
    cmd = 'git diff --name-status HEAD';
  }

  const result = runProcess(cmd, projectPath, 30_000);

  if (result.exitCode !== 0) {
    // Git이 아닌 프로젝트이거나 에러 발생
    return [];
  }

  const files: DiffFile[] = [];
  const lines = result.stdout.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const statusChar = parts[0].trim().charAt(0);
    const filePath = parts[parts.length - 1].trim();

    let status: DiffFile['status'];
    switch (statusChar) {
      case 'A':
        status = 'added';
        break;
      case 'M':
        status = 'modified';
        break;
      case 'D':
        status = 'deleted';
        break;
      case 'R':
        status = 'renamed';
        break;
      default:
        status = 'modified';
    }

    files.push({ path: filePath, status });
  }

  // untracked 파일도 포함
  if (!staged && !baseBranch) {
    const untrackedResult = runProcess(
      'git ls-files --others --exclude-standard',
      projectPath,
      30_000,
    );
    if (untrackedResult.exitCode === 0) {
      const untracked = untrackedResult.stdout.split('\n').filter((l) => l.trim());
      for (const filePath of untracked) {
        files.push({ path: filePath.trim(), status: 'added' });
      }
    }
  }

  return files;
}

/**
 * 변경된 파일 중 특정 확장자만 필터링합니다.
 */
export function filterByExtension(files: DiffFile[], extensions: string[]): DiffFile[] {
  const extSet = new Set(extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)));
  return files.filter((f) => {
    const ext = f.path.substring(f.path.lastIndexOf('.'));
    return extSet.has(ext);
  });
}

/**
 * 현재 Git 브랜치 이름을 반환합니다.
 */
export function getCurrentBranch(projectPath: string): string | null {
  const result = runProcess('git rev-parse --abbrev-ref HEAD', projectPath, 10_000);
  if (result.exitCode !== 0) return null;
  return result.stdout.trim() || null;
}

/**
 * 프로젝트가 Git 저장소인지 확인합니다.
 */
export function isGitRepo(projectPath: string): boolean {
  const result = runProcess('git rev-parse --is-inside-work-tree', projectPath, 10_000);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}
