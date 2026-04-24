/**
 * Premier — Automation Engine
 *
 * Evaluates automation rules against events and executes matching actions.
 * This is the heart of location-aware behaviors but also handles non-location
 * triggers (quote_stale, scheduled_time, capture_uploaded, etc.).
 *
 * Lives in packages/automation/ (top-level package) rather than packages/ai/
 * because the engine runs without Claude — it evaluates conditions and executes
 * actions based on rules defined in the database.
 *
 * Usage:
 *   const engine = new AutomationEngine(supabase, anthropic);
 *   await engine.processEvent({ type: 'geofence_entered', payload: {...} });
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Anthropic } from '@anthropic-ai/sdk';

// =============================================================================
// TYPES
// =============================================================================

export type TriggerType =
  | 'geofence_entered'
  | 'geofence_exited'
  | 'geofence_dwelled'
  | 'approaching_geofence'
  | 'trip_started'
  | 'trip_ended'
  | 'trip_classified'
  | 'job_status_changed'
  | 'quote_sent'
  | 'quote_viewed'
  | 'quote_stale'
  | 'invoice_overdue'
  | 'scheduled_time'
  | 'capture_uploaded'
  | 'communication_received';

export interface AutomationEvent {
  type: TriggerType;
  orgId: string;
  userId?: string;
  occurredAt: Date;
  payload: Record<string, any>;
  /** Resolved context loaded when event fires (customer, job, prefs, etc.) */
  context?: EventContext;
}

export interface EventContext {
  user?: any;
  customer?: any;
  property?: any;
  job?: any;
  quote?: any;
  invoice?: any;
  geofence?: any;
  trip?: any;
  prefs?: any;
  stats?: any;
  time?: any;
}

export interface ConditionClause {
  path: string;      // dot-notation path into event + context
  op: ConditionOp;
  value: any;
}

export type ConditionOp =
  | 'equals' | 'not_equals'
  | 'in' | 'not_in'
  | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal'
  | 'is_null' | 'is_not_null'
  | 'contains' | 'not_contains'
  | 'matches_regex'
  | 'has_active_job'        // domain-specific
  | 'has_scheduled_job';

export interface AutomationAction {
  type: ActionType;
  config: Record<string, any>;
}

export type ActionType =
  | 'create_time_entry'
  | 'close_time_entry'
  | 'advance_job_status'
  | 'create_vault_item'
  | 'tag_vault_items'
  | 'send_sms'
  | 'send_email'
  | 'push_notification'
  | 'prompt_user'
  | 'create_task'
  | 'draft_invoice'
  | 'classify_trip'
  | 'skip'
  | 'run_tool';         // escape hatch: invoke an AI tool from definitions.ts

export interface AutomationRule {
  id: string;
  orgId: string;
  userId: string | null;
  name: string;
  description: string | null;
  triggerType: TriggerType;
  triggerConfig: Record<string, any>;
  conditions: ConditionClause[];
  actions: AutomationAction[];
  isEnabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: Date | null;
  appliesToCustomerIds: string[] | null;
  appliesToJobIds: string[] | null;
}

// =============================================================================
// ENGINE
// =============================================================================

export class AutomationEngine {
  constructor(
    private supabase: SupabaseClient,
    private anthropic: Anthropic,
    private services: ActionServices
  ) {}

