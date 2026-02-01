/**
 * Planner Agent — 시니어 소프트웨어 아키텍트
 *
 * ━━━ 전문 분야 ━━━
 *  · 시스템 아키텍처 설계 (마이크로서비스, 모노리스, 이벤트 기반, CQRS)
 *  · SOLID / Clean Architecture / DDD / Hexagonal 설계 원칙
 *  · 프로젝트 구조·기술 부채·복잡도 심층 분석
 *  · 요구사항 → 구현 계획 변환, 태스크 분해 및 의존관계 맵핑
 *  · 위험 평가(Risk Assessment) 및 아키텍처 안티패턴 탐지
 *  · 확장성·유지보수성·성능 관점의 전문가 권고
 */

import fs from 'fs';
import path from 'path';
import { Task, TaskResult } from '../types';
import { BaseSubAgent } from './base-agent';
import { EnhancedPrompt } from '../prompt-enhancer';

/* ═════════════════════════════════════════════════
   전문가 지식 베이스 — Architecture Expert Knowledge
   ═════════════════════════════════════════════════ */

/** 아키텍처 안티패턴 탐지 규칙 */
interface AntiPattern {
  name: string;
  severity: 'warning' | 'error' | 'info';
  advice: string;
  check: (s: ProjectAnalysis) => boolean;
}

const ANTIPATTERNS: AntiPattern[] = [
  {
    name: 'God Module (500줄+ 파일)',
    severity: 'warning',
    advice: '단일 책임 원칙(SRP) 위반 — 모듈을 기능 단위로 분리하세요. 한 파일은 하나의 역할만 가져야 합니다.',
    check: (s) => s.largeFiles.length > 0,
  },
  {
    name: 'Missing Separation of Concerns',
    severity: 'info',
    advice: 'src/ 디렉토리가 없습니다 — 소스·테스트·설정·문서를 분리하면 유지보수성이 크게 향상됩니다.',
    check: (s) => !s.structure.includes('src/') && s.sourceFileCount > 3,
  },
  {
    name: 'Circular Dependency Risk',
    severity: 'warning',
    advice: '다수의 barrel export (index.ts) 파일이 shared 모듈 없이 존재 — 순환 참조 위험이 있습니다.',
    check: (s) => s.indexFileCount > 5 && !s.structure.some((d) => /shared|common|lib/i.test(d)),
  },
  {
    name: 'No Error Boundary (React)',
    severity: 'warning',
    advice: 'React 프로젝트에 ErrorBoundary 컴포넌트가 없습니다 — 런타임 에러 복구를 위해 필수입니다.',
    check: (s) => s.techStack.includes('React') && !s.hasFile(/error.?boundary/i),
  },
  {
    name: 'Missing API Layer Abstraction',
    severity: 'warning',
    advice: 'UI 프로젝트에 API 계층이 분리되지 않음 — services/ 또는 api/ 디렉토리로 HTTP 호출을 추상화하세요.',
    check: (s) => s.techStack.some((t) => ['React', 'Vue', 'Angular', 'Next.js'].includes(t))
      && !s.structure.some((d) => /api|service|client/i.test(d)),
  },
  {
    name: 'No Logging Infrastructure',
    severity: 'info',
    advice: '구조화된 로깅이 없음 — winston/pino 등으로 로깅 계층을 추가하여 디버깅·모니터링 역량을 확보하세요.',
    check: (s) => !s.hasFile(/logger|logging|winston|pino/i) && s.sourceFileCount > 10,
  },
  {
    name: 'Missing Environment Configuration',
    severity: 'info',
    advice: '환경 설정 템플릿(.env.example)이 없음 — 팀 개발 시 환경 변수 공유가 어렵습니다.',
    check: (s) => !s.hasFile(/\.env\.example|config\.(ts|js|json)$/),
  },
  {
    name: 'No Input Validation Layer',
    severity: 'warning',
    advice: 'API 프로젝트에 입력 검증 계층(Zod/Joi/class-validator)이 없음 — 보안 취약점의 원인이 됩니다.',
    check: (s) => s.techStack.some((t) => ['Express', 'NestJS'].includes(t))
      && !s.hasFile(/validation|validator|schema|zod|joi/i),
  },
  {
    name: 'Test-to-Source Ratio Imbalance',
    severity: 'warning',
    advice: '테스트 파일 비율이 낮음 — 소스 파일 대비 테스트 커버리지가 부족합니다.',
    check: (s) => s.sourceFileCount > 5 && s.testFileCount / s.sourceFileCount < 0.3,
  },
];

