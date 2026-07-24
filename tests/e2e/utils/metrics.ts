/**
 * Lightweight timing collector for the Premier CRM bot suite (Phase 2).
 *
 * Purpose: long-term regression detection ("login used to take 1s, now it
 * takes 4s") — not a pass/fail gate. Recording a slow operation never fails
 * a test; it's just data, printed at the end of a run for a human to read.
 *
 * Usage:
 *   const metrics = new MetricsCollector();
 *   const customer = await metrics.measure('Create Customer', () => context.customer());
 *   ...
 *   metrics.print(); // logs a formatted report to the console
 */

export interface MetricEntry {
  label: string;
  ms: number;
}

const REPORT_LINE_WIDTH = 24;

export class MetricsCollector {
  private entries: MetricEntry[] = [];

  /** Times `fn` and records the result under `label`, regardless of outcome. */
  async measure<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.entries.push({ label, ms: Date.now() - start });
    }
  }

  /** Manually record a duration that was measured outside of `measure()`. */
  record(label: string, ms: number): void {
    this.entries.push({ label, ms });
  }

  getEntries(): MetricEntry[] {
    return [...this.entries];
  }

  /** Formats entries as `Label..........1.1s` lines, padded to align. */
  report(): string[] {
    return this.entries.map(({ label, ms }) => {
      const seconds = `${(ms / 1000).toFixed(1)}s`;
      const dotsNeeded = Math.max(REPORT_LINE_WIDTH - label.length - seconds.length, 3);
      return `${label}${'.'.repeat(dotsNeeded)}${seconds}`;
    });
  }

  /** Prints the report to the console — call this in a test's own afterAll. */
  print(heading?: string): void {
    if (this.entries.length === 0) return;
    const lines = this.report();
    console.log(`\n${heading ? `${heading}\n` : ''}${lines.join('\n')}\n`);
  }
}
