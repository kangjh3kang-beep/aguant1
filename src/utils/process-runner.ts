import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  error?: string;
}

const BLOCKED_PATTERNS = [
  /;\s*rm\s+-rf\s/i,
  /;\s*del\s+\/s/i,
  /&&\s*rm\s+-rf\s/i,
  /\|\s*sh\s*$/i,
  /\|\s*bash\s*$/i,
  /`[^`]*`/,
  /\$\([^)]*\)/,
  />\s*\/etc\//i,
];

/**
 * 명령어에 잠재적 인젝션 패턴이 있는지 검증합니다.
 */
export function validateCommand(command: string): { valid: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, reason: `Blocked dangerous pattern in command` };
    }
  }
  return { valid: true };
}

/**
 * 프로젝트 경로가 실제 디렉토리인지 검증합니다.
 */
export function validateProjectPath(projectPath: string): { valid: boolean; reason?: string } {
  const resolved = path.resolve(projectPath);

  if (!fs.existsSync(resolved)) {
    return { valid: false, reason: `Path does not exist: ${resolved}` };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return { valid: false, reason: `Path is not a directory: ${resolved}` };
  }

  return { valid: true };
}

/**
 * 환경변수에서 민감 정보를 필터링합니다.
 */
export function buildSafeEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  const SENSITIVE_KEYS = ['AWS_SECRET', 'API_KEY', 'TOKEN', 'PASSWORD', 'SECRET', 'PRIVATE_KEY'];

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const upper = key.toUpperCase();
    const isSensitive = SENSITIVE_KEYS.some((s) => upper.includes(s));
    if (!isSensitive) {
      safeEnv[key] = value;
    }
  }
  safeEnv['FORCE_COLOR'] = '0';
  return safeEnv;
}

/**
 * 외부 프로세스를 실행하고 결과를 반환합니다.
 * 보안 검증을 수행하며, 실패 시에도 예외를 던지지 않고 결과를 반환합니다.
 */
export function runProcess(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): ProcessResult {
  const cmdCheck = validateCommand(command);
  if (!cmdCheck.valid) {
    return {
      stdout: '',
      stderr: `Security: ${cmdCheck.reason}`,
      exitCode: 126,
      timedOut: false,
      error: cmdCheck.reason,
    };
  }

  const pathCheck = validateProjectPath(cwd);
  if (!pathCheck.valid) {
    return {
      stdout: '',
      stderr: pathCheck.reason ?? 'Invalid project path',
      exitCode: 127,
      timedOut: false,
      error: pathCheck.reason,
    };
  }

  const options: ExecSyncOptionsWithStringEncoding = {
    cwd,
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: buildSafeEnv(),
    maxBuffer: 10 * 1024 * 1024,
  };

  try {
    const stdout = execSync(command, options);
    return { stdout: stdout ?? '', stderr: '', exitCode: 0, timedOut: false };
  } catch (err: unknown) {
    if (err && typeof err === 'object') {
      const execErr = err as {
        stdout?: string;
        stderr?: string;
        status?: number | null;
        killed?: boolean;
        signal?: string | null;
      };

      const timedOut = execErr.killed === true || execErr.signal === 'SIGTERM';

      return {
        stdout: execErr.stdout ?? '',
        stderr: execErr.stderr ?? '',
        exitCode: execErr.status ?? 1,
        timedOut,
        error: timedOut ? `Process timed out after ${timeoutMs}ms` : undefined,
      };
    }

    return {
      stdout: '',
      stderr: String(err),
      exitCode: 1,
      timedOut: false,
      error: 'Unexpected error during process execution',
    };
  }
}