  /**
   * Main entry point. Given an event, find matching rules and execute them.
   */
  async processEvent(event: AutomationEvent): Promise<ProcessResult> {
    // 1. Enrich event with context (customer, job, prefs, etc.)
    event.context = await this.loadContext(event);

    // 2. Load all enabled rules for this trigger type in this org
    const { data: rules, error } = await this.supabase
      .from('automation_rules')
      .select('*')
      .eq('org_id', event.orgId)
      .eq('trigger_type', event.type)
      .eq('is_enabled', true);

    if (error) throw error;
    if (!rules || rules.length === 0) return { matched: 0, executed: 0, results: [] };

    const results: RuleExecutionResult[] = [];

    for (const rawRule of rules) {
      const rule = this.parseRule(rawRule);

      // User scope check (null userId = applies to all users in org)
      if (rule.userId && event.userId && rule.userId !== event.userId) continue;

      // Customer / job scope checks
      if (rule.appliesToCustomerIds?.length && event.context.customer &&
          !rule.appliesToCustomerIds.includes(event.context.customer.id)) continue;
      if (rule.appliesToJobIds?.length && event.context.job &&
          !rule.appliesToJobIds.includes(event.context.job.id)) continue;

      // Cooldown check
      if (rule.cooldownSeconds > 0 && rule.lastTriggeredAt) {
        const elapsed = (event.occurredAt.getTime() - rule.lastTriggeredAt.getTime()) / 1000;
        if (elapsed < rule.cooldownSeconds) {
          results.push({ ruleId: rule.id, outcome: 'skipped', reason: 'cooldown' });
          continue;
        }
      }

      // Evaluate conditions
      const conditionResult = this.evaluateConditions(rule.conditions, event);
      if (!conditionResult.passed) {
        await this.logEvent(rule, event, {
          conditionsPassed: false,
          conditionsFailedAt: conditionResult.failedAt,
          outcome: 'skipped',
        });
        results.push({
          ruleId: rule.id,
          outcome: 'skipped',
          reason: `condition ${conditionResult.failedAt} failed`
        });
        continue;
      }

      // Execute actions
      try {
        const actionResults = await this.executeActions(rule.actions, event);
        await this.logEvent(rule, event, {
          conditionsPassed: true,
          actionsExecuted: actionResults,
          outcome: actionResults.every(r => r.status === 'ok') ? 'succeeded' : 'partial',
        });
        await this.incrementRuleStats(rule.id, event.occurredAt);
        results.push({
          ruleId: rule.id,
          outcome: 'executed',
          actionResults
        });
      } catch (err: any) {
        await this.logEvent(rule, event, {
          conditionsPassed: true,
          outcome: 'failed',
          errorMessage: err.message,
        });
        results.push({
          ruleId: rule.id,
          outcome: 'failed',
          error: err.message
        });
      }
    }

    return {
      matched: results.filter(r => r.outcome !== 'skipped').length,
      executed: results.filter(r => r.outcome === 'executed').length,
      results,
    };
  }

  // ===========================================================================
  // CONTEXT LOADING
  // ===========================================================================

