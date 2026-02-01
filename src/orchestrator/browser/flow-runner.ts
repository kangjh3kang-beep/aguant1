/**
 * FlowRunner — Multi-step User Scenario Execution
 *
 * Runs user flow scenarios consisting of navigation, interaction,
 * assertion, and screenshot steps.
 */

import { PuppeteerPage, UserFlow, FlowResult, StepResult, PerformanceMetrics } from './types';
import { PageInteractor } from './interactor';
import { ScreenshotEngine } from './screenshot';
import { ConsoleMonitor } from './console-monitor';
import { PerformanceAnalyzer } from './performance';

export class FlowRunner {
  private interactor: PageInteractor;
  private screenshotEngine: ScreenshotEngine;
  private consoleMonitor: ConsoleMonitor;
  private performanceAnalyzer: PerformanceAnalyzer;

  constructor(
    interactor: PageInteractor,
    screenshotEngine: ScreenshotEngine,
    consoleMonitor: ConsoleMonitor,
    performanceAnalyzer: PerformanceAnalyzer,
  ) {
    this.interactor = interactor;
    this.screenshotEngine = screenshotEngine;
    this.consoleMonitor = consoleMonitor;
    this.performanceAnalyzer = performanceAnalyzer;
  }

  /** Execute a user flow */
  async run(page: PuppeteerPage, flow: UserFlow): Promise<FlowResult> {
    const start = Date.now();
    const stepResults: StepResult[] = [];
    const screenshots: string[] = [];
    let success = true;

    this.consoleMonitor.clear();
    this.consoleMonitor.attach(page);

    for (const step of flow.steps) {
      const stepStart = Date.now();
      let stepSuccess = true;
      let error: string | undefined;
      let screenshot: string | undefined;

      try {
        switch (step.action) {
          case 'navigate':
            if (step.value) await this.interactor.navigate(page, step.value);
            break;

          case 'click':
            if (step.selector) await this.interactor.click(page, step.selector);
            break;

          case 'type':
            if (step.selector && step.value) await this.interactor.type(page, step.selector, step.value);
            break;

          case 'scroll':
            await this.interactor.scroll(page, step.scrollY || 500);
            break;

          case 'wait':
            if (step.selector) {
              stepSuccess = await this.interactor.waitFor(page, step.selector, step.timeout);
              if (!stepSuccess) error = `Element not found: ${step.selector}`;
            } else if (step.timeout) {
              await new Promise((resolve) => setTimeout(resolve, step.timeout));
            }
            break;

          case 'screenshot':
            screenshot = await this.screenshotEngine.capture(
              page,
              step.screenshotName || `${flow.name}-step-${stepResults.length}`,
            );
            screenshots.push(screenshot);
            break;

          case 'assert-text':
            if (step.value) {
              stepSuccess = await this.interactor.assertText(page, step.value);
              if (!stepSuccess) error = `Text not found: "${step.value}"`;
            }
            break;

          case 'assert-visible':
            if (step.selector) {
              stepSuccess = await this.interactor.assertVisible(page, step.selector);
              if (!stepSuccess) error = `Element not visible: ${step.selector}`;
            }
            break;

          case 'assert-url':
            if (step.value) {
              stepSuccess = await this.interactor.assertUrl(page, step.value);
              if (!stepSuccess) error = `URL mismatch: expected "${step.value}", got "${page.url()}"`;
            }
            break;

          case 'select':
            if (step.selector && step.value) await this.interactor.select(page, step.selector, step.value);
            break;

          case 'hover':
            if (step.selector) await this.interactor.hover(page, step.selector);
            break;

          case 'press-key':
            if (step.value) await this.interactor.pressKey(page, step.value);
            break;
        }
      } catch (err: unknown) {
        stepSuccess = false;
        error = err instanceof Error ? err.message : String(err);
      }

      if (!stepSuccess) success = false;

      stepResults.push({
        step,
        success: stepSuccess,
        error,
        duration: Date.now() - stepStart,
        screenshot,
      });

      // Auto-capture screenshot on failure
      if (!stepSuccess) {
        try {
          const failScreenshot = await this.screenshotEngine.capture(
            page,
            `${flow.name}-FAIL-step-${stepResults.length - 1}`,
          );
          screenshots.push(failScreenshot);
        } catch (err: unknown) {
          if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] screenshot on flow step failure:', err instanceof Error ? err.message : String(err)); }
        }
      }
    }

    // Measure performance after flow completion
    let performance: PerformanceMetrics | undefined;
    try {
      performance = await this.performanceAnalyzer.measure(page);
    } catch (err: unknown) {
      if (process.env.AG_DEBUG) { console.debug('[BrowserAutomation] flow performance measurement:', err instanceof Error ? err.message : String(err)); }
    }

    return {
      flowName: flow.name,
      success,
      steps: stepResults,
      duration: Date.now() - start,
      screenshots,
      consoleErrors: this.consoleMonitor.getErrors(),
      performance,
    };
  }
}
