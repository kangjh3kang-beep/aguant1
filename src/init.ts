#!/usr/bin/env node

/**
 * ag-review-init
 * 현재 프로젝트에 Antigravity Code Review Agent 설정 파일을 생성합니다.
 * 프로젝트 타입을 자동 감지하여 적절한 설정을 생성합니다.
 */

import fs from 'fs';
import path from 'path';

const CONFIG_FILENAME = 'ag-review.config.json';

interface ProjectDetection {
  hasTypeScript: boolean;
  hasEslint: boolean;
  hasJest: boolean;
  hasVitest: boolean;
  hasNextJs: boolean;
  hasReact: boolean;
  srcDir: string;
}

function detectProject(targetDir: string): ProjectDetection {
  const check = (file: string) => fs.existsSync(path.join(targetDir, file));
  const readPkg = (): Record<string, unknown> => {
    try {
      return JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8'));
    } catch (_err: unknown) {
      return {};
    }
  };

  const pkg = readPkg();
  const allDeps = {
    ...(pkg.dependencies as Record<string, string> || {}),
    ...(pkg.devDependencies as Record<string, string> || {}),
  };

  return {
    hasTypeScript: check('tsconfig.json') || 'typescript' in allDeps,
    hasEslint: check('.eslintrc.json') || check('.eslintrc.js') || check('.eslintrc.yml') || 'eslint' in allDeps,
    hasJest: check('jest.config.ts') || check('jest.config.js') || 'jest' in allDeps,
    hasVitest: 'vitest' in allDeps,
    hasNextJs: 'next' in allDeps,
    hasReact: 'react' in allDeps,
    srcDir: check('src') ? 'src' : '.',
  };
}

function buildConfig(detection: ProjectDetection) {
  const { hasTypeScript, hasEslint, hasJest, hasVitest, hasNextJs, srcDir } = detection;
  const stages: string[] = [];
  const config: Record<string, unknown> = { projectPath: '.' };

  if (hasTypeScript) {
    stages.push('compile');
    config.compileCommand = hasNextJs ? 'npx next build --no-lint' : 'npx tsc --noEmit';
  }

  if (hasEslint) {
    stages.push('lint');
    const ext = detection.hasReact ? '{ts,tsx}' : 'ts';
    config.lintCommand = hasNextJs
      ? 'npx next lint --format json'
      : `npx eslint "${srcDir}/**/*.${ext}" --format json`;
  }

  if (hasJest || hasVitest) {
    stages.push('test');
    config.testCommand = hasVitest
      ? 'npx vitest run --reporter=json'
      : 'npx jest --json --no-coverage';
  }

  if (stages.length === 0) {
    stages.push('compile', 'lint', 'test');
    config.compileCommand = 'npx tsc --noEmit';
    config.lintCommand = `npx eslint "${srcDir}/**/*.ts" --format json`;
    config.testCommand = 'npx jest --json --no-coverage';
  }

  config.stages = stages;
  config.failFast = false;
  config.verbose = true;
  return config;
}

function main(): void {
  const targetDir = process.cwd();
  const configPath = path.join(targetDir, CONFIG_FILENAME);

  if (fs.existsSync(configPath)) {
    console.log(`\n  이미 ${CONFIG_FILENAME} 파일이 존재합니다: ${configPath}`);
    console.log('  기존 설정을 유지합니다.\n');
    return;
  }

  const detection = detectProject(targetDir);
  const config = buildConfig(detection);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n  설정 파일 생성 실패: ${message}`);
    console.error('  디렉토리 쓰기 권한을 확인해주세요.\n');
    process.exit(1);
  }

  console.log('');
  console.log('========================================');
  console.log('  Antigravity Code Review Agent 초기화');
  console.log('========================================');
  console.log('');
  console.log(`  설정 파일: ${configPath}`);
  console.log('');
  console.log('  감지된 프로젝트:');
  console.log(`    TypeScript: ${detection.hasTypeScript ? 'Yes' : 'No'}`);
  console.log(`    ESLint:     ${detection.hasEslint ? 'Yes' : 'No'}`);
  console.log(`    Jest:       ${detection.hasJest ? 'Yes' : 'No'}`);
  console.log(`    Vitest:     ${detection.hasVitest ? 'Yes' : 'No'}`);
  console.log(`    Next.js:    ${detection.hasNextJs ? 'Yes' : 'No'}`);
  console.log(`    React:      ${detection.hasReact ? 'Yes' : 'No'}`);
  console.log('');
  console.log('  사용 가능한 명령어:');
  console.log('    ag-review review    전체 검증');
  console.log('    ag-review check     빠른 검증 (컴파일+린트)');
  console.log('    ag-review fix       자동 수정');
  console.log('    ag-review preview   변경 파일만 검증');
  console.log('    ag-review update    에이전트 업데이트');
  console.log('');
}

main();
