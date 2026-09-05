import { getSupabase } from './supabase';

export interface CorpRef {
  corp_code: string;
  corp_name: string;
  stock_code: string;
}
export interface CorpMatch {
  corp: CorpRef;
  sim: number;
  uncertain: boolean; // sim 0.25~0.4
}

const SIM_ACCEPT = 0.4;
const SIM_MIN = 0.25;
const cache = new Map<string, CorpMatch | null>(); // 프로세스 수명 캐시

/** "㈜", "(주)", "주식회사", 공백 제거 */
export function normalizeCorpName(name: string): string {
  return name
    .replace(/㈜|\(주\)|주식회사|\bCo\.,?\s*Ltd\.?|\bInc\.?/gi, '')
    .replace(/[\s'"“”‘’·,.]+/g, ' ')
    .trim();
}

/** 기업명 → corp_code. 1) corp_aliases 정확 매치 2) find_corp(pg_trgm) sim ≥ 0.4 채택, 0.25~0.4 채택+불확실 표시 */
export async function findCorp(name: string): Promise<CorpMatch | null> {
  const q = normalizeCorpName(name);
  if (!q) return null;
  if (cache.has(q)) return cache.get(q) ?? null;

  const sb = getSupabase();
  let result: CorpMatch | null = null;

  const { data: alias, error: aliasErr } = await sb.from('corp_aliases').select('corp_code').eq('alias', q).maybeSingle();
  if (aliasErr) throw aliasErr;
  if (alias?.corp_code) {
    const { data: corp } = await sb.from('corps').select('corp_code, corp_name, stock_code').eq('corp_code', alias.corp_code).maybeSingle();
    if (corp) result = { corp, sim: 1, uncertain: false };
  }

  if (!result) {
    const { data, error } = await sb.rpc('find_corp', { q, lim: 3 });
    if (error) throw error;
    const top = (data as (CorpRef & { sim: number })[] | null)?.[0];
    if (top && top.sim >= SIM_MIN) {
      result = {
        corp: { corp_code: top.corp_code, corp_name: top.corp_name, stock_code: top.stock_code },
        sim: top.sim,
        uncertain: top.sim < SIM_ACCEPT,
      };
    }
  }

  if (cache.size > 2000) cache.clear();
  cache.set(q, result);
  return result;
}
