/**
 * Scheduling — shared between the staff CRM (direct scheduleJob call) and
 * the customer portal (bookSchedulingSlot). Both ultimately call the same
 * `apply_job_scheduling` SECURITY DEFINER function (staff directly;
 * customers via `book_scheduling_slot`, which delegates to it after a
 * row-locked capacity check) so the resulting job state and audit history
 * are identical regardless of which side scheduled it.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type Job = Database['public']['Tables']['jobs']['Row'];
export type SchedulingSlot = Database['public']['Tables']['scheduling_slots']['Row'];
export type SchedulingSlotBooking = Database['public']['Tables']['scheduling_slot_bookings']['Row'];

export async function scheduleJob(
  client: DbClient,
  args: {
    orgId: string;
    jobId: string;
    scheduledStart: string;
    scheduledEnd: string | null;
    actorUserId: string | null;
  }
): Promise<Result<{ job: Job }>> {
  const { data, error } = await client.rpc('apply_job_scheduling', {
    p_job_id: args.jobId,
    p_org_id: args.orgId,
    p_scheduled_start: args.scheduledStart,
    p_scheduled_end: args.scheduledEnd as unknown as string,
    p_actor_user_id: args.actorUserId as unknown as string,
    p_actor_customer_id: null as unknown as string,
  });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok({ job: data as Job });
}

export async function createSchedulingSlot(
  client: DbClient,
  args: { orgId: string; startsAt: string; endsAt: string; capacity: number; createdByUserId: string | null }
): Promise<Result<{ slot: SchedulingSlot }>> {
  const { data, error } = await client
    .from('scheduling_slots')
    .insert({
      org_id: args.orgId,
      starts_at: args.startsAt,
      ends_at: args.endsAt,
      capacity: args.capacity,
      created_by: args.createdByUserId,
    })
    .select('*')
    .single();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok({ slot: data });
}

export interface OpenSchedulingSlot extends SchedulingSlot {
  activeBookings: number;
  spotsRemaining: number;
}

/** Only future slots with at least one open spot. */
export async function listOpenSchedulingSlots(
  client: DbClient,
  args: { orgId: string }
): Promise<Result<OpenSchedulingSlot[]>> {
  const { data: slots, error: slotsError } = await client
    .from('scheduling_slots')
    .select('*')
    .eq('org_id', args.orgId)
    .gt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  if (slotsError) return err(ErrorCode.DB_ERROR, slotsError.message);
  if (!slots || slots.length === 0) return ok([]);

  const { data: bookings, error: bookingsError } = await client
    .from('scheduling_slot_bookings')
    .select('slot_id')
    .in('slot_id', slots.map((s) => s.id))
    .is('cancelled_at', null);

  if (bookingsError) return err(ErrorCode.DB_ERROR, bookingsError.message);

  const bookingCounts = new Map<string, number>();
  for (const booking of bookings ?? []) {
    bookingCounts.set(booking.slot_id, (bookingCounts.get(booking.slot_id) ?? 0) + 1);
  }

  const open = slots
    .map((slot) => {
      const activeBookings = bookingCounts.get(slot.id) ?? 0;
      return { ...slot, activeBookings, spotsRemaining: slot.capacity - activeBookings };
    })
    .filter((slot) => slot.spotsRemaining > 0);

  return ok(open);
}

export async function bookSchedulingSlot(
  client: DbClient,
  args: { slotId: string; jobId: string; actorCustomerId: string }
): Promise<Result<{ booking: SchedulingSlotBooking }>> {
  const { data, error } = await client.rpc('book_scheduling_slot', {
    p_slot_id: args.slotId,
    p_job_id: args.jobId,
    p_actor_customer_id: args.actorCustomerId,
  });

  if (error) return err(ErrorCode.VALIDATION_ERROR, error.message);
  return ok({ booking: data as SchedulingSlotBooking });
}

export async function cancelSchedulingSlotBooking(
  client: DbClient,
  args: { bookingId: string; actorUserId: string | null; actorCustomerId: string | null; reason: string | null }
): Promise<Result<{ booking: SchedulingSlotBooking }>> {
  const { data, error } = await client.rpc('cancel_scheduling_slot_booking', {
    p_booking_id: args.bookingId,
    p_actor_user_id: args.actorUserId as unknown as string,
    p_actor_customer_id: args.actorCustomerId as unknown as string,
    p_reason: args.reason as unknown as string,
  });

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok({ booking: data as SchedulingSlotBooking });
}