/** 기술 스택별 전문가 권장 아키텍처 */
const EXPERT_RECOMMENDATIONS: Record<string, string[]> = {
  'React': [
    'Component → Hook → Service → API 계층 분리 (관심사 분리)',
    'Co-location 패턴: 컴포넌트·스타일·테스트를 같은 폴더에 배치',
    'Barrel exports(index.ts)로 공개 API를 명시적으로 관리',
    'React.lazy + Suspense로 코드 스플리팅 → 초기 번들 크기 최적화',
    'useMemo/useCallback을 전략적으로 사용 (불필요한 메모이제이션 지양)',
    'Server State는 React Query/SWR, Client State는 Zustand/Jotai 분리',
  ],
  'Next.js': [
    'App Router: app/ 디렉토리 기반 파일 시스템 라우팅 (Pages Router 마이그레이션 권장)',
    'Server Components 우선 → 클라이언트 상태 최소화 ("use client" 최소 사용)',
    'Edge Runtime 활용으로 TTFB 최적화 (middleware에서 리다이렉트/리라이트)',
    'ISR(Incremental Static Regeneration) + On-demand Revalidation 조합',
    'Image 컴포넌트 + next/font로 Core Web Vitals 최적화',
  ],
  'Express': [
    'Controller → Service → Repository 3계층 아키텍처 (비즈니스 로직 분리)',
    'Middleware 체인: cors → helmet → rateLimit → auth → validation → handler → errorHandler',
    'DTO(Data Transfer Object)로 입출력 타입 명시 + Zod 런타임 검증',
    'Graceful shutdown: SIGTERM 처리 → 진행중 요청 완료 → DB 연결 종료 → 프로세스 종료',
    'Health check 엔드포인트(/health, /ready) 반드시 구현',
    'Request ID(correlation ID)로 분산 추적 지원',
  ],
  'NestJS': [
    'Module → Controller → Service → Repository DI 패턴 엄격 준수',
    'Guard → Interceptor → Pipe로 횡단 관심사 분리',
    'CQRS 패턴으로 읽기/쓰기 분리 (복잡한 도메인에서)',
    'Custom Exception Filter로 일관된 에러 응답 포맷',
    'OpenAPI(Swagger) 자동 문서화 (@ApiTags, @ApiResponse)',
  ],
  'TypeScript': [
    'strict: true 필수 (strictNullChecks, noImplicitAny, exactOptionalPropertyTypes)',
    'Branded Types로 도메인 타입 안전성 확보 (UserId vs string)',
    'Discriminated Union으로 상태 머신 모델링 (type Result = Success | Failure)',
    'Zod/io-ts로 런타임 타입 검증 → 외부 데이터 경계에서 파싱',
    'Readonly<T> 적극 사용 → 불변성 보장',
    'satisfies 연산자로 타입 추론 유지하면서 타입 체크',
  ],
  'Python': [
    'src/ 레이아웃 + pyproject.toml 표준 패키징 (setup.py 대신)',
    'Type hints + mypy strict 모드로 정적 타입 검증',
    'ABC(Abstract Base Class)로 인터페이스 정의',
    'Dependency Injection 패턴으로 테스트 용이성 확보',
    'Pydantic v2로 데이터 검증 및 직렬화',
  ],
  'Docker': [
    'Multi-stage build로 최종 이미지 크기 최소화',
    'non-root 사용자로 컨테이너 실행 (보안)',
    '.dockerignore로 불필요한 파일 제외',
    'HEALTHCHECK 명시',
    'Layer 캐싱 최적화: COPY package*.json → npm install → COPY . 순서',
  ],
};

/** 프로젝트 분석 결과 인터페이스 */
interface ProjectAnalysis {
  structure: string[];
  techStack: string[];
  sourceFileCount: number;
  testFileCount: number;
  totalFileCount: number;
  largeFiles: { name: string; lines: number }[];
  indexFileCount: number;
  depCount: number;
  issues: TaskResult['issues'];
  hasFile: (pattern: RegExp) => boolean;
  // 코드 메트릭
  metrics: {
    totalLines: number;
    avgFileLines: number;
    functionCount: number;
    classCount: number;
    exportCount: number;
    importGraph: Map<string, string[]>; // file → imported files
    topImported: { file: string; count: number }[];
  };
}

