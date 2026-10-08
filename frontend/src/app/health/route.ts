import { proxyToBackend } from '@/lib/backendProxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  return proxyToBackend(req, '/health');
}

export async function HEAD(req: Request): Promise<Response> {
  return proxyToBackend(req, '/health');
}
