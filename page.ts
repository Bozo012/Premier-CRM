// apps/web/app/(app)/jobs/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Job } from '@/types/job';
import { getJobsList } from '@premier/db/queries/jobs';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

export default function JobsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const orgId = 'org-1'; // This would come from auth context in real implementation

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    setSearch(params.get('search') || '');
    setStatusFilter(params.get('status') || '');
  }, [searchParams]);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const filters: any = {};
        if (search) filters.search = search;
        if (statusFilter) filters.status = statusFilter;

        const results = await getJobsList(orgId, filters);
        setJobs(results);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [search, statusFilter]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) =>
