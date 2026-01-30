import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 외부 프로세스를 실행하고 결과를 반환합니다.
 * 실패 시에도 예외를 던지지 않고 결과를 반환합니다.
 */
export function runProcess(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): ProcessResult {
  const options: ExecSyncOptionsWithStringEncoding = {
    cwd,
    encoding: 'utf-8',
    timeout: timeoutMs,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  };

  try {
    const stdout = execSync(command, options);
    return { stdout: stdout ?? '', stderr: '', exitCode: 0 };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      exitCode: error.status ?? 1,
    };
  }
}
