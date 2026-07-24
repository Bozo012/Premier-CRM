import { NextResponse, type NextRequest } from 'next/server';

import {
  createServiceClient,
  getPublicWebsiteContentSnapshot,
} from '@premier/db';

const PREMIER_ORG_ID =
  process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

const ALLOWED_ORIGINS_PROD = [
  'https://ppmnky.com',
  'https://www.ppmnky.com',
  'https://app.ppmnky.com',
];

const ALLOWED_ORIGINS_DEV = ['http://localhost:3000', 'http://localhost:5173'];

function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  const allowedOrigins =
    process.env.NODE_ENV === 'development'
      ? [...ALLOWED_ORIGINS_PROD, ...ALLOWED_ORIGINS_DEV]
      : ALLOWED_ORIGINS_PROD;

  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

function buildCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(origin);
  if (!allowedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get('Origin')),
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const corsHeaders = buildCorsHeaders(request.headers.get('Origin'));
  const supabase = createServiceClient();

  const result = await getPublicWebsiteContentSnapshot(supabase, {
    orgId: PREMIER_ORG_ID,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        code: result.code,
        error: result.error,
      },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: result.data,
    },
    {
      status: 200,
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
      },
    }
  );
}
