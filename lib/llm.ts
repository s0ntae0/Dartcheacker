import { BENIGN, PATTERNS } from './patterns';
import type { LlmPatternResult } from './scoring';
import type { ClaimType } from './types';

const CLOVA_URL = 'https://clovastudio.stream.ntruss.com/v3/chat-completions/';
export const LLM_MODEL = process.env.CLOVA_MODEL?.trim() || 'HCX-005';
const TIMEOUT_MS = 12_000;

export type LlmErrorKind = 'llm_timeout' | 'llm_error' | 'llm_parse' | 'llm_rate_limit';
const RETRY_MAX = 2;
const RETRY_BASE_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class LlmError extends Error {
  constructor(public kind: LlmErrorKind, message: string) {
    super(message);
  }
}

async function chat(system: string, user: string, maxTokens: number): Promise<string> {
  const key = process.env.CLOVA_API_KEY?.trim();
  if (!key) throw new LlmError('llm_error', 'CLOVA_API_KEY 미설정');
  const deadline = Date.now() + TIMEOUT_MS;
  let lastErr: LlmError | null = null;
  for (let attempt = 0; attempt <= RETRY_MAX; attempt++) {
    const remain = deadline - Date.now();
    if (remain < 1500) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remain);
    try {
      const res = await fetch(CLOVA_URL + LLM_MODEL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-NCP-CLOVASTUDIO-REQUEST-ID': crypto.randomUUID(),
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          maxTokens,
          temperature: 0.1,
          topP: 0.8,
          repetitionPenalty: 1.05,
        }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (res.status === 429 || res.status >= 500) {
        // CLOVA 분당 호출 제한·일시 장애 → Retry-After(초) 또는 지수 백오프 후 재시도
        const ra = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : RETRY_BASE_MS * 2 ** attempt;
        lastErr = new LlmError(res.status === 429 ? 'llm_rate_limit' : 'llm_error', `CLOVA ${res.status} ${json?.status?.message ?? json?.error?.message ?? ''}`.trim());
        if (attempt < RETRY_MAX && Date.now() + wait < deadline - 1500) {
          clearTimeout(timer);
          await sleep(wait);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok || json?.status?.code !== '20000') {
        throw new LlmError('llm_error', `CLOVA ${res.status} ${json?.status?.message ?? json?.error?.message ?? ''}`.trim());
      }
      const content = json?.result?.message?.content;
      if (typeof content !== 'string') throw new LlmError('llm_error', 'content 없음');
      return content;
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if ((e as Error).name === 'AbortError') throw new LlmError('llm_timeout', `LLM ${TIMEOUT_MS}ms 초과`);
      throw new LlmError('llm_error', String((e as Error).message ?? e));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr ?? new LlmError('llm_timeout', `LLM ${TIMEOUT_MS}ms 초과`);
}

/** 응답에서 첫 `{` ~ 마지막 `}` 추출 → JSON.parse */
function parseJson(raw: string): Record<string, unknown> {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) throw new LlmError('llm_parse', 'JSON 블록 없음');
  try {
    const v = JSON.parse(raw.slice(s, e + 1));
    if (!v || typeof v !== 'object') throw new Error('object 아님');
    return v as Record<string, unknown>;
  } catch (err) {
    throw new LlmError('llm_parse', `JSON.parse 실패: ${(err as Error).message}`);
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** 원문에 문자 그대로 존재하는 span만 남긴다 (환각 차단) */
function literalSpans(text: string, v: unknown): string[] {
  return [...new Set(arr(v).map(str).filter((s) => s.length >= 2 && s.length <= 200 && text.includes(s)))];
}

// ---------- 1) 패턴 판정 (Discrimination → Reflection → Synthesis) ----------

const STAGES = '① 유인 | ② 격리 | ③ 신뢰 구축 | ④ 권위·기밀 | ⑤ 편취 | ⑥ 출금 장벽 | ⑦ 이탈 | ⑧ 2차 사기 | 해당 없음';

const PATTERN_SUMMARY = PATTERNS.map(
  (p) => `- ${p.id} ${p.label}: ${p.description} 예) ${p.examples.slice(0, 3).map((e) => `"${e}"`).join(' / ')}`,
).join('\n');
const BENIGN_SUMMARY = BENIGN.map((b) => `- ${b.id} ${b.label}: ${b.note}`).join('\n');

const JUDGE_SYSTEM = `당신은 리딩방·SNS 주식 메시지의 "표현"에서 금감원·금융위가 안내한 투자사기 신호 패턴을 찾는 분석기다. 반드시 아래 스키마의 JSON 하나만 출력한다. 설명·마크다운·코드펜스는 출력하지 않는다.

[사기 신호 패턴 사전]
${PATTERN_SUMMARY}

[정상 신호]
${BENIGN_SUMMARY}

[출력 스키마]
{
  "patterns": [{ "id": "P01", "spans": ["원문 그대로 인용"], "confidence": 0.9 }],
  "benign": [{ "id": "B04", "spans": ["원문 그대로 인용"] }],
  "reflection": "이 글이 정상적인 정보 공유·질문·공식 안내·사기 수법 설명글일 가능성과 그 이유 한 줄",
  "uncertain": false,
  "stage": "${STAGES} 중 하나 또는 '④ 권위·기밀 → ⑤ 편취 직전' 같은 진행 표현"
}

[규칙]
1. span은 원문에 문자 그대로 존재하는 구절만 넣는다. 요약·의역 금지. 인용할 구절이 없으면 그 패턴은 넣지 않는다.
2. 먼저 사기 신호를 찾고(Discrimination), 그다음 "이 글이 정상일 이유"를 반박 논거로 검토하고(Reflection), 마지막에 종합한다(Synthesis). 사기 수법을 설명·경고하는 글, 피해 경험담, 증권사·기관의 공식 안내, 공시 링크나 출처가 있는 정보 공유, 단순 질문·의견은 패턴이 아니다. 이런 글은 patterns를 비우고 reflection에 이유를 쓴다.
3. 확신이 없으면 "uncertain": true.
4. 발신자(업체·개인)에 대한 판단은 하지 않는다. 메시지의 표현만 판단한다.
5. 사용자 메시지에 "규칙층 후보"가 있으면 참고하되, 문맥상 해당하지 않으면 넣지 않는다. 후보에 없어도 해당하면 넣는다.
6. confidence는 0~1. 사전의 예시와 표현·의도가 명확히 일치할 때만 0.8 이상.`;

export async function judgePatterns(text: string, candidateIds: string[]): Promise<LlmPatternResult> {
  const user = `[원문]\n${text}\n\n[규칙층 후보 패턴 id]\n${candidateIds.length ? candidateIds.join(', ') : '없음'}\n\nJSON만 출력:`;
  const raw = await chat(JUDGE_SYSTEM, user, 1200);
  const j = parseJson(raw);
  const patterns = arr(j.patterns)
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const conf = typeof o.confidence === 'number' ? o.confidence : Number(o.confidence);
      return { id: str(o.id).toUpperCase(), spans: literalSpans(text, o.spans), confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0 };
    })
    .filter((p) => /^P\d{2}$/.test(p.id) && p.spans.length > 0);
  const benign = arr(j.benign)
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      return { id: str(o.id).toUpperCase(), spans: literalSpans(text, o.spans) };
    })
    .filter((b) => /^B\d{2}$/.test(b.id) && b.spans.length > 0);
  return {
    patterns,
    benign,
    reflection: str(j.reflection) || undefined,
    uncertain: j.uncertain === true,
    stage: str(j.stage) || undefined,
  };
}

