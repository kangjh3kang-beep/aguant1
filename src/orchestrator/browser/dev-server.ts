/**
 * DevServerManager — Dev Server Lifecycle Management
 *
 * Automatically starts/stops development servers (npm run dev, npm start, etc.)
 */

import fs from 'fs';
import path from 'path';
import { execSync, ChildProcess, spawn } from 'child_process';
import { BrowserAutomationConfig } from './types';

export class DevServerManager {
  private process: ChildProcess | null = null;
  private projectPath: string;
  private config: BrowserAutomationConfig;
  private logs: string[] = [];
  private serverUrl: string | null = null;

  constructor(projectPath: string, config: BrowserAutomationConfig) {
    this.projectPath = projectPath;
    this.config = config;
  }

  /**
   * Start the dev server.
   * Skips if already running; auto-detects runnable commands.
   */
  start(): { started: boolean; url: string | null; command: string | null; logs: string[] } {
    this.logs = [];

    // Check if the server is already running
    const port = this.config.devServerPort || 3000;
    if (this.isPortInUse(port)) {
      this.serverUrl = `http://localhost:${port}`;
      this.logs.push(`[DEV-SERVER] Port ${port} already in use — assuming dev server is running`);
      return { started: true, url: this.serverUrl, command: null, logs: this.logs };
    }

    // If baseUrl is configured, no need to start server
    if (this.config.baseUrl) {
      this.serverUrl = this.config.baseUrl;
      this.logs.push(`[DEV-SERVER] Using configured baseUrl: ${this.serverUrl}`);
      return { started: true, url: this.serverUrl, command: null, logs: this.logs };
    }

    // Determine command
    const command = this.config.devServerCommand || this.detectDevCommand();
    if (!command) {
      this.logs.push('[DEV-SERVER] No dev server command found — skipping server startup');
      return { started: false, url: null, command: null, logs: this.logs };
    }

    this.logs.push(`[DEV-SERVER] Starting: ${command}`);

    try {
      const [cmd, ...args] = command.split(' ');
      this.process = spawn(cmd, args, {
        cwd: this.projectPath,
        env: { ...process.env, PORT: String(port), BROWSER: 'none' },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
      });

      // Wait for server to start
      const timeout = this.config.serverStartTimeout || 30000;
      const started = this.waitForServer(port, timeout);

      if (started) {
        this.serverUrl = `http://localhost:${port}`;
        this.logs.push(`[DEV-SERVER] Server ready at ${this.serverUrl}`);
        return { started: true, url: this.serverUrl, command, logs: this.logs };
      } else {
        this.logs.push(`[DEV-SERVER] Server did not start within ${timeout}ms`);
        this.stop();
        return { started: false, url: null, command, logs: this.logs };
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logs.push(`[DEV-SERVER] Failed to start: ${errMsg}`);
      return { started: false, url: null, command, logs: this.logs };
    }
  }

  /** Stop the server */
  stop(): void {
    if (this.process) {
      try {
        // Kill entire process group
        if (this.process.pid) {
          try {
            process.kill(-this.process.pid, 'SIGTERM');
          } catch {
            this.process.kill('SIGTERM');
          }
        }
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] process kill SIGTERM:', err instanceof Error ? err.message : String(err)); }
      }
      this.process = null;
      this.serverUrl = null;
    }
  }

  getUrl(): string | null {
    return this.serverUrl;
  }

  private detectDevCommand(): string | null {
    const pkgPath = path.join(this.projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        // Priority: dev > start > serve
        if (scripts.dev) return 'npm run dev';
        if (scripts.start) return 'npm start';
        if (scripts.serve) return 'npm run serve';
      } catch (err: unknown) {
        if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] package.json parse:', err instanceof Error ? err.message : String(err)); }
      }
    }

    // Python
    if (fs.existsSync(path.join(this.projectPath, 'manage.py'))) {
      return 'python manage.py runserver';
    }

    // Go
    if (fs.existsSync(path.join(this.projectPath, 'main.go'))) {
      return 'go run main.go';
    }

    return null;
  }

  private isPortInUse(port: number): boolean {
    // Security: validate port number
    const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 0;
    if (safePort === 0) return false;
    try {
      execSync(`lsof -i :${safePort} -P -n -t 2>/dev/null || ss -tlnp "sport = :${safePort}" 2>/dev/null | grep -q LISTEN`, {
        encoding: 'utf-8',
        timeout: 3000,
      });
      return true;
    } catch {
      return false;
    }
  }

  private waitForServer(port: number, timeout: number): boolean {
    // Security: validate port number
    const safePort = Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeout) {
      try {
        execSync(`node -e "const h=require('http');const r=h.get('http://localhost:${safePort}',res=>{process.exit(res.statusCode<500?0:1)});r.on('error',()=>process.exit(1));r.setTimeout(2000,()=>{r.destroy();process.exit(1)})"`, {
          timeout: 5000,
          stdio: 'ignore',
        });
        return true;
      } catch {
        // Wait
        execSync(`sleep ${interval / 1000}`, { timeout: interval + 1000 });
      }
    }

    return false;
  }
}
