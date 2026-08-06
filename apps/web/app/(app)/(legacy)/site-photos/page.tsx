import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Camera, ExternalLink } from 'lucide-react';

import { getActiveOrgContext, getSignedReadUrl, type Database } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Site Photos' };

type VaultItem = Database['public']['Tables']['vault_items']['Row'];

interface PhotoCard {
  caption: string;
  createdAt: string;
  estimateId: string | null;
  id: string;
  imageUrl: string | null;
  siteVisitId: string | null;
}

export default async function SitePhotosPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/site-photos');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);

  if (!orgContext.success) {
    return (
      <ForgePage className="max-w-6xl gap-5">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </ForgePage>
    );
  }

  const { data, error } = await supabase
    .from('vault_items')
    .select('*')
    .eq('org_id', orgContext.data.orgId)
    .eq('type', 'photo')
    .order('created_at', { ascending: false })
    .limit(60);

  const photos = await Promise.all(
    (((data as VaultItem[] | null) ?? []).map(async (item): Promise<PhotoCard> => {
      const storagePath = item.storage_object_key ?? item.image_url;
      const signedUrl = storagePath ? await getSignedReadUrl(supabase, storagePath) : null;

      return {
        caption: item.content || 'Site photo',
        createdAt: item.created_at,
        estimateId: item.estimate_id,
        id: item.id,
        imageUrl: signedUrl?.success ? signedUrl.data : null,
        siteVisitId: item.site_visit_id,
      };
    }))
  );

  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Site Photos</h1>
        <p className="text-sm text-muted-foreground">
          Browse photos stored in Premier&apos;s private vault. URLs are signed at request time.
        </p>
      </header>

      {error ? (
        <ForgeCard className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load site photos. Refresh and try again.
        </ForgeCard>
      ) : photos.length === 0 ? (
        <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
          <div>
            <Camera className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold">No site photos yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Photos added during visits will appear here.</p>
          </div>
        </ForgeCard>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((photo) => (
            <ForgeCard key={photo.id} className="overflow-hidden p-0">
              <div className="grid aspect-video place-items-center bg-muted">
                {photo.imageUrl ? (
                  <div
                    role="img"
                    aria-label={photo.caption}
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${photo.imageUrl})` }}
                  />
                ) : (
                  <Camera className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <h2 className="line-clamp-2 text-sm font-bold text-foreground">{photo.caption}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(photo.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {photo.siteVisitId ? (
                    <Link className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" href={`/site-visits/${photo.siteVisitId}`}>
                      Site visit <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                  {photo.estimateId ? (
                    <Link className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline" href={`/estimates/${photo.estimateId}`}>
                      Estimate <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </div>
            </ForgeCard>
          ))}
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ForgeStatusPill tone="blue">Private storage</ForgeStatusPill>
        <ForgeStatusPill tone="neutral">Signed preview URLs</ForgeStatusPill>
      </div>
    </ForgePage>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