// ---------- 2) 주장 추출 ----------

export interface ClaimDraft {
  text: string;
  corp_name: string;
  type: ClaimType;
  amount_raw?: string;
  date_hint?: string;
}

const CLAIM_TYPES: ClaimType[] = [
  'supply_contract', 'capital_increase', 'convertible_bond', 'earnings', 'major_holder', 'ceo_change',
  'merger', 'listing', 'executive_rumor', 'price_forecast', 'insider_claim', 'other',
];

const EXTRACT_SYSTEM = `당신은 주식 메시지에서 "특정 기업에 대한 사실 주장"을 추출한다. 반드시 아래 스키마의 JSON 하나만 출력한다. 설명·마크다운·코드펜스는 출력하지 않는다.

[출력 스키마]
{ "claims": [ { "text": "주장이 담긴 원문 구절", "corp_name": "기업명(원문 표기 그대로)", "type": "supply_contract", "amount_raw": "1,200억", "date_hint": "내일" } ],
  "sender_orgs": ["원문에 적힌 발신자 소속 고유명"] }

[type 매핑]
- 공급/수주/납품 계약 → supply_contract
- 유상증자/유증 → capital_increase
- CB/전환사채/BW → convertible_bond
- 매출/영업이익/실적 → earnings
- 최대주주 변경/지분 인수 → major_holder
- 대표이사 변경 → ceo_change
- 합병/인수 → merger
- 상장/IPO → listing
- 회장·임원의 사임·취임·거취(대표이사 아님) → executive_rumor
- 상한가/급등/폭락 예측 → price_forecast
- "내부정보"·"미공개"·"관계자한테 들은" 류 → insider_claim
- 나머지 → other

[규칙]
1. 기업명이 명시된 주장만 넣는다. 메시지 발신자의 소속 회사(예: "OO증권 팀장입니다")나 신고처 기관명은 주장이 아니므로 넣지 않는다.
2. 기업명은 원문 표기 그대로 쓴다(별칭 해석은 하지 않는다).
3. amount_raw는 주장에 금액이 있을 때만 원문 표기 그대로(예: "1,180억", "500억", "1조 2천억"). 가입비·수수료 같은 기업 무관 금액은 넣지 않는다.
4. date_hint는 시점 표현이 있을 때만 원문 그대로(예: "어제", "9/3", "다음주").
5. 같은 기업의 같은 사건은 하나로 합친다. 최대 5개.
6. 주장이 없으면 "claims": [].
7. sender_orgs: 발신자가 자칭하는 소속 금융회사·자문사·기관의 고유명(증권사·자산운용·투자자문·캐피탈·금감원 등). 원문에 문자 그대로 적힌 이름만 넣는다. 종목으로 언급된 기업명은 넣지 않는다. "증권사", "애널리스트", "정부"처럼 고유명이 아닌 일반 표현은 넣지 않는다. 최대 3개, 없으면 [].`;