  private async loadContext(event: AutomationEvent): Promise<EventContext> {
    const ctx: EventContext = {};
    const payload = event.payload;

    // Load user
    if (event.userId) {
      const { data } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', event.userId)
        .single();
      ctx.user = data;
    }

    // Load geofence + cascading entities
    if (payload.geofence_id) {
      const { data: fence } = await this.supabase
        .from('geofences')
        .select('*, property:properties(*), job:jobs(*)')
        .eq('id', payload.geofence_id)
        .single();
      ctx.geofence = fence;
      if (fence?.property) ctx.property = fence.property;
      if (fence?.job) ctx.job = fence.job;
    }

    // If property known, load primary customer and active job
    if (ctx.property && !ctx.customer) {
      const { data: cp } = await this.supabase
        .from('customer_properties')
        .select('customer:customers(*)')
        .eq('property_id', ctx.property.id)
        .eq('is_primary', true)
        .maybeSingle();
      ctx.customer = (cp as any)?.customer;
    }

    if (ctx.property && !ctx.job) {
      const { data: job } = await this.supabase
        .from('jobs')
        .select('*')
        .eq('property_id', ctx.property.id)
        .in('status', ['scheduled', 'in_progress', 'approved'])
        .order('scheduled_start', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      ctx.job = job;
    }

    // Direct references in payload
    if (payload.job_id && !ctx.job) {
      const { data } = await this.supabase.from('jobs').select('*').eq('id', payload.job_id).single();
      ctx.job = data;
    }
    if (payload.quote_id) {
      const { data } = await this.supabase.from('quotes').select('*').eq('id', payload.quote_id).single();
      ctx.quote = data;
    }
    if (payload.invoice_id) {
      const { data } = await this.supabase.from('invoices').select('*').eq('id', payload.invoice_id).single();
      ctx.invoice = data;
    }

    // Load effective prefs via DB function
    if (event.userId) {
      const { data: prefs } = await this.supabase.rpc('get_effective_location_prefs', {
        p_user_id: event.userId,
        p_customer_id: ctx.customer?.id ?? null,
        p_job_id: ctx.job?.id ?? null,
      });
      ctx.prefs = prefs;
    }

    // Time context
    const now = event.occurredAt;
    ctx.time = {
      now_iso: now.toISOString(),
      hour: now.getHours(),
      day_of_week: now.getDay(),
      is_weekend: now.getDay() === 0 || now.getDay() === 6,
    };

    // Business hours check
    if (ctx.prefs?.business_hours) {
      ctx.time.is_business_hours = this.isBusinessHours(now, ctx.prefs.business_hours);
    }

    // Quiet hours check for customer
    if (ctx.prefs?.quiet_hours_start && ctx.prefs?.quiet_hours_end) {
      ctx.time.is_in_quiet_hours = this.isInQuietHours(
        now,
        ctx.prefs.quiet_hours_start,
        ctx.prefs.quiet_hours_end
      );
    } else {
      ctx.time.is_in_quiet_hours = false;
    }

    return ctx;
  }

  // ===========================================================================
  // CONDITION EVALUATION
  // ===========================================================================

  private evaluateConditions(
    conditions: ConditionClause[],
    event: AutomationEvent
  ): { passed: boolean; failedAt: number | null } {
    for (let i = 0; i < conditions.length; i++) {
      if (!this.evaluateClause(conditions[i], event)) {
        return { passed: false, failedAt: i };
      }
    }
    return { passed: true, failedAt: null };
  }

  private evaluateClause(clause: ConditionClause, event: AutomationEvent): boolean {
    const left = this.resolvePath(clause.path, event);
    const right = typeof clause.value === 'string' && clause.value.includes('.')
      ? this.resolvePath(clause.value, event)  // allow right-side path refs
      : clause.value;

    switch (clause.op) {
      case 'equals': return left === right;
      case 'not_equals': return left !== right;
      case 'in': return Array.isArray(right) && right.includes(left);
      case 'not_in': return Array.isArray(right) && !right.includes(left);
      case 'greater_than': return typeof left === 'number' && typeof right === 'number' && left > right;
      case 'less_than': return typeof left === 'number' && typeof right === 'number' && left < right;
      case 'greater_than_or_equal': return typeof left === 'number' && typeof right === 'number' && left >= right;
      case 'less_than_or_equal': return typeof left === 'number' && typeof right === 'number' && left <= right;
      case 'is_null': return left == null;
      case 'is_not_null': return left != null;
      case 'contains': return typeof left === 'string' && left.includes(String(right));
      case 'not_contains': return typeof left === 'string' && !left.includes(String(right));
      case 'matches_regex': return typeof left === 'string' && new RegExp(String(right)).test(left);

      // Domain-specific
      case 'has_active_job':
        return event.context?.job != null &&
               ['scheduled', 'in_progress', 'approved'].includes(event.context.job.status);
      case 'has_scheduled_job':
        return event.context?.job != null && event.context.job.status === 'scheduled';

      default:
        console.warn(`Unknown condition op: ${clause.op}`);
        return false;
    }
  }

  private resolvePath(path: string, event: AutomationEvent): any {
    const root: any = {
      event: { ...event.payload, ...event.context },
      ...event.context,
    };

    const parts = path.split('.');
    let current = root;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }

  // ===========================================================================
  // ACTION EXECUTION
  // ===========================================================================

  private async executeActions(
    actions: AutomationAction[],
    event: AutomationEvent
  ): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        const result = await this.executeAction(action, event);
        results.push({ type: action.type, status: 'ok', result });
      } catch (err: any) {
        results.push({ type: action.type, status: 'error', error: err.message });
      }
    }
    return results;
  }

  private async executeAction(action: AutomationAction, event: AutomationEvent): Promise<any> {
    const svc = this.services;
    const ctx = event.context!;
    const config = this.interpolateConfig(action.config, event);

    switch (action.type) {
      case 'skip':
        return { skipped: config.reason };

      case 'create_time_entry':
        return svc.createTimeEntry({
          orgId: event.orgId,
          userId: event.userId!,
          jobId: ctx.job?.id,
          phaseId: config.phase_id,
          startedAt: event.occurredAt,
          entryKind: config.entry_kind ?? 'on_site',
          autoGenerated: true,
          userConfirmed: false,
          entryGeofenceEventId: event.payload.geofence_event_id,
          startLocation: event.payload.location,
        });

      case 'close_time_entry':
        return svc.closeOpenTimeEntry({
          orgId: event.orgId,
          userId: event.userId!,
          endedAt: event.occurredAt,
          exitGeofenceEventId: event.payload.geofence_event_id,
          requireConfirmation: config.require_confirmation ?? true,
        });

      case 'advance_job_status':
        if (!ctx.job) return { skipped: 'no job' };
        if (config.from_status && !config.from_status.includes(ctx.job.status)) {
          return { skipped: `status ${ctx.job.status} not in ${config.from_status}` };
        }
        return svc.updateJobStatus(ctx.job.id, config.to_status, config.note);

      case 'create_vault_item':
        return svc.createVaultItem({
          orgId: event.orgId,
          userId: event.userId!,
          type: config.type,
          source: config.source,
          content: config.content ?? `${event.type} at ${ctx.geofence?.label ?? 'location'}`,
          customerId: ctx.customer?.id,
          propertyId: ctx.property?.id,
          jobId: ctx.job?.id,
          location: event.payload.location,
          occurredAt: event.occurredAt,
        });

      case 'tag_vault_items':
        return svc.tagRecentVaultItems({
          orgId: event.orgId,
          userId: event.userId!,
          customerId: ctx.customer?.id,
          propertyId: ctx.property?.id,
          jobId: ctx.job?.id,
          withinMinutes: config.within_minutes ?? 30,
        });

      case 'send_sms': {
        const recipient = config.to === 'customer' ? ctx.customer?.phone_primary : config.to;
        if (!recipient) return { skipped: 'no recipient' };
        return svc.sendSms({
          orgId: event.orgId,
          customerId: ctx.customer?.id,
          jobId: ctx.job?.id,
          to: recipient,
          body: config.body_template ?? config.body,
        });
      }

      case 'send_email': {
        const recipient = config.to === 'customer' ? ctx.customer?.email : config.to;
        if (!recipient) return { skipped: 'no recipient' };
        return svc.sendEmail({
          orgId: event.orgId,
          customerId: ctx.customer?.id,
          jobId: ctx.job?.id,
          to: recipient,
          subject: config.subject,
          body: config.body_template ?? config.body,
        });
      }

      case 'push_notification':
        return svc.pushNotification({
          userId: event.userId!,
          title: config.title,
          body: config.body,
          deepLink: config.deep_link,
          priority: config.priority ?? 'normal',
        });

      case 'prompt_user':
        return svc.createUserPrompt({
          orgId: event.orgId,
          userId: event.userId!,
          promptType: config.prompt_type,
          title: config.title,
          body: config.body,
          options: config.options,
          defaultOptionId: config.default_option_id,
          jobId: ctx.job?.id,
          customerId: ctx.customer?.id,
          payload: config.payload,
          priority: config.priority ?? 'normal',
          expiresInSeconds: config.expires_in_seconds ?? 3600,
        });

      case 'create_task':
        return svc.createTask({
          orgId: event.orgId,
          userId: event.userId!,
          title: config.title,
          description: config.description,
          priority: config.priority ?? 'normal',
          customerId: config.link_to_customer ? ctx.customer?.id : undefined,
          jobId: config.link_to_job ? ctx.job?.id : undefined,
          dueAt: config.due_at,
          aiGenerated: true,
        });

      case 'draft_invoice':
        return svc.draftInvoice({
          orgId: event.orgId,
          jobId: ctx.job?.id,
          fromActuals: config.from_actuals ?? true,
          sendImmediately: config.send_immediately ?? false,
        });

      case 'classify_trip':
        if (!event.payload.trip_id) return { skipped: 'no trip' };
        return svc.classifyTrip({
          tripId: event.payload.trip_id,
          purpose: config.purpose,
          jobId: config.attribute_to_most_recent_job
            ? await svc.findMostRecentJobVisit(event.userId!, event.occurredAt)
            : undefined,
          isBillable: config.is_billable,
        });

      case 'run_tool':
        return svc.runTool(config.tool_name, config.tool_args, event);

      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  // ===========================================================================
  // TEMPLATE INTERPOLATION
  // ===========================================================================

  private interpolateConfig(config: any, event: AutomationEvent): any {
    if (typeof config === 'string') {
      return this.interpolateString(config, event);
    }
    if (Array.isArray(config)) {
      return config.map(c => this.interpolateConfig(c, event));
    }
    if (config && typeof config === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(config)) {
        out[k] = this.interpolateConfig(v, event);
      }
      return out;
    }
    return config;
  }

  private interpolateString(str: string, event: AutomationEvent): string {
    return str.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
      const v = this.resolvePath(path.trim(), event);
      return v == null ? '' : String(v);
    });
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private isBusinessHours(now: Date, businessHours: any): boolean {
    const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
    const ranges = businessHours[dayKey] ?? [];
    if (ranges.length === 0) return false;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const [start, end] of ranges) {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const sMin = sh * 60 + sm;
      const eMin = eh * 60 + em;
      if (nowMinutes >= sMin && nowMinutes < eMin) return true;
    }
    return false;
  }

  private isInQuietHours(now: Date, start: string, end: string): boolean {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const sMin = sh * 60 + sm;
    const eMin = eh * 60 + em;
    const nMin = now.getHours() * 60 + now.getMinutes();

    // Quiet hours that span midnight (e.g. 21:00–07:00)
    if (sMin > eMin) {
      return nMin >= sMin || nMin < eMin;
    }
    return nMin >= sMin && nMin < eMin;
  }

  private parseRule(raw: any): AutomationRule {
    return {
      id: raw.id,
      orgId: raw.org_id,
      userId: raw.user_id,
      name: raw.name,
      description: raw.description,
      triggerType: raw.trigger_type,
      triggerConfig: raw.trigger_config ?? {},
      conditions: raw.conditions ?? [],
      actions: raw.actions ?? [],
      isEnabled: raw.is_enabled,
      cooldownSeconds: raw.cooldown_seconds ?? 0,
      lastTriggeredAt: raw.last_triggered_at ? new Date(raw.last_triggered_at) : null,
      appliesToCustomerIds: raw.applies_to_customer_ids,
      appliesToJobIds: raw.applies_to_job_ids,
    };
  }

  private async logEvent(rule: AutomationRule, event: AutomationEvent, result: any) {
    await this.supabase.from('automation_events').insert({
      org_id: event.orgId,
      rule_id: rule.id,
      user_id: event.userId,
      trigger_event_type: event.type,
      trigger_payload: event.payload,
      conditions_passed: result.conditionsPassed,
      conditions_failed_at: result.conditionsFailedAt,
      actions_executed: result.actionsExecuted,
      outcome: result.outcome,
      error_message: result.errorMessage,
      occurred_at: event.occurredAt.toISOString(),
    });
  }

  private async incrementRuleStats(ruleId: string, firedAt: Date) {
    await this.supabase.rpc('increment_rule_triggered', {
      p_rule_id: ruleId,
      p_fired_at: firedAt.toISOString(),
    });
  }
}