export class PlannerAgent extends BaseSubAgent {
  protected getAgentName(): string {
    return 'Planner Agent';
  }

  protected getCapabilities(): string[] {
    return [
      'project-structure-analysis',
      'tech-stack-detection',
      'architecture-design',
      'task-decomposition',
      'dependency-mapping',
      'risk-assessment',
      'antipattern-detection',
      'architecture-recommendation',
      'tech-debt-analysis',
      'complexity-estimation',
    ];
  }

  protected executeTask(task: Task, projectPath: string): TaskResult {
    // ── 프롬프트 강화: 간단한 태스크도 전문가급 상세 지시로 확장 ──
    const enhanced = this.enhanceTask(task);
    const enhancedTask = { ...task, description: enhanced.enhancedDescription };

    // ── SharedKnowledge: 이전 Phase 컨텍스트 참조 ──
    const sharedCtx = this.getSharedContext(task);
    if (sharedCtx) {
      enhancedTask.description += `\n\n${sharedCtx}`;
    }

    const analysis = this.analyzeProject(projectPath);
    const plan = this.generatePlan(enhancedTask, analysis, enhanced);

    // 아키텍처 안티패턴 탐지
    const antipatternIssues = this.detectAntiPatterns(analysis);
    analysis.issues.push(...antipatternIssues);

    // ── SharedKnowledge: 아키텍처 인사이트 저장 ──
    this.addInsight('architecture', 'info', `프로젝트 구조 분석: ${analysis.structure.length}개 디렉토리`,
      `기술 스택: ${analysis.techStack.join(', ')}\n디렉토리: ${analysis.structure.slice(0, 10).join(', ')}`,
      task, [], { structure: analysis.structure.slice(0, 20), techStack: analysis.techStack });

    if (antipatternIssues.length > 0) {
      this.addInsight('architecture', 'medium', `안티패턴 ${antipatternIssues.length}건 감지`,
        antipatternIssues.map((i) => i.message).join('\n'),
        task, antipatternIssues.map((i) => i.file || '').filter(Boolean));
    }

    // 리스크 인사이트 저장
    const riskIssues = analysis.issues.filter((i) => i.severity === 'warning' || i.severity === 'error');
    if (riskIssues.length > 0) {
      this.addInsight('risk', 'medium', `리스크 항목 ${riskIssues.length}건`,
        riskIssues.map((i) => `[${i.severity}] ${i.message}`).join('\n'),
        task);
    }

    return {
      success: true,
      output: plan,
      artifacts: [],
      issues: analysis.issues,
      duration: 0,
    };
  }

