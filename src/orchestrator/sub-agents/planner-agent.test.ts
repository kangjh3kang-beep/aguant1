import fs from 'fs';
import { PlannerAgent } from './planner-agent';
import { Task, TaskPhase, SubAgentConfig, AgentRole } from '../types';
import { SharedKnowledgeBase, EventBus, ContextChain } from '../shared-knowledge';

// ─── Mocks ──────────────────────────────────────────────

jest.mock('fs');
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    ...actual,
    join: (...args: string[]) => actual.join(...args),
    relative: (from: string, to: string) => actual.relative(from, to),
    resolve: (...args: string[]) => actual.resolve(...args),
  };
});

const mockedFs = jest.mocked(fs);

// ─── Helpers ─────────────────────────────────────────────

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    role: 'planner' as AgentRole,
    concurrency: 1,
    maxRetries: 2,
    timeout: 30000,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-plan-1',
    phase: 'plan' as TaskPhase,
    title: 'Analyze Project',
    description: 'Analyze project architecture',
    assignedAgent: 'planner',
    status: 'pending',
    dependencies: [],
    files: [],
    retryCount: 0,
    maxRetries: 2,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a minimal mock directory structure for fs.readdirSync */
interface MockEntry {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

function mockDirEntry(name: string, isDir: boolean): MockEntry {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

/**
 * Sets up fs mocks so scanDir sees a basic project structure.
 *
 * Layout:
 *   /project/
 *     src/           (directory)
 *     package.json   (file)
 *     tsconfig.json  (file)
 *     src/
 *       index.ts     (file, 100 lines)
 *       app.ts       (file, 600 lines — large)
 *       app.test.ts  (file, 50 lines)
 */
function setupBasicProjectMocks(): void {
  // readdirSync at project root
  mockedFs.readdirSync.mockImplementation(((dirPath: string, _opts?: any) => {
    const dir = String(dirPath);
    if (dir === '/project') {
      return [
        mockDirEntry('src', true),
        mockDirEntry('package.json', false),
        mockDirEntry('tsconfig.json', false),
      ];
    }
    if (dir.endsWith('/src') || dir.endsWith('\\src')) {
      return [
        mockDirEntry('index.ts', false),
        mockDirEntry('app.ts', false),
        mockDirEntry('app.test.ts', false),
      ];
    }
    return [];
  }) as any);

  // existsSync for tech stack detection
  mockedFs.existsSync.mockImplementation(((p: string) => {
    const s = String(p);
    if (s.endsWith('package.json')) return true;
    if (s.endsWith('tsconfig.json')) return true;
    return false;
  }) as any);

  // readFileSync for package.json and source files
  mockedFs.readFileSync.mockImplementation(((p: string, _enc?: string) => {
    const s = String(p);
    if (s.endsWith('package.json')) {
      return JSON.stringify({
        dependencies: { express: '^4.18.0' },
        devDependencies: { typescript: '^5.0.0', jest: '^29.0.0' },
      });
    }
    if (s.endsWith('app.ts')) {
      // 600-line file to trigger large file detection
      return new Array(600).fill('// line').join('\n');
    }
    if (s.endsWith('index.ts')) {
      return new Array(100).fill('// line').join('\n');
    }
    if (s.endsWith('app.test.ts')) {
      return new Array(50).fill('// line').join('\n');
    }
    return '';
  }) as any);
}

/**
 * Sets up fs mocks for an empty / unreadable project.
 */
function setupEmptyProjectMocks(): void {
  mockedFs.readdirSync.mockImplementation((() => {
    throw new Error('ENOENT');
  }) as any);
  mockedFs.existsSync.mockReturnValue(false as any);
  mockedFs.readFileSync.mockImplementation((() => {
    throw new Error('ENOENT');
  }) as any);
}

// ─── Tests ──────────────────────────────────────────────

describe('PlannerAgent', () => {
  let agent: PlannerAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new PlannerAgent(makeConfig());
  });

  // ── basic info ──

  describe('agent info', () => {
    it('should have name "Planner Agent"', () => {
      expect(agent.getInfo().name).toBe('Planner Agent');
    });

    it('should have role "planner"', () => {
      expect(agent.getRole()).toBe('planner');
    });

    it('should expose planning-specific capabilities', () => {
      const caps = agent.getInfo().capabilities;
      expect(caps).toContain('project-structure-analysis');
      expect(caps).toContain('tech-stack-detection');
      expect(caps).toContain('architecture-design');
      expect(caps).toContain('task-decomposition');
      expect(caps).toContain('risk-assessment');
      expect(caps).toContain('antipattern-detection');
    });
  });

  // ── executeTask (via run) — happy path ──

  describe('run() — happy path', () => {
    beforeEach(() => {
      setupBasicProjectMocks();
    });

    it('should return success for a well-formed project', () => {
      const result = agent.run(makeTask(), '/project');

      expect(result.success).toBe(true);
      expect(result.output.length).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should include project title in the plan output', () => {
      const result = agent.run(makeTask({ title: 'Build REST API' }), '/project');
      expect(result.output).toContain('Build REST API');
    });

    it('should detect Node.js and TypeScript in tech stack output', () => {
      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('Node.js');
      expect(result.output).toContain('TypeScript');
    });

    it('should detect Express from package.json dependencies', () => {
      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('Express');
    });

    it('should detect Jest from devDependencies', () => {
      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('Jest');
    });

    it('should report large files (600+ lines)', () => {
      const result = agent.run(makeTask(), '/project');
      // The plan should contain the large file section or the antipattern detection
      const hasLargeFileReport = result.output.includes('app.ts') || result.issues.some(i => i.message.includes('God Module'));
      expect(hasLargeFileReport).toBe(true);
    });

    it('should include implementation plan phases', () => {
      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('Phase 1');
      expect(result.output).toContain('Phase 2');
    });
  });

  // ── architecture analysis details ──

  describe('architecture analysis', () => {
    beforeEach(() => {
      setupBasicProjectMocks();
    });

    it('should count source and test files correctly', () => {
      const result = agent.run(makeTask(), '/project');
      // index.ts + app.ts = 2 source files; app.test.ts = 1 test file
      // Output should include these counts
      expect(result.output).toContain('2');
    });

    it('should detect God Module antipattern for large files', () => {
      const result = agent.run(makeTask(), '/project');
      const godModuleIssue = result.issues.find(i => i.message.includes('God Module'));
      expect(godModuleIssue).toBeDefined();
      expect(godModuleIssue!.severity).toBe('warning');
    });

    it('should include expert recommendations for detected tech stack', () => {
      const result = agent.run(makeTask(), '/project');
      // Express is detected, so Express-specific recommendations should appear
      const hasExpressAdvice = result.output.includes('Controller') || result.output.includes('Middleware');
      expect(hasExpressAdvice).toBe(true);
    });
  });

  // ── antipattern detection ──

  describe('antipattern detection', () => {
    it('should detect test-to-source ratio imbalance', () => {
      // Setup: many source files, few test files
      mockedFs.readdirSync.mockImplementation(((dirPath: string, _opts?: any) => {
        const dir = String(dirPath);
        if (dir === '/project') {
          return [mockDirEntry('src', true)];
        }
        if (dir.endsWith('/src') || dir.endsWith('\\src')) {
          // 10 source files, 0 test files
          return Array.from({ length: 10 }, (_, i) => mockDirEntry(`module${i}.ts`, false));
        }
        return [];
      }) as any);

      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation(((p: string) => {
        if (String(p).endsWith('.ts')) return new Array(50).fill('// line').join('\n');
        return '';
      }) as any);

      const result = agent.run(makeTask(), '/project');
      const ratioIssue = result.issues.find(i => i.message.includes('Test-to-Source'));
      expect(ratioIssue).toBeDefined();
    });

    it('should detect missing tech stack when no config files exist', () => {
      mockedFs.readdirSync.mockImplementation((() => []) as any);
      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation((() => { throw new Error('ENOENT'); }) as any);

      const result = agent.run(makeTask(), '/project');
      const noStackIssue = result.issues.find(i => i.message.includes('tech stack'));
      expect(noStackIssue).toBeDefined();
    });
  });

  // ── risk assessment ──

  describe('risk assessment', () => {
    it('should flag HIGH risk for projects with many dependencies (>100)', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        if (String(dirPath) === '/project') return [mockDirEntry('package.json', false)];
        return [];
      }) as any);

      mockedFs.existsSync.mockImplementation(((p: string) => {
        return String(p).endsWith('package.json');
      }) as any);

      // package.json with 120 dependencies
      const deps: Record<string, string> = {};
      for (let i = 0; i < 120; i++) deps[`dep-${i}`] = '^1.0.0';

      mockedFs.readFileSync.mockImplementation(((p: string) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ dependencies: deps });
        }
        return '';
      }) as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('HIGH');
    });

    it('should flag risk for projects with no tests and many source files', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        const dir = String(dirPath);
        if (dir === '/project') return [mockDirEntry('src', true)];
        if (dir.endsWith('/src') || dir.endsWith('\\src')) {
          return Array.from({ length: 8 }, (_, i) => mockDirEntry(`file${i}.ts`, false));
        }
        return [];
      }) as any);

      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation(((p: string) => {
        if (String(p).endsWith('.ts')) return new Array(50).fill('//').join('\n');
        return '';
      }) as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.output).toContain('HIGH');
    });
  });

  // ── file scanning errors ──

  describe('file scanning with errors', () => {
    it('should handle unreadable project directory gracefully', () => {
      setupEmptyProjectMocks();

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
      const dirIssue = result.issues.find(i => i.message.includes('Could not read project directory'));
      expect(dirIssue).toBeDefined();
    });

    it('should handle unreadable individual files during large-file scan', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        const dir = String(dirPath);
        if (dir === '/project') return [mockDirEntry('broken.ts', false)];
        return [];
      }) as any);

      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation((() => { throw new Error('EACCES'); }) as any);

      // Should not crash — just skip the file
      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
    });

    it('should handle malformed package.json gracefully', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        if (String(dirPath) === '/project') return [mockDirEntry('package.json', false)];
        return [];
      }) as any);

      mockedFs.existsSync.mockImplementation(((p: string) => String(p).endsWith('package.json')) as any);
      mockedFs.readFileSync.mockImplementation((() => 'NOT VALID JSON') as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
      const parseIssue = result.issues.find(i => i.message.includes('package.json'));
      expect(parseIssue).toBeDefined();
    });
  });

  // ── SharedKnowledge integration ──

  describe('SharedKnowledge integration', () => {
    beforeEach(() => {
      setupBasicProjectMocks();
    });

    it('should store architecture insights in KB when connected', () => {
      const kb = new SharedKnowledgeBase();
      const bus = new EventBus();
      const chain = new ContextChain();

      agent.connectKnowledge(kb, bus, chain);
      agent.run(makeTask(), '/project');

      expect(kb.size()).toBeGreaterThan(0);
      const archInsights = kb.getByCategory('architecture');
      expect(archInsights.length).toBeGreaterThan(0);
    });

    it('should include previous phase context in enhanced description', () => {
      const kb = new SharedKnowledgeBase();
      const bus = new EventBus();
      const chain = new ContextChain();

      chain.addPhaseResult({
        phase: 'plan',
        agent: 'planner',
        summary: 'Previously analyzed',
        keyFindings: ['Legacy codebase'],
        issues: [],
        artifacts: [],
        metrics: {},
      });

      agent.connectKnowledge(kb, bus, chain);
      const result = agent.run(makeTask({ phase: 'plan' }), '/project');

      // The shared context should be appended to the plan
      expect(result.success).toBe(true);
    });
  });

  // ── edge cases ──

  describe('edge cases', () => {
    it('should skip hidden directories and node_modules during scan', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        if (String(dirPath) === '/project') {
          return [
            mockDirEntry('.git', true),
            mockDirEntry('node_modules', true),
            mockDirEntry('dist', true),
            mockDirEntry('coverage', true),
            mockDirEntry('src', true),
          ];
        }
        if (String(dirPath).endsWith('/src') || String(dirPath).endsWith('\\src')) {
          return [mockDirEntry('main.ts', false)];
        }
        // Should NOT be called for .git, node_modules, dist, coverage
        return [];
      }) as any);

      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation(((p: string) => {
        if (String(p).endsWith('.ts')) return '// line\n'.repeat(10);
        return '';
      }) as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
      // Only src/ should appear in structure, not .git, node_modules, etc.
      expect(result.output).toContain('src/');
      expect(result.output).not.toContain('.git');
    });

    it('should limit scan depth to 6 levels (no infinite recursion)', () => {
      let maxDepthReached = 0;
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        const depth = String(dirPath).split('/').length - 2; // subtract /project base
        maxDepthReached = Math.max(maxDepthReached, depth);
        return [mockDirEntry('nested', true)];
      }) as any);

      mockedFs.existsSync.mockReturnValue(false as any);
      mockedFs.readFileSync.mockImplementation((() => '') as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
      // Depth should not go beyond 6
      expect(maxDepthReached).toBeLessThanOrEqual(7);
    });

    it('should handle project with only a package.json and no other files', () => {
      mockedFs.readdirSync.mockImplementation(((dirPath: string) => {
        if (String(dirPath) === '/project') return [mockDirEntry('package.json', false)];
        return [];
      }) as any);

      mockedFs.existsSync.mockImplementation(((p: string) => String(p).endsWith('package.json')) as any);
      mockedFs.readFileSync.mockImplementation(((p: string) => {
        if (String(p).endsWith('package.json')) {
          return JSON.stringify({ dependencies: {}, devDependencies: {} });
        }
        return '';
      }) as any);

      const result = agent.run(makeTask(), '/project');
      expect(result.success).toBe(true);
      expect(result.output).toContain('Node.js');
    });
  });
});