// =============================================================================
// ACTION SERVICES interface — the app provides concrete implementations
// =============================================================================

export interface ActionServices {
  createTimeEntry(p: any): Promise<any>;
  closeOpenTimeEntry(p: any): Promise<any>;
  updateJobStatus(jobId: string, status: string, note?: string): Promise<any>;
  createVaultItem(p: any): Promise<any>;
  tagRecentVaultItems(p: any): Promise<any>;
  sendSms(p: any): Promise<any>;
  sendEmail(p: any): Promise<any>;
  pushNotification(p: any): Promise<any>;
  createUserPrompt(p: any): Promise<any>;
  createTask(p: any): Promise<any>;
  draftInvoice(p: any): Promise<any>;
  classifyTrip(p: any): Promise<any>;
  findMostRecentJobVisit(userId: string, before: Date): Promise<string | undefined>;
  runTool(name: string, args: any, event: AutomationEvent): Promise<any>;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface ProcessResult {
  matched: number;
  executed: number;
  results: RuleExecutionResult[];
}

export interface RuleExecutionResult {
  ruleId: string;
  outcome: 'executed' | 'skipped' | 'failed';
  reason?: string;
  error?: string;
  actionResults?: ActionResult[];
}

export interface ActionResult {
  type: string;
  status: 'ok' | 'error';
  result?: any;
  error?: string;
}
