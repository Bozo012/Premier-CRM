/**
 * future-automation-readiness-bot: placeholders for features that are on the
 * roadmap (see 01-PRD.md, ARCHITECTURE.md AI model routing, DECISIONS.md) but
 * not yet built. Keeping these here — skipped, not deleted — means the test
 * suite already has a home for them the moment each feature ships, instead of
 * someone having to remember to write QA coverage from scratch later.
 *
 * None of these should be un-skipped until the corresponding feature exists.
 */

import { test } from '@playwright/test';

test.describe('future automation readiness bot', () => {
  test.skip('AI-generated daily briefing summarizes today’s jobs accurately', async () => {
    // TODO: covers the Opus 4.7-driven daily briefing (ARCHITECTURE.md AI
    // model routing, pg_cron 5:30am trigger). Needs a way to trigger/read the
    // briefing in test rather than waiting for the real cron.
  });

  test.skip('SMS notification is sent and logged for a job status change', async () => {
    // TODO: covers Twilio integration (planned, see project memory). Will
    // need Twilio test credentials or a mocked webhook receiver — do not
    // send real SMS from this suite.
  });

  test.skip('AI vault search surfaces the right result for a natural-language query', async () => {
    // TODO: covers the semantic search / vault capability referenced in
    // ARCHITECTURE.md. Needs seeded vault items with known embeddings.
  });

  test.skip('automated report generation produces a GPT-style narrative summary', async () => {
    // TODO: covers future reporting/summarization features. Flag for a
    // product decision on output format before writing assertions.
  });

  test.skip('automation rule engine fires an action when its trigger condition is met', async () => {
    // TODO: covers packages/automation's rule engine (trigger → conditions
    // → actions). Needs a known seeded automation rule and a way to
    // trigger its condition deterministically in test.
  });

  test.skip('pricing suggestion tool returns a market-calibrated estimate', async () => {
    // TODO: covers get_pricing_suggestion AI tool (packages/ai). Needs
    // seeded historical pricing data for the suggestion to be meaningfully
    // assertable rather than just "returns something."
  });
});
