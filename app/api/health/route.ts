import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checked_at = new Date().toISOString();
  try {
    const { count, error } = await getSupabase().from('corps').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return Response.json({ ok: true, corps_count: count ?? 0, checked_at, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null });
  } catch (e) {
    return Response.json({ ok: false, corps_count: 0, checked_at, error: String((e as Error).message ?? e) }, { status: 503 });
  }
}
