import AdmZip from 'adm-zip';
import iconv from 'iconv-lite';
import { getSupabase } from './supabase';

const BASE = 'https://opendart.fss.or.kr/api/';
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const LIST_DAYS = 90;
const MAX_PAGES = 5;

export class DartError extends Error {}

export interface Disclosure {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  report_nm: string;
  rcept_dt: string; // YYYY-MM-DD
  flr_nm: string | null;
  rm: string | null;
}

export const viewerUrl = (rcept_no: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcept_no}`;
export const isCorrected = (report_nm: string) => /^\s*\[(기재)?정정\]/.test(report_nm);
export const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  if (!s || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** ISO → "2026-09-06 03:20 KST" */
export function fmtKst(iso: string = new Date().toISOString()): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} KST`;
}

/** KST 기준 YYYYMMDD */
export function kstYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}
const ymdToIso = (s: string) => (s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);

function apiKey(): string {
  const k = process.env.OPENDART_KEY?.trim();
  if (!k) throw new DartError('OPENDART_KEY 미설정');
  return k;
}

async function fetchRaw(path: string, params: Record<string, string>): Promise<Response> {
  const u = new URL(BASE + path);
  u.searchParams.set('crtfc_key', apiKey());
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) throw new DartError(`OpenDART HTTP ${res.status}`);
    return res;
  } catch (e) {
    if (e instanceof DartError) throw e;
    throw new DartError((e as Error).name === 'AbortError' ? `OpenDART ${TIMEOUT_MS}ms 초과` : String((e as Error).message ?? e));
  } finally {
    clearTimeout(timer);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DartJson = { status: string; message?: string; list?: any[]; total_count?: number; total_page?: number; page_no?: number };

/** status '013'(조회 결과 없음)은 빈 목록으로, 그 외 '000' 아니면 에러 */
async function fetchJson(path: string, params: Record<string, string>): Promise<DartJson> {
  const res = await fetchRaw(path, params);
  const j = (await res.json().catch(() => null)) as DartJson | null;
  if (!j || typeof j.status !== 'string') throw new DartError('OpenDART 응답 형식 오류');
  if (j.status === '013') return { status: '013', list: [], total_count: 0 };
  if (j.status !== '000') throw new DartError(`OpenDART ${j.status} ${j.message ?? ''}`.trim());
  return j;
}

// ---------- 공시목록 (disclosures 캐시 10분) ----------
const memo = new Map<string, { at: number; p: Promise<Disclosure[]> }>();

export async function listDisclosures(corp_code: string): Promise<Disclosure[]> {
  const hit = memo.get(corp_code);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.p;
  const p = loadDisclosures(corp_code);
  memo.set(corp_code, { at: Date.now(), p });
  p.catch(() => memo.delete(corp_code));
  if (memo.size > 500) memo.clear();
  return p;
}

async function loadDisclosures(corp_code: string): Promise<Disclosure[]> {
  const bgn = kstYmd(-LIST_DAYS);
  const end = kstYmd(0);
  const sb = getSupabase();

  // 1. 캐시 (fetched_at 10분 이내면 캐시만 사용)
  try {
    const { data } = await sb
      .from('disclosures')
      .select('rcept_no, corp_code, corp_name, report_nm, rcept_dt, flr_nm, rm, fetched_at')
      .eq('corp_code', corp_code)
      .gte('rcept_dt', ymdToIso(bgn))
      .order('rcept_dt', { ascending: false })
      .limit(500);
    if (data?.length && data.some((r) => Date.now() - new Date(r.fetched_at).getTime() < CACHE_TTL_MS)) {
      return data.map((r) => ({ rcept_no: r.rcept_no, corp_code: r.corp_code, corp_name: r.corp_name, report_nm: r.report_nm, rcept_dt: r.rcept_dt, flr_nm: r.flr_nm, rm: r.rm }));
    }
  } catch (e) {
    console.error('disclosures 캐시 조회 실패', e);
  }

  // 2. OpenDART list.json (최대 5페이지)
  const rows: Disclosure[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const j = await fetchJson('list.json', { corp_code, bgn_de: bgn, end_de: end, page_count: '100', page_no: String(page) });
    for (const it of j.list ?? []) {
      rows.push({
        rcept_no: String(it.rcept_no),
        corp_code: String(it.corp_code),
        corp_name: String(it.corp_name ?? ''),
        report_nm: String(it.report_nm ?? '').trim(),
        rcept_dt: ymdToIso(String(it.rcept_dt ?? '')),
        flr_nm: it.flr_nm ? String(it.flr_nm) : null,
        rm: it.rm ? String(it.rm) : null,
      });
    }
    if (!j.total_page || page >= j.total_page) break;
  }
  rows.sort((a, b) => (a.rcept_dt < b.rcept_dt ? 1 : a.rcept_dt > b.rcept_dt ? -1 : b.rcept_no.localeCompare(a.rcept_no)));

  // 3. upsert 캐시 (실패해도 무시)
  if (rows.length) {
    const fetched_at = new Date().toISOString();
    sb.from('disclosures')
      .upsert(rows.map((r) => ({ ...r, fetched_at })), { onConflict: 'rcept_no' })
      .then(({ error }) => { if (error) console.error('disclosures upsert 실패', error.message); });
  }
  return rows;
}

// ---------- 유상증자 결정 ----------
export interface CapitalIncrease {
  rcept_no: string;
  total: number | null;  // fdpp_* 합계(원)
  method: string;        // ic_mthn
  new_shares: number | null;
}
export async function fetchCapitalIncreases(corp_code: string): Promise<CapitalIncrease[]> {
  const j = await fetchJson('piicDecsn.json', { corp_code, bgn_de: kstYmd(-LIST_DAYS), end_de: kstYmd(0) });
  return (j.list ?? []).map((it) => {
    const parts = ['fdpp_fclt', 'fdpp_bsninh', 'fdpp_op', 'fdpp_dtrp', 'fdpp_ocsa', 'fdpp_etc'].map((k) => toNum(it[k]) ?? 0);
    const total = parts.reduce((a, b) => a + b, 0);
    return { rcept_no: String(it.rcept_no), total: total > 0 ? total : null, method: String(it.ic_mthn ?? '').trim(), new_shares: toNum(it.nstk_ostk_cnt) };
  });
}

// ---------- 전환사채 발행 결정 ----------
export interface ConvertibleBond {
  rcept_no: string;
  face_total: number | null; // bd_fta
  conv_price: number | null; // cv_prc
  bddd: string;
}
export async function fetchConvertibleBonds(corp_code: string): Promise<ConvertibleBond[]> {
  const j = await fetchJson('cvbdIsDecsn.json', { corp_code, bgn_de: kstYmd(-LIST_DAYS), end_de: kstYmd(0) });
  return (j.list ?? []).map((it) => ({ rcept_no: String(it.rcept_no), face_total: toNum(it.bd_fta), conv_price: toNum(it.cv_prc), bddd: String(it.bddd ?? '') }));
}

// ---------- 실적 (단일회사 주요계정) ----------
export interface Earnings {
  rcept_no: string;
  bsns_year: string;
  reprt_code: string;
  period_label: string; // "2026년 반기"
  fs_div: 'CFS' | 'OFS';
  items: Record<'매출액' | '영업이익' | '당기순이익', { amount: number | null; add_amount: number | null }>;
}
const REPRT_LABEL: Record<string, string> = { '11013': '1분기', '11012': '반기', '11014': '3분기', '11011': '사업보고서(연간)' };

export async function fetchEarnings(corp_code: string): Promise<Earnings | null> {
  const year = Number(kstYmd(0).slice(0, 4));
  const candidates: [string, string][] = [[String(year), '11012'], [String(year), '11013'], [String(year - 1), '11011'], [String(year - 1), '11014']];
  for (const [bsns_year, reprt_code] of candidates) {
    const j = await fetchJson('fnlttSinglAcnt.json', { corp_code, bsns_year, reprt_code });
    const list = j.list ?? [];
    if (!list.length) continue;
    const pick = (fs: string) => list.filter((r) => r.fs_div === fs && (r.sj_div === 'IS' || r.sj_div === 'CIS'));
    const rows = pick('CFS').length ? pick('CFS') : pick('OFS');
    if (!rows.length) continue;
    const find = (re: RegExp) => rows.find((r) => re.test(String(r.account_nm ?? '').replace(/\s/g, '')));
    const get = (re: RegExp) => {
      const r = find(re);
      return { amount: r ? toNum(r.thstrm_amount) : null, add_amount: r ? toNum(r.thstrm_add_amount) : null };
    };
    return {
      rcept_no: String(rows[0].rcept_no ?? ''),
      bsns_year,
      reprt_code,
      period_label: `${bsns_year}년 ${REPRT_LABEL[reprt_code] ?? reprt_code}`,
      fs_div: rows[0].fs_div === 'CFS' ? 'CFS' : 'OFS',
      items: { 매출액: get(/^매출액|^수익\(매출액\)|^영업수익/), 영업이익: get(/^영업이익/), 당기순이익: get(/^당기순이익|^분기순이익|^반기순이익/) },
    };
  }
  return null;
}

// ---------- 공시 원문 (공급계약 전용 파싱) ----------
export interface SupplyContract {
  amount: number | null;       // 계약금액 총액(원)
  sales_ratio: number | null;  // 매출액 대비 %
  counterparty: string | null;
  subject: string | null;      // 판매·공급계약 내용
}

/** DART 원문은 meta에 euc-kr로 표기돼 있어도 실제 바이트는 UTF-8인 경우가 있다 → UTF-8 먼저, 깨지면 euc-kr */
function decodeXml(raw: Buffer): string {
  const utf8 = raw.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return iconv.decode(raw, 'euc-kr');
  } catch {
    return utf8;
  }
}

