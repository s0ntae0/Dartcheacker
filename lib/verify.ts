import { findCorp } from './corp';
import type { ClaimDraft } from './llm';
import type { Claim } from './types';

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
    const prefix = m[2] === '천' ? 1e3 : m[2] === '백' ? 1e2 : m[2] === '십' ? 10 : 1;
    const unit = m[3] === '조' ? 1e12 : m[3] === '억' ? 1e8 : m[3] === '만' ? 1e4 : 1;
    if (!m[3] && !m[4]) continue; // 단위 없는 숫자(퍼센트·날짜 등)는 무시
    total += num * prefix * unit;
    hasUnit = true;
  }
  if (!hasUnit || total <= 0) return undefined;
  return { value: Math.round(total), unit: '원', raw };
}

function pushUnique(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
}

/** 주장 초안 → 기업 매핑 → (STEP 4) 공시 대조 */
export async function resolveClaims(drafts: ClaimDraft[], degraded: string[]): Promise<Claim[]> {
  return Promise.all(
    drafts.map(async (d) => {
      const claim: Claim = {
        text: d.text,
        type: d.type,
        amount: parseAmount(d.amount_raw),
        date_hint: d.date_hint,
        verdict: 'unconfirmed',
        detail: '',
      };
      let match = null;
      try {
        match = await findCorp(d.corp_name);
      } catch (e) {
        console.error('findCorp 실패', e);
        pushUnique(degraded, 'corp_lookup');
        claim.detail = '기업 검색이 일시적으로 불가합니다';
        return claim;
      }
      if (!match) {
        claim.verdict = 'out_of_scope';
        claim.detail = `상장사에서 '${d.corp_name}'을 찾지 못했습니다`;
        return claim;
      }
      claim.corp = match.corp;
      if (match.uncertain) claim.note = `기업명 매칭 불확실: ${match.corp.corp_name}?`;
      claim.detail = '공시 대조는 준비 중입니다';
      return claim;
    }),
  );
}
