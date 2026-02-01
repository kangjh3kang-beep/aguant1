import { StageResult, ReviewIssue } from '../types';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * 런타임 헬스체크를 수행합니다.
 *
 * 빌드 산출물 존재 여부, 서버 모듈 로드, HTTP 엔드포인트 응답을 검증합니다.
 * 웹 프레임워크(express 등)가 감지되지 않으면 빌드 산출물 확인만 수행합니다.
 */
export function analyzeRuntime(
  projectPath: string,
  _command?: string,
): StageResult {
  const start = Date.now();
  const issues: ReviewIssue[] = [];

  // 1. 빌드 산출물 확인
  const distPath = path.join(projectPath, 'dist');
  if (!fs.existsSync(distPath)) {
    issues.push({
      stage: 'runtime',
      severity: 'error',
      file: 'dist/',
      message: 'Build output directory (dist/) not found. Run "npm run build" first.',
    });
    return buildResult(issues, Date.now() - start);
  }

  // 2. package.json 확인 및 웹 프로젝트 감지
  const pkgPath = path.join(projectPath, 'package.json');
  const isWeb = detectWebProject(pkgPath);

  // 3. public/index.html 확인 (웹 프로젝트인 경우)
  if (isWeb) {
    const publicIndex = path.join(projectPath, 'public', 'index.html');
    if (!fs.existsSync(publicIndex)) {
      issues.push({
        stage: 'runtime',
        severity: 'warning',
        file: 'public/index.html',
        message: 'Web project detected but public/index.html is missing.',
      });
    }
  }

  // 4. 서버 모듈 탐색
  const serverModule = findServerModule(distPath);
  if (!serverModule) {
    // 서버 모듈이 없으면 빌드 산출물 확인만으로 통과
    if (isWeb) {
      issues.push({
        stage: 'runtime',
        severity: 'warning',
        file: 'dist/',
        message: 'Web project detected but no server entry point found in dist/.',
      });
    }
    return buildResult(issues, Date.now() - start);
  }

  // 5. HTTP 헬스체크 (서버 시작 → 엔드포인트 응답 확인 → 종료)
  const healthIssues = runHttpHealthCheck(projectPath, serverModule);
  issues.push(...healthIssues);

  return buildResult(issues, Date.now() - start);
}

function buildResult(issues: ReviewIssue[], duration: number): StageResult {
  const hasErrors = issues.some((i) => i.severity === 'error');
  return {
    stage: 'runtime',
    status: hasErrors ? 'fail' : 'pass',
    issues,
    duration,
    summary: hasErrors
      ? `Runtime check failed with ${issues.length} issue(s).`
      : issues.length > 0
        ? `Runtime check passed with ${issues.length} warning(s).`
        : 'Runtime health check passed.',
  };
}

export function detectWebProject(pkgPath: string): boolean {
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };
    return 'express' in deps || 'fastify' in deps || 'koa' in deps || '@hapi/hapi' in deps;
  } catch {
    return false;
  }
}

export function findServerModule(distPath: string): string | null {
  const candidates = [
    path.join(distPath, 'web', 'server.js'),
    path.join(distPath, 'server.js'),
    path.join(distPath, 'app.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runHttpHealthCheck(projectPath: string, serverModule: string): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const port = 19876 + Math.floor(Math.random() * 1000);
  const relModule = path.relative(projectPath, serverModule);

  // Node 스크립트: 서버 시작 → 엔드포인트 확인 → JSON 결과 출력
  const script = buildHealthCheckScript(serverModule, projectPath, port);

  const result = spawnSync('node', ['-e', script], {
    cwd: projectPath,
    timeout: 15_000,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // 프로세스 실패
  if (result.status !== 0 && !result.stdout?.trim()) {
    const errLine = (result.stderr || 'Unknown error').split('\n')[0];
    issues.push({
      stage: 'runtime',
      severity: 'error',
      file: relModule,
      message: `Server health check process failed: ${errLine}`,
    });
    return issues;
  }

  // JSON 결과 파싱
  try {
    const output = JSON.parse(result.stdout.trim());
    if (!output.ok) {
      issues.push({
        stage: 'runtime',
        severity: 'error',
        file: relModule,
        message: `Server failed to start: ${output.error}`,
      });
      return issues;
    }

    // 개별 엔드포인트 결과 확인
    for (const ep of output.results ?? []) {
      if (ep.status === null || ep.status >= 500) {
        issues.push({
          stage: 'runtime',
          severity: 'error',
          file: relModule,
          message: `Endpoint ${ep.endpoint} returned HTTP ${ep.status ?? 'N/A'}${ep.error ? ': ' + ep.error : ''}`,
        });
      }
    }
  } catch {
    issues.push({
      stage: 'runtime',
      severity: 'warning',
      file: relModule,
      message: 'Could not parse health check output.',
    });
  }

  return issues;
}

function buildHealthCheckScript(serverModule: string, projectPath: string, port: number): string {
  return [
    'const http = require("http");',
    `const serverPath = ${JSON.stringify(serverModule)};`,
    `const projectPath = ${JSON.stringify(projectPath)};`,
    `const port = ${port};`,
    '',
    'const timer = setTimeout(() => {',
    '  console.log(JSON.stringify({ ok: false, error: "Server start timeout (10s)" }));',
    '  process.exit(1);',
    '}, 10000);',
    '',
    'try {',
    '  const mod = require(serverPath);',
    '  const createFn = mod.createServer || (mod.default && mod.default.createServer);',
    '  if (!createFn) {',
    '    clearTimeout(timer);',
    '    console.log(JSON.stringify({ ok: false, error: "No createServer export found in " + serverPath }));',
    '    process.exit(0);',
    '  }',
    '  const app = createFn(projectPath);',
    '  const server = app.listen(port, () => {',
    '    const endpoints = ["/api/project", "/api/team", "/"];',
    '    const results = [];',
    '    let pending = endpoints.length;',
    '    endpoints.forEach(ep => {',
    '      http.get("http://localhost:" + port + ep, { timeout: 5000 }, (res) => {',
    '        results.push({ endpoint: ep, status: res.statusCode });',
    '        res.resume();',
    '        if (--pending === 0) finish(results);',
    '      }).on("error", (err) => {',
    '        results.push({ endpoint: ep, status: null, error: err.message });',
    '        if (--pending === 0) finish(results);',
    '      });',
    '    });',
    '  });',
    '  server.on("error", (err) => {',
    '    clearTimeout(timer);',
    '    console.log(JSON.stringify({ ok: false, error: "Server listen error: " + err.message }));',
    '    process.exit(0);',
    '  });',
    '  function finish(results) {',
    '    clearTimeout(timer);',
    '    server.close();',
    '    console.log(JSON.stringify({ ok: true, results: results }));',
    '    process.exit(0);',
    '  }',
    '} catch (err) {',
    '  clearTimeout(timer);',
    '  console.log(JSON.stringify({ ok: false, error: "Module load error: " + (err.message || err) }));',
    '  process.exit(0);',
    '}',
  ].join('\n');
}
