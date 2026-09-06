import { getSupabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Stats = { today: { total: number; high: number }; all: { total: number } };
const TTL_MS = 60_000;
let cache: { at: number; body: Stats } | null = null;

const respond = (body: Stats, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } });

/** KST 오늘 0시(UTC ISO) */
function kstTodayStart(): string {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - 9 * 3600 * 1000).toISOString();
}

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) return respond(cache.body);
  try {
    const sb = getSupabase();
    const since = kstTodayStart();
    const [today, high, all] = await Promise.all([
      sb.from('checks').select('*', { count: 'exact', head: true }).gte('created_at', since),
      sb.from('checks').select('*', { count: 'exact', head: true }).gte('created_at', since).eq('risk_level', 'high'),
      sb.from('checks').select('*', { count: 'exact', head: true }),
    ]);
    const err = today.error ?? high.error ?? all.error;
    if (err) throw err;
    const body: Stats = { today: { total: today.count ?? 0, high: high.count ?? 0 }, all: { total: all.count ?? 0 } };
    cache = { at: Date.now(), body };
    return respond(body);
  } catch (e) {
    console.error('stats 실패', e);
    return respond({ today: { total: 0, high: 0 }, all: { total: 0 } }, 503);
  }
}
