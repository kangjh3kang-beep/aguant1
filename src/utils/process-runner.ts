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
  /;\s*rm\s+-rf\s/i,        // rm -rf after semicolon
  /;\s*del\s+\/s/i,          // Windows del after semicolon
  /&&\s*rm\s+-rf\s/i,        // rm -rf after &&
  /\|\s*sh\s*$/i,            // pipe to sh
  /\|\s*bash\s*$/i,          // pipe to bash
  /`[^`]*`/,                 // backtick command substitution
  /\$\([^)]*\)/,             // $() command substitution
  />\s*\/etc\//i,            // redirect to /etc/
  /;\s*curl\s/i,             // curl after semicolon
  /;\s*wget\s/i,             // wget after semicolon
  /&&\s*curl\s/i,            // curl after &&
  /&&\s*wget\s/i,            // wget after &&
  /\|\s*tee\s/i,             // pipe to tee
  /;\s*chmod\s/i,            // chmod after semicolon
  /;\s*chown\s/i,            // chown after semicolon
  /;\s*mkfs/i,               // mkfs after semicolon
  /;\s*dd\s/i,               // dd after semicolon
  /\|\s*nc\s/i,              // pipe to netcat
  /\beval\s/i,               // eval command
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
 *
 * @param inheritEnv true이면 환경변수 필터링 없이 전체 상속 (자체 업데이트 등 신뢰 가능한 명령 전용)
 */
export function runProcess(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
  inheritEnv = false,
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

  const env = inheritEnv
    ? { ...process.env, FORCE_COLOR: '0' } as Record<string, string>
    : buildSafeEnv();

  const options: ExecSyncOptionsWithStringEncoding = {
    cwd,
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
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