  /** 아키텍처 안티패턴 탐지 */
  private detectAntiPatterns(analysis: ProjectAnalysis): TaskResult['issues'] {
    const issues: TaskResult['issues'] = [];
    for (const ap of ANTIPATTERNS) {
      try {
        if (ap.check(analysis)) {
          issues.push({
            severity: ap.severity,
            message: `[Architecture] ${ap.name}: ${ap.advice}`,
            autoFixable: false,
          });
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[PlannerAgent] antipattern check:', err instanceof Error ? err.message : String(err)); }
      }
    }
    return issues;
  }

  private analyzeProject(projectPath: string): ProjectAnalysis {
    const issues: TaskResult['issues'] = [];
    const structure: string[] = [];
    const techStack: string[] = [];
    const largeFiles: { name: string; lines: number }[] = [];
    const allFiles: string[] = [];
    let sourceFileCount = 0;
    let testFileCount = 0;
    let indexFileCount = 0;

    // 프로젝트 구조 + 파일 심층 스캔
    const scanDir = (dir: string, depth: number) => {
      if (depth > 6) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(projectPath, fullPath);
          if (entry.isDirectory()) {
            if (depth === 0) structure.push(`${entry.name}/`);
            scanDir(fullPath, depth + 1);
          } else {
            if (depth === 0) structure.push(entry.name);
            allFiles.push(relPath);
            if (/index\.(ts|js)$/.test(entry.name)) indexFileCount++;
            if (/\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(entry.name)) {
              if (/\.(test|spec)\./i.test(entry.name)) {
                testFileCount++;
              } else {
                sourceFileCount++;
              }
              // 줄 수 계산 (대형 파일 감지)
              try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const lineCount = content.split('\n').length;
                if (lineCount > 500) {
                  largeFiles.push({ name: relPath, lines: lineCount });
                }
              } catch (err: unknown) {
                if (process.env.AG_DEBUG) { console.debug('[PlannerAgent] file read during scan:', err instanceof Error ? err.message : String(err)); }
              }
            }
          }
        }
      } catch (_err: unknown) {
        if (depth === 0) issues.push({ severity: 'warning', message: 'Could not read project directory', autoFixable: false });
      }
    };

    scanDir(projectPath, 0);

    // 기술 스택 감지 (확장)
    const detectors: [string, string][] = [
      ['package.json', 'Node.js'],
      ['tsconfig.json', 'TypeScript'],
      ['Cargo.toml', 'Rust'],
      ['go.mod', 'Go'],
      ['requirements.txt', 'Python'],
      ['pyproject.toml', 'Python'],
      ['pom.xml', 'Java/Maven'],
      ['build.gradle', 'Java/Gradle'],
      ['Dockerfile', 'Docker'],
      ['docker-compose.yml', 'Docker Compose'],
      ['.github/workflows', 'GitHub Actions'],
      ['next.config.js', 'Next.js'],
      ['next.config.mjs', 'Next.js'],
      ['next.config.ts', 'Next.js'],
      ['vite.config.ts', 'Vite'],
      ['vite.config.js', 'Vite'],
      ['nuxt.config.ts', 'Nuxt'],
      ['svelte.config.js', 'Svelte/SvelteKit'],
      ['tailwind.config.js', 'Tailwind CSS'],
      ['tailwind.config.ts', 'Tailwind CSS'],
      ['prisma/schema.prisma', 'Prisma'],
      ['drizzle.config.ts', 'Drizzle ORM'],
    ];

    for (const [file, tech] of detectors) {
      if (fs.existsSync(path.join(projectPath, file))) {
        if (!techStack.includes(tech)) techStack.push(tech);
      }
    }

    // package.json 의존성 심층 분석
    let depCount = 0;
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        depCount = Object.keys(allDeps).length;
        const depMap: [string, string][] = [
          ['react', 'React'], ['vue', 'Vue'], ['@angular/core', 'Angular'],
          ['express', 'Express'], ['@nestjs/core', 'NestJS'], ['fastify', 'Fastify'],
          ['jest', 'Jest'], ['vitest', 'Vitest'], ['mocha', 'Mocha'],
          ['eslint', 'ESLint'], ['prettier', 'Prettier'], ['typescript', 'TypeScript'],
          ['mongoose', 'MongoDB'], ['pg', 'PostgreSQL'], ['mysql2', 'MySQL'],
          ['redis', 'Redis'], ['graphql', 'GraphQL'], ['socket.io', 'WebSocket'],
          ['zod', 'Zod'], ['joi', 'Joi'],
          ['@trpc/server', 'tRPC'], ['webpack', 'Webpack'],
        ];
        for (const [dep, tech] of depMap) {
          if (allDeps[dep] && !techStack.includes(tech)) techStack.push(tech);
        }
      } catch (_err: unknown) {
        issues.push({ severity: 'info', message: 'Could not parse package.json', autoFixable: false });
      }
    }

    if (techStack.length === 0) {
      issues.push({ severity: 'warning', message: 'Could not detect tech stack', autoFixable: false });
    }

    // ── 코드 메트릭 수집 ──
    const metrics = this.collectCodeMetrics(projectPath, allFiles);

    return {
      structure, techStack, sourceFileCount, testFileCount,
      totalFileCount: allFiles.length, largeFiles, indexFileCount, depCount, issues,
      hasFile: (pattern) => allFiles.some((f) => pattern.test(f)),
      metrics,
    };
  }

  private generatePlan(task: Task, analysis: ProjectAnalysis, enhanced?: EnhancedPrompt): string {
    const L: string[] = [];
    L.push('╔══════════════════════════════════════════════════════════════╗');
    L.push(`║  PLAN: ${task.title.slice(0, 52).padEnd(52)}  ║`);
    L.push('╚══════════════════════════════════════════════════════════════╝');

    // ── 프로젝트 현황 ──
    L.push('');
    L.push('┌─ 프로젝트 현황 ──────────────────────────────────────────');
    L.push(`│  소스 파일:  ${analysis.sourceFileCount}개`);
    L.push(`│  테스트 파일: ${analysis.testFileCount}개 (커버리지 비율: ${analysis.sourceFileCount > 0 ? Math.round(analysis.testFileCount / analysis.sourceFileCount * 100) : 0}%)`);
    L.push(`│  전체 파일:  ${analysis.totalFileCount}개`);
    L.push(`│  의존성 수:  ${analysis.depCount}개`);
    L.push('└──────────────────────────────────────────────────────────');

    // ── 기술 스택 ──
    L.push('');
    L.push('┌─ 감지된 기술 스택 ───────────────────────────────────────');
    for (const tech of analysis.techStack) {
      L.push(`│  ● ${tech}`);
    }
    L.push('└──────────────────────────────────────────────────────────');

    // ── 프로젝트 구조 ──
    L.push('');
    L.push('┌─ 프로젝트 구조 ────────────────────────────────────────');
    for (const item of analysis.structure.slice(0, 25)) {
      L.push(`│  ${item}`);
    }
    L.push('└──────────────────────────────────────────────────────────');

    // ── 대형 파일 경고 ──
    if (analysis.largeFiles.length > 0) {
      L.push('');
      L.push('┌─ ⚡ 대형 파일 (리팩토링 권장) ──────────────────────────');
      for (const f of analysis.largeFiles.slice(0, 10)) {
        L.push(`│  ${f.name} — ${f.lines}줄 (SRP 위반 가능성)`);
      }
      L.push('└──────────────────────────────────────────────────────────');
    }

    // ── 전문가 아키텍처 권고 ──
    const recommendations = this.getExpertRecommendations(analysis.techStack);
    if (recommendations.length > 0) {
      L.push('');
      L.push('┌─ 전문가 아키텍처 권고 ─────────────────────────────────');
      for (const rec of recommendations) {
        L.push(`│  → ${rec}`);
      }
      L.push('└──────────────────────────────────────────────────────────');
    }

    // ── 태스크 설명 ──
    L.push('');
    L.push('┌─ 태스크 설명 ──────────────────────────────────────────');
    L.push(`│  ${task.description}`);
    L.push('└──────────────────────────────────────────────────────────');

    // ── 코드 메트릭 (실제 측정값) ──
    L.push('');
    L.push('┌─ 코드 메트릭 (실측) ─────────────────────────────────');
    L.push(`│  총 코드: ${analysis.metrics.totalLines.toLocaleString()}줄 (${analysis.metrics.avgFileLines}줄/파일 평균)`);
    L.push(`│  함수: ${analysis.metrics.functionCount}개 | 클래스: ${analysis.metrics.classCount}개 | export: ${analysis.metrics.exportCount}개`);
    if (analysis.metrics.topImported.length > 0) {
      L.push('│');
      L.push('│  핵심 모듈 (import 빈도순):');
      for (const m of analysis.metrics.topImported.slice(0, 5)) {
        L.push(`│    ${m.file} — ${m.count}회 참조`);
      }
    }
    L.push('└──────────────────────────────────────────────────────────');

    // ── 구현 계획 (프로젝트 분석 기반 동적 생성) ──
    L.push('');
    L.push('┌─ 구현 계획 ────────────────────────────────────────────');
    const steps = this.generateDynamicPlan(task, analysis);
    let stepNum = 1;
    for (const step of steps) {
      L.push(`│  ${stepNum++}. ${step}`);
    }
    L.push('└──────────────────────────────────────────────────────────');

    // ── 위험 평가 ──
    const risks = this.assessRisks(analysis);
    if (risks.length > 0) {
      L.push('');
      L.push('┌─ 위험 평가 ──────────────────────────────────────────');
      for (const risk of risks) {
        L.push(`│  [${risk.level}] ${risk.description}`);
        L.push(`│        대응: ${risk.mitigation}`);
      }
      L.push('└──────────────────────────────────────────────────────────');
    }

    // ── 프롬프트 강화 정보 (확장된 지시 & 사고 프레임워크) ──
    if (enhanced) {
      L.push('');
      L.push('┌─ 프롬프트 강화 적용 ────────────────────────────────────');
      L.push('│  [Prompt Enhancer] 간단한 명령이 전문가급 지시로 확장됨');

      // 사고 프레임워크 표시
      const steps = enhanced.thinkingFramework.split('\n').filter((s) => s.trim().startsWith('1') || s.trim().startsWith('2') || s.trim().startsWith('3') || s.trim().startsWith('4') || s.trim().startsWith('5'));
      if (steps.length > 0) {
        L.push('│');
        L.push('│  ── 사고 프레임워크 (Chain-of-Thought) ──');
        for (const step of steps) {
          L.push(`│  ${step.trim()}`);
        }
      }

      // 품질 체크리스트 표시
      if (enhanced.qualityChecklist.length > 0) {
        L.push('│');
        L.push('│  ── 품질 검증 체크리스트 ──');
        for (const item of enhanced.qualityChecklist) {
          L.push(`│  [ ] ${item}`);
        }
      }

      L.push('└──────────────────────────────────────────────────────────');
    }

    L.push('');
    L.push('══════════════════════════════════════════════════════════════');
    return L.join('\n');
  }

  /**
   * 프로젝트 분석 결과를 기반으로 실제 상황에 맞는 구현 계획을 동적 생성합니다.
   * 고정 템플릿이 아니라, 프로젝트 구조/크기/기술 스택에 따라 달라집니다.
   */
  private generateDynamicPlan(task: Task, analysis: ProjectAnalysis): string[] {
    const steps: string[] = [];

    // 1. 영향받는 파일 분석 (태스크 키워드 기반)
    const keywords = task.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const relevantModules = analysis.metrics.topImported
      .filter(m => keywords.some(k => m.file.toLowerCase().includes(k)))
      .slice(0, 3);

    if (relevantModules.length > 0) {
      steps.push(`영향받는 핵심 모듈 분석: ${relevantModules.map(m => m.file).join(', ')}`);
    } else {
      steps.push('기존 코드베이스에서 관련 파일 및 의존관계 식별');
    }

    // 2. 프로젝트 크기에 따른 전략
    if (analysis.sourceFileCount > 50) {
      steps.push('대규모 프로젝트 — 모듈 경계 존중, 기존 패턴 따라 구현');
    } else if (analysis.sourceFileCount > 10) {
      steps.push('중규모 프로젝트 — 기존 디렉토리 구조에 맞춰 파일 배치');
    } else {
      steps.push('소규모 프로젝트 — 핵심 기능 직접 구현');
    }

    // 3. 기술 스택별 구현 전략
    if (analysis.techStack.includes('TypeScript')) {
      steps.push('TypeScript 타입/인터페이스 먼저 정의 (type-first 접근)');
    }
    if (analysis.techStack.includes('React') || analysis.techStack.includes('Next.js')) {
      steps.push('컴포넌트 설계 → Props 타입 정의 → 렌더링 로직 구현');
    }
    if (analysis.techStack.includes('Express') || analysis.techStack.includes('NestJS') || analysis.techStack.includes('Fastify')) {
      steps.push('API 엔드포인트 라우팅 → 비즈니스 로직 → 에러 핸들링');
    }
    if (analysis.techStack.includes('Prisma') || analysis.techStack.includes('Drizzle ORM')) {
      steps.push('DB 스키마 변경 확인 → 마이그레이션 생성 → 쿼리 구현');
    }

    // 4. 테스트 전략
    if (analysis.testFileCount > 0) {
      const ratio = Math.round(analysis.testFileCount / Math.max(analysis.sourceFileCount, 1) * 100);
      steps.push(`기존 테스트(${analysis.testFileCount}개, 커버리지 ${ratio}%) 패턴에 맞춰 테스트 추가`);
    } else {
      steps.push('단위 테스트 신규 작성 (Happy path + Edge case)');
    }

    // 5. 대형 파일 리팩토링
    if (analysis.largeFiles.length > 0) {
      const biggest = analysis.largeFiles.sort((a, b) => b.lines - a.lines)[0];
      steps.push(`대형 파일 주의: ${biggest.name} (${biggest.lines}줄) — 함수 분리 필요 시 리팩토링`);
    }

    // 6. 검증
    if (analysis.techStack.includes('TypeScript')) {
      steps.push('npx tsc --noEmit 컴파일 검증');
    }
    steps.push('린트 검증 (eslint) + 테스트 실행 (jest)');
    steps.push('코드 리뷰 실행 및 발견된 이슈 해결');

    return steps;
  }

  /**
   * 소스 파일에서 실제 코드 메트릭을 수집합니다.
   * function/class 수, import 의존성 그래프, LOC 통계
   */
  private collectCodeMetrics(projectPath: string, allFiles: string[]): ProjectAnalysis['metrics'] {
    let totalLines = 0;
    let functionCount = 0;
    let classCount = 0;
    let exportCount = 0;
    let fileCount = 0;
    const importGraph = new Map<string, string[]>();
    const importedBy = new Map<string, number>();

    const sourceFiles = allFiles.filter(f =>
      /\.(ts|js|tsx|jsx)$/.test(f) && !/\.(test|spec)\./i.test(f) && !f.includes('node_modules')
    );

    for (const relFile of sourceFiles.slice(0, 200)) {
      try {
        const content = fs.readFileSync(path.join(projectPath, relFile), 'utf-8');
        const lines = content.split('\n');
        totalLines += lines.length;
        fileCount++;

        // function/class/export 카운트
        for (const line of lines) {
          if (/^\s*(?:export\s+)?(?:async\s+)?function\s/.test(line)) functionCount++;
          if (/^\s*(?:export\s+)?class\s/.test(line)) classCount++;
          if (/^\s*export\s/.test(line)) exportCount++;
        }

        // import 의존성 그래프 구축
        const imports: string[] = [];
        for (const line of lines) {
          const match = line.match(/^\s*import\s.*from\s+['"](\.[\w/.]+)['"]/);
          if (match) {
            imports.push(match[1]);
            const target = match[1];
            importedBy.set(target, (importedBy.get(target) || 0) + 1);
          }
        }
        if (imports.length > 0) {
          importGraph.set(relFile, imports);
        }
      } catch (_err: unknown) {
        // 파일 읽기 실패 무시
      }
    }

    // 가장 많이 import되는 모듈 (핵심 모듈)
    const topImported = Array.from(importedBy.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([file, count]) => ({ file, count }));

    return {
      totalLines,
      avgFileLines: fileCount > 0 ? Math.round(totalLines / fileCount) : 0,
      functionCount,
      classCount,
      exportCount,
      importGraph,
      topImported,
    };
  }

  /** 기술 스택에 맞는 전문가 권고 생성 */
  private getExpertRecommendations(techStack: string[]): string[] {
    const recs: string[] = [];
    for (const tech of techStack) {
      const advice = EXPERT_RECOMMENDATIONS[tech];
      if (advice) {
        recs.push(...advice.slice(0, 3)); // 기술당 최대 3개 권고
      }
    }
    return recs.slice(0, 12); // 최대 12개
  }

  /** 위험 평가 */
  private assessRisks(analysis: ProjectAnalysis): { level: string; description: string; mitigation: string }[] {
    const risks: { level: string; description: string; mitigation: string }[] = [];

    if (analysis.depCount > 100) {
      risks.push({
        level: 'HIGH',
        description: `의존성 ${analysis.depCount}개 — 공급망 공격 표면이 넓음`,
        mitigation: 'npm audit, Dependabot 활성화, 불필요 의존성 제거',
      });
    }

    if (analysis.largeFiles.length > 3) {
      risks.push({
        level: 'MEDIUM',
        description: `대형 파일 ${analysis.largeFiles.length}개 — 유지보수·병합 충돌 위험`,
        mitigation: '모듈 분리 리팩토링 우선 실행',
      });
    }

    if (analysis.testFileCount === 0 && analysis.sourceFileCount > 5) {
      risks.push({
        level: 'HIGH',
        description: '테스트 파일이 없음 — 회귀 버그 위험 매우 높음',
        mitigation: '핵심 비즈니스 로직부터 단위 테스트 추가',
      });
    }

    if (analysis.techStack.length > 8) {
      risks.push({
        level: 'LOW',
        description: `기술 스택 ${analysis.techStack.length}개 — 복잡도 높음`,
        mitigation: '기술 스택 통합·단순화 검토',
      });
    }

    return risks;
  }
}
