import { findCorp } from './corp';
import {
  fetchCapitalIncreases, fetchConvertibleBonds, fetchEarnings, fetchSupplyContract,
  isCorrected, listDisclosures, viewerUrl, type Disclosure,
} from './dart';
import type { ClaimDraft } from './llm';
import type { Claim, ClaimType } from './types';

const TOL = 0.15;
const TOL_EARNINGS = 0.1;
const KIND_URL = 'https://kind.krx.co.kr';

// ---------- 유틸 ----------

/** "1,200억" → 1.2e11, "1조 2천억" → 1.2e12, "12,500원" → 12500. 단위(조/억/만/원)가 하나도 없으면 undefined */
export function parseAmount(raw?: string): Claim['amount'] | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/\s+/g, '');
  const re = /(\d+(?:,\d{3})*(?:\.\d+)?)(천|백|십)?(조|억|만)?(원)?/g;
  let total = 0;
  let hasUnit = false;
  for (const m of s.matchAll(re)) {
    const num = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (!m[3] && !m[4]) continue; // 단위 없는 숫자(퍼센트·날짜 등)는 무시
    const prefix = m[2] === '천' ? 1e3 : m[2] === '백' ? 1e2 : m[2] === '십' ? 10 : 1;
    const unit = m[3] === '조' ? 1e12 : m[3] === '억' ? 1e8 : m[3] === '만' ? 1e4 : 1;
    total += num * prefix * unit;
    hasUnit = true;
  }
  if (!hasUnit || total <= 0) return undefined;
  return { value: Math.round(total), unit: '원', raw: raw.trim() };
}

/** 원 단위 숫자 → "1,180억원" 같은 읽기용 문자열 */
export function fmtWon(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const trim = (s: string) => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  if (a >= 1e12) return `${sign}${trim((a / 1e12).toFixed(2))}조원`;
  if (a >= 1e8) return `${sign}${trim((a / 1e8).toFixed(1))}억원`;
  if (a >= 1e4) return `${sign}${trim((a / 1e4).toFixed(0))}만원`;
  return `${sign}${a.toLocaleString('ko-KR')}원`;
}

/** 받침 유무에 따른 조사 선택 */
export function josa(word: string, withBatchim: string, without: string): string {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  let batchim = false;
  if (code >= 0xac00 && code <= 0xd7a3) batchim = (code - 0xac00) % 28 !== 0;
  else if (/[0-9]/.test(ch)) batchim = /[013678]/.test(ch);
  else if (/[a-zA-Z]/.test(ch)) batchim = /[lmnr]/i.test(ch);
  return word + (batchim ? withBatchim : without);
}

const pct = (actual: number, claimed: number) => Math.abs(actual - claimed) / Math.abs(actual);
const pctStr = (p: number) => (p > 1 ? `${(1 + p).toFixed(1)}배` : `${(p * 100).toFixed(1)}%`);

function pushUnique(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
}

function evidenceOf(d: Disclosure): NonNullable<Claim['evidence']> {
  return { rcept_no: d.rcept_no, report_nm: d.report_nm, rcept_dt: d.rcept_dt, url: viewerUrl(d.rcept_no), corrected: isCorrected(d.report_nm) };
}
function evidenceFromRcept(rcept_no: string, fallbackName: string, list: Disclosure[]): NonNullable<Claim['evidence']> {
  const d = list.find((x) => x.rcept_no === rcept_no);
  if (d) return evidenceOf(d);
  const y = rcept_no.slice(0, 4), m = rcept_no.slice(4, 6), dd = rcept_no.slice(6, 8);
  return { rcept_no, report_nm: fallbackName, rcept_dt: `${y}-${m}-${dd}`, url: viewerUrl(rcept_no), corrected: false };
}

const DUTY: Partial<Record<ClaimType, { label: string; deadline: '당일' | '익일' }>> = {
  supply_contract: { label: '단일판매·공급계약 체결', deadline: '익일' },
  capital_increase: { label: '유상증자 결정', deadline: '당일' },
  convertible_bond: { label: '전환사채 발행 결정', deadline: '당일' },
  major_holder: { label: '최대주주 변경', deadline: '당일' },
  ceo_change: { label: '대표이사 변경', deadline: '당일' },
  merger: { label: '합병 결정', deadline: '익일' },
};
function dutyNote(type: ClaimType, checkedAtKst: string): string | undefined {
  const d = DUTY[type];
  if (!d) return undefined;
  return `이 내용이 사실이라면 ${d.label}은 사유 발생 ${d.deadline}까지 공시 의무가 있습니다. ${checkedAtKst} 기준 확인되지 않았으며, 향후 공시로 상태가 바뀔 수 있습니다.`;
}