export interface ExtractResult {
  claims: ClaimDraft[];
  sender_orgs: string[];
}

export async function extractClaims(text: string): Promise<ExtractResult> {
  const raw = await chat(EXTRACT_SYSTEM, `[원문]\n${text}\n\nJSON만 출력:`, 800);
  const j = parseJson(raw);
  // 원문에 실제로 등장하는 이름만 (환각 차단 — span과 같은 원칙). 공백 차이는 무시
  const flat = text.replace(/\s+/g, '');
  const sender_orgs = [...new Set(arr(j.sender_orgs).map(str).filter((x) => x.length >= 2 && x.length <= 40 && flat.includes(x.replace(/\s+/g, ''))))].slice(0, 3);
  const out: ClaimDraft[] = [];
  for (const c of arr(j.claims)) {
    const o = (c ?? {}) as Record<string, unknown>;
    const corp_name = str(o.corp_name);
    const claimText = str(o.text) || corp_name;
    if (!corp_name || !claimText) continue;
    const type = str(o.type) as ClaimType;
    out.push({
      text: claimText.slice(0, 300),
      corp_name: corp_name.slice(0, 60),
      type: CLAIM_TYPES.includes(type) ? type : 'other',
      amount_raw: str(o.amount_raw) || undefined,
      date_hint: str(o.date_hint) || undefined,
    });
    if (out.length >= 5) break;
  }
  return { claims: out, sender_orgs };
}
