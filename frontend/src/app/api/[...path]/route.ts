import { proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: { path: string[] } };

async function handle(req: Request, ctx: RouteContext): Promise<Response> {
  const segments = ctx.params.path ?? [];
  const path = segments.length ? segments.join('/') : '';
  return proxyToBackend(req, `/api/${path}`);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
export const HEAD = handle;