// ---------- 유형별 대조 ----------

async function verifySupplyContract(claim: Claim, corp_code: string, checkedAtKst: string) {
  const list = await listDisclosures(corp_code);
  const cands = list.filter((d) => /단일판매|공급계약/.test(d.report_nm));
  if (!cands.length) {
    claim.verdict = 'unconfirmed';
    claim.detail = `최근 90일 공시 ${list.length}건 중 단일판매·공급계약 공시 없음`;
    claim.note = dutyNote('supply_contract', checkedAtKst);
    return;
  }
  const latest = cands[0];
  claim.evidence = evidenceOf(latest);
  let parsed = null;
  try {
    parsed = await fetchSupplyContract(latest.rcept_no);
  } catch (e) {
    console.error('document.xml 파싱 실패', e);
  }
  if (!parsed?.amount) {
    claim.verdict = 'partial';
    claim.detail = `공시는 확인됐으나 계약금액 추출 실패 (${latest.report_nm}, ${latest.rcept_dt})`;
    return;
  }
  const extras = [parsed.sales_ratio != null ? `매출액 대비 ${parsed.sales_ratio}%` : null, parsed.counterparty ? `계약상대 ${parsed.counterparty}` : null].filter(Boolean).join(', ');
  const base = `계약금액 ${fmtWon(parsed.amount)}${extras ? ` (${extras})` : ''}`;
  if (claim.amount) {
    const p = pct(parsed.amount, claim.amount.value);
    claim.verdict = p <= TOL ? 'confirmed' : 'partial';
    claim.detail = `${base} — 글의 ${josa(claim.amount.raw, '과', '와')} ${pctStr(p)} 차이`;
  } else {
    claim.verdict = 'confirmed';
    claim.detail = `${base} — 글에 금액 언급 없음`;
  }
}

function detectMethod(text: string): string | null {
  if (/제?\s*3\s*자\s*배정|삼자\s*배정|3자/.test(text)) return '제3자배정';
  if (/주주\s*(우선\s*공모|배정)/.test(text)) return '주주배정';
  if (/일반\s*공모|공모/.test(text)) return '일반공모';
  return null;
}

async function verifyCapitalIncrease(claim: Claim, corp_code: string, checkedAtKst: string) {
  const [rows, list] = await Promise.all([fetchCapitalIncreases(corp_code), listDisclosures(corp_code).catch(() => [] as Disclosure[])]);
  if (!rows.length) {
    claim.verdict = 'unconfirmed';
    claim.detail = '최근 90일 내 유상증자 결정 공시 없음';
    claim.note = dutyNote('capital_increase', checkedAtKst);
    return;
  }
  const latest = [...rows].sort((a, b) => b.rcept_no.localeCompare(a.rcept_no))[0];
  claim.evidence = evidenceFromRcept(latest.rcept_no, '주요사항보고서(유상증자결정)', list);
  const method = latest.method || '방식 미기재';
  const actual = `공시: ${method}${latest.total != null ? ` ${fmtWon(latest.total)}` : ''}`;
  const parts: string[] = [];
  let ok = true;
  const claimedMethod = detectMethod(claim.text);
  if (claimedMethod && !latest.method.includes(claimedMethod)) {
    ok = false;
    parts.push(`글의 '${claimedMethod}'과 방식 불일치`);
  }
  if (claim.amount && latest.total != null) {
    const p = pct(latest.total, claim.amount.value);
    if (p > TOL) ok = false;
    parts.push(`글의 ${josa(claim.amount.raw, '과', '와')} ${pctStr(p)} 차이`);
  }
  claim.verdict = ok ? 'confirmed' : 'partial';
  claim.detail = `${actual}${parts.length ? ` — ${parts.join(', ')}` : ''}`;
}

