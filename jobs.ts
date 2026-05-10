// packages/db/queries/jobs.ts
import { supabase } from '@/lib/supabase-client';
import { Job, JobStatus } from '@/types/job';

export interface JobListFilters {
  search?: string;
  status?: JobStatus;
}

export async function getJobsList(
  orgId: string,
  filters: JobListFilters = {}
): Promise<Job[]> {
  let query = supabase
    .from('jobs')
    .select(`
      id,
      title,
      description,
      status,
      created_at,
      updated_at,
      customer_id,
      property_id,
      category_id,
      assigned_to,
      due_date,
      customer:customers!jobs_customer_id_fkey (
        id,
        full_name,
        email,
        phone
      ),
      property:properties!jobs_property_id_fkey (
        id,
        address,
        city,
        state,
        zip_code
      ),
      category:categories!jobs_category_id_fkey (
        id,
        name
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (filters.search) {
    query = query.textSearch('title', filters.search);
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch jobs: ${error.message}`);
  }

  return data as Job[];
}

export async function getJobById(jobId: string, orgId: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select(`
      id,
      title,
      description,
      status,
      created_at,
      updated_at,
      customer_id,
      property_id,
      category_id,
      assigned_to,
      due_date,
      customer:customers!jobs_customer_id_fkey (
        id,
        full_name,
        email,
        phone
      ),
      property:properties!jobs_property_id_fkey (
        id,
        address,
        city,
        state,
        zip_code
      ),
      category:categories!jobs_category_id_fkey (
        id,
        name
      )
    `)
    .eq('id', jobId)
    .eq('org_id', orgId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch job: ${error.message}`);
  }

  return data as Job;
}
