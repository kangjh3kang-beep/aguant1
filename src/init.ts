#!/usr/bin/env node

/**
 * ag-review-init
 * 현재 프로젝트에 Antigravity Code Review Agent 설정 파일을 생성합니다.
 */

import fs from 'fs';
import path from 'path';

const CONFIG_FILENAME = 'ag-review.config.json';

const DEFAULT_TEMPLATE = {
  projectPath: '.',
  stages: ['compile', 'lint', 'test'],
  compileCommand: 'npx tsc --noEmit',
  lintCommand: 'npx eslint "src/**/*.ts" --format json',
  testCommand: 'npx jest --json --no-coverage',
  failFast: false,
  verbose: true,
};

function main(): void {
  const targetDir = process.cwd();
  const configPath = path.join(targetDir, CONFIG_FILENAME);

  if (fs.existsSync(configPath)) {
    console.log(`\n  이미 ${CONFIG_FILENAME} 파일이 존재합니다: ${configPath}`);
    console.log('  기존 설정을 유지합니다.\n');
    return;
  }

  fs.writeFileSync(configPath, JSON.stringify(DEFAULT_TEMPLATE, null, 2) + '\n', 'utf-8');

  console.log('');
  console.log('========================================');
  console.log('  Antigravity Code Review Agent 초기화');
  console.log('========================================');
  console.log('');
  console.log(`  설정 파일 생성: ${configPath}`);
  console.log('');
  console.log('  이제 아래 명령어로 코드리뷰를 실행할 수 있습니다:');
  console.log('');
  console.log('    ag-review review          전체 검증');
  console.log('    ag-review check           빠른 검증');
  console.log('    ag-review review --json   JSON 출력');
  console.log('');
  console.log('  설정을 변경하려면 ag-review.config.json을 편집하세요.');
  console.log('');
}

main();