async function verifyConvertibleBond(claim: Claim, corp_code: string, checkedAtKst: string) {
  const [rows, list] = await Promise.all([fetchConvertibleBonds(corp_code), listDisclosures(corp_code).catch(() => [] as Disclosure[])]);
  if (!rows.length) {
    claim.verdict = 'unconfirmed';
    claim.detail = '최근 90일 내 전환사채 발행 결정 공시 없음';
    claim.note = dutyNote('convertible_bond', checkedAtKst);
    return;
  }
  const latest = [...rows].sort((a, b) => b.rcept_no.localeCompare(a.rcept_no))[0];
  claim.evidence = evidenceFromRcept(latest.rcept_no, '주요사항보고서(전환사채권발행결정)', list);
  const base = `권면총액 ${latest.face_total != null ? fmtWon(latest.face_total) : '미기재'}${latest.conv_price != null ? ` (전환가 ${latest.conv_price.toLocaleString('ko-KR')}원)` : ''}`;
  if (claim.amount && latest.face_total != null) {
    const p = pct(latest.face_total, claim.amount.value);
    claim.verdict = p <= TOL ? 'confirmed' : 'partial';
    claim.detail = `${base} — 글의 ${josa(claim.amount.raw, '과', '와')} ${pctStr(p)} 차이`;
  } else {
    claim.verdict = 'confirmed';
    claim.detail = `${base} — 글에 금액 언급 없음`;
  }
}

async function verifyEarnings(claim: Claim, corp_code: string) {
  const [e, list] = await Promise.all([fetchEarnings(corp_code), listDisclosures(corp_code).catch(() => [] as Disclosure[])]);
  if (!e) {
    claim.verdict = 'unconfirmed';
    claim.detail = '최근 정기보고서(분기·반기·사업보고서) 실적 조회 결과 없음';
    return;
  }
  if (e.rcept_no) claim.evidence = evidenceFromRcept(e.rcept_no, `${e.period_label} 보고서`, list);
  const fs = e.fs_div === 'CFS' ? '연결' : '별도';
  const isAnnual = e.reprt_code === '11011';
  const show = (k: keyof typeof e.items) => {
    const v = e.items[k];
    if (v.amount == null && v.add_amount == null) return `${k} 미기재`;
    if (isAnnual || v.add_amount == null || v.add_amount === v.amount) return `${k} ${fmtWon((v.amount ?? v.add_amount)!)}`;
    return `${k} ${fmtWon(v.amount!)}(분기)/${fmtWon(v.add_amount)}(누적)`;
  };
  const item: keyof typeof e.items | null = /영업\s*이익|영익/.test(claim.text) ? '영업이익' : /순이익|순익/.test(claim.text) ? '당기순이익' : /매출/.test(claim.text) ? '매출액' : null;
  if (claim.amount && item) {
    const v = e.items[item];
    const cands = [v.amount, v.add_amount].filter((x): x is number => x != null && x !== 0);
    if (cands.length) {
      const p = Math.min(...cands.map((a) => pct(a, claim.amount!.value)));
      claim.verdict = p <= TOL_EARNINGS ? 'confirmed' : 'partial';
      claim.detail = `${e.period_label} ${show(item)} (${fs}) — 글의 ${josa(claim.amount.raw, '과', '와')} ${pctStr(p)} 차이`;
      return;
    }
  }
  claim.verdict = 'partial';
  claim.detail = `${e.period_label} ${show('매출액')}, ${show('영업이익')}, ${show('당기순이익')} (${fs}) — 글에 대조할 구체적 수치 없음`;
}

const LIST_KEYWORD: Partial<Record<ClaimType, { re: RegExp; label: string }>> = {
  major_holder: { re: /최대주주\s*변경/, label: '최대주주 변경' },
  ceo_change: { re: /대표이사\s*변경/, label: '대표이사 변경' },
  merger: { re: /합병/, label: '합병' },
};

async function verifyByList(claim: Claim, corp_code: string, checkedAtKst: string) {
  const list = await listDisclosures(corp_code);
  const kw = LIST_KEYWORD[claim.type];
  if (kw) {
    const hit = list.find((d) => kw.re.test(d.report_nm));
    if (hit) {
      claim.verdict = 'confirmed';
      claim.evidence = evidenceOf(hit);
      claim.detail = `${hit.report_nm} 공시 확인 (${hit.rcept_dt})`;
    } else {
      claim.verdict = 'unconfirmed';
      claim.detail = `최근 90일 공시 ${list.length}건 중 ${kw.label} 공시 없음`;
      claim.note = dutyNote(claim.type, checkedAtKst);
    }
    return;
  }
  claim.verdict = 'unconfirmed';
  claim.detail = `최근 90일 공시 ${list.length}건 중 관련 항목 없음`;
}