export async function fetchSupplyContract(rcept_no: string): Promise<SupplyContract | null> {
  const res = await fetchRaw('document.xml', { rcept_no });
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 2).toString() !== 'PK') return null; // 오류 JSON/XML
  const zip = new AdmZip(buf);
  const entries = zip.getEntries().filter((e) => /\.xml$/i.test(e.entryName));
  const entry = entries.find((e) => e.entryName.includes(rcept_no)) ?? entries[0];
  if (!entry) return null;
  const text = decodeXml(entry.getData())
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
  const grab = (re: RegExp) => text.match(re)?.[1]?.trim() ?? null;
  const amountStr =
    grab(/계약금액\s*총액\s*\(\s*원\s*\)\s*([\d,]+)/) ??
    grab(/확정\s*계약금액\s*([\d,]{4,})/) ??
    grab(/계약금액[^0-9]{0,30}?([\d,]{4,})/);
  const ratioStr = grab(/매출액\s*대비\s*\(\s*%\s*\)\s*(-?[\d.]+)/);
  let counterparty = grab(/계약상대방?\s+(.+?)\s+(?:-\s+)?최근\s*매출액/);
  if (counterparty && /^[-\s]*$/.test(counterparty)) counterparty = null;
  const subject = grab(/판매\s*ㆍ?\s*공급계약\s*내용\s+(.+?)\s+2\.\s*계약내역/);
  return { amount: toNum(amountStr), sales_ratio: toNum(ratioStr), counterparty, subject };
}
