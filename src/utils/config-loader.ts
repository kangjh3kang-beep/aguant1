import fs from 'fs';
import path from 'path';
import { AgentConfig, ReviewStage } from '../types';

const CONFIG_FILENAME = 'ag-review.config.json';

const VALID_STAGES: ReadonlySet<string> = new Set(['compile', 'lint', 'test']);

export interface ConfigValidationError {
  field: string;
  message: string;
}

/**
 * 프로젝트 경로에서 설정 파일을 탐색합니다.
 */
export function findConfigFile(projectPath: string): string | null {
  const configPath = path.join(projectPath, CONFIG_FILENAME);
  return fs.existsSync(configPath) ? configPath : null;
}

/**
 * 설정 파일을 로드하고 유효성을 검사합니다.
 * 파일이 없으면 null을 반환합니다.
 */
export function loadConfig(projectPath: string): {
  config: Partial<AgentConfig> | null;
  errors: ConfigValidationError[];
} {
  const configPath = findConfigFile(projectPath);

  if (!configPath) {
    return { config: null, errors: [] };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch (err: unknown) {
    return {
      config: null,
      errors: [{ field: 'file', message: `Cannot read config file: ${configPath}` }],
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch (_err: unknown) {
    return {
      config: null,
      errors: [{ field: 'file', message: `Invalid JSON in config file: ${configPath}` }],
    };
  }

  return validateConfig(parsed);
}

/**
 * 설정 객체의 유효성을 검사합니다.
 */
export function validateConfig(raw: Record<string, unknown>): {
  config: Partial<AgentConfig> | null;
  errors: ConfigValidationError[];
} {
  const errors: ConfigValidationError[] = [];
  const config: Partial<AgentConfig> = {};

  // stages 검증
  if (raw.stages !== undefined) {
    if (!Array.isArray(raw.stages)) {
      errors.push({ field: 'stages', message: 'stages must be an array' });
    } else {
      const invalid = raw.stages.filter((s: unknown) => typeof s !== 'string' || !VALID_STAGES.has(s));
      if (invalid.length > 0) {
        errors.push({
          field: 'stages',
          message: `Invalid stages: ${invalid.join(', ')}. Valid: compile, lint, test`,
        });
      } else {
        config.stages = raw.stages as ReviewStage[];
      }
    }
  }

  // 문자열 필드 검증
  const stringFields: Array<{ key: keyof AgentConfig; rawKey: string }> = [
    { key: 'projectPath', rawKey: 'projectPath' },
    { key: 'compileCommand', rawKey: 'compileCommand' },
    { key: 'lintCommand', rawKey: 'lintCommand' },
    { key: 'testCommand', rawKey: 'testCommand' },
  ];

  for (const { key, rawKey } of stringFields) {
    if (raw[rawKey] !== undefined) {
      if (typeof raw[rawKey] !== 'string') {
        errors.push({ field: rawKey, message: `${rawKey} must be a string` });
      } else {
        (config as Record<string, unknown>)[key] = raw[rawKey];
      }
    }
  }

  // boolean 필드 검증
  const boolFields: Array<{ key: keyof AgentConfig; rawKey: string }> = [
    { key: 'failFast', rawKey: 'failFast' },
    { key: 'verbose', rawKey: 'verbose' },
  ];

  for (const { key, rawKey } of boolFields) {
    if (raw[rawKey] !== undefined) {
      if (typeof raw[rawKey] !== 'boolean') {
        errors.push({ field: rawKey, message: `${rawKey} must be a boolean` });
      } else {
        (config as Record<string, unknown>)[key] = raw[rawKey];
      }
    }
  }

  if (errors.length > 0) {
    return { config: null, errors };
  }

  return { config, errors: [] };
}