// ---------- 진입점 ----------

/** 주장 초안 → 기업 매핑 → 공시 대조 */
export async function resolveClaims(drafts: ClaimDraft[], degraded: string[], checkedAtKst: string): Promise<Claim[]> {
  return Promise.all(
    drafts.map(async (d) => {
      const claim: Claim = {
        text: d.text,
        type: d.type,
        amount: parseAmount(d.amount_raw) ?? parseAmount(d.text.match(/\d[\d,]*(?:\.\d+)?\s*(?:천|백|십)?\s*(?:조|억|만)(?:\s*\d[\d,]*(?:\.\d+)?\s*(?:천|백|십)?\s*(?:조|억|만))?\s*원?/)?.[0]),
        date_hint: d.date_hint,
        verdict: 'unconfirmed',
        detail: '',
      };

      // 기업 매핑 (조회 없는 유형도 표시용으로 시도)
      let match = null;
      try {
        match = await findCorp(d.corp_name);
      } catch (e) {
        console.error('findCorp 실패', e);
        pushUnique(degraded, 'corp_lookup');
      }
      if (match) {
        claim.corp = match.corp;
        if (match.uncertain) claim.note = `기업명 매칭 불확실: ${match.corp.corp_name}?`;
      }

      // 조회하지 않는 유형
      if (d.type === 'executive_rumor') {
        claim.verdict = 'not_disclosure_event';
        claim.detail = '회장 등 미등기 임원의 거취는 공시로 확인할 수 없는 주장입니다';
        claim.note = '회장 등 미등기 임원의 취임·사임은 공시 의무 대상이 아니라 공시 유무로 진위를 판단할 수 없습니다 (횡령·배임 혐의 발생은 공시 대상)';
        return claim;
      }
      if (d.type === 'price_forecast') {
        claim.verdict = 'out_of_scope';
        claim.detail = '가격 예측은 공시로 확인할 수 없는 주장입니다';
        return claim;
      }
      if (d.type === 'insider_claim') {
        claim.verdict = 'out_of_scope';
        claim.detail = '공개 전 정보라는 주장은 구조적으로 검증 불가 — 사실이면 미공개중요정보 이용(자본시장법 174조), 거짓이면 사기. 어느 쪽도 매수 근거가 아닙니다';
        return claim;
      }

      if (!match) {
        claim.verdict = 'out_of_scope';
        if (degraded.includes('corp_lookup')) {
          claim.verdict = 'unconfirmed';
          claim.detail = '기업 검색이 일시적으로 불가합니다';
        } else if (d.type === 'listing') {
          claim.detail = `상장사 목록에 '${d.corp_name}'이(가) 없습니다. 상장 예정 여부는 KIND 예비심사 청구 목록에서 확인`;
          claim.note = KIND_URL;
        } else {
          claim.detail = `상장사에서 '${d.corp_name}'${josa(d.corp_name, '을', '를').slice(d.corp_name.length)} 찾지 못했습니다`;
        }
        return claim;
      }

      if (d.type === 'listing') {
        claim.verdict = 'out_of_scope';
        claim.detail = `'${match.corp.corp_name}'은 이미 상장된 기업입니다(종목코드 ${match.corp.stock_code}). 상장 예정 여부는 KIND 예비심사 청구 목록에서 확인`;
        claim.note = KIND_URL;
        return claim;
      }

      // 공시 대조
      try {
        const cc = match.corp.corp_code;
        if (d.type === 'supply_contract') await verifySupplyContract(claim, cc, checkedAtKst);
        else if (d.type === 'capital_increase') await verifyCapitalIncrease(claim, cc, checkedAtKst);
        else if (d.type === 'convertible_bond') await verifyConvertibleBond(claim, cc, checkedAtKst);
        else if (d.type === 'earnings') await verifyEarnings(claim, cc);
        else await verifyByList(claim, cc, checkedAtKst);
      } catch (e) {
        console.error('공시 대조 실패', d.type, e);
        pushUnique(degraded, 'dart_unavailable');
        claim.verdict = 'unconfirmed';
        claim.detail = '공시 조회가 일시적으로 불가합니다';
      }
      return claim;
    }),
  );
}
