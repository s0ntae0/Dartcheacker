import { createHash } from 'node:crypto';
import { after } from 'next/server';
import type { CheckResponse, Claim, RiskLevel } from '@/lib/types';
import { ACTION_GUIDE, VERDICT_COPY, ruleMatch } from '@/lib/patterns';
import { computeScore, type LlmPatternResult } from '@/lib/scoring';
import { LLM_MODEL, LlmError, extractClaims, judgePatterns, type ClaimDraft } from '@/lib/llm';
import { getSupabase } from '@/lib/supabase';
import { resolveClaims } from '@/lib/verify';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MIN_LEN = 10;
const MAX_LEN = 4000;

// ---- rate limit: 모듈 스코프 Map<ip, timestamps[]>, 분당 10회 ----
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const RATE = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (RATE.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    RATE.set(ip, hits);
    return true;
  }
  hits.push(now);
  RATE.set(ip, hits);
  if (RATE.size > 5000) RATE.clear(); // 메모리 보호
  return false;
}

function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? null; // 로컬 개발(헤더 없음)은 제한 안 함
}

function llmKind(e: unknown): string {
  return e instanceof LlmError ? e.kind : 'llm_error';
}

function pushUnique(arr: string[], v: string) {
  if (!arr.includes(v)) arr.push(v);
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const ip = clientIp(req);
  if (ip && rateLimited(ip)) {
    return Response.json({ error: '요청이 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
  }

  // 0. 입력 검증
  let raw = '';
  try {
    const body = await req.json();
    raw = typeof body?.text === 'string' ? body.text : '';
  } catch {
    return Response.json({ error: 'JSON body { text } 가 필요합니다' }, { status: 400 });
  }
  const text = raw.trim();
  if (text.length < MIN_LEN) return Response.json({ error: `${MIN_LEN}자 이상 입력하세요` }, { status: 400 });
  if (text.length > MAX_LEN) return Response.json({ error: `${MAX_LEN}자 이하로 입력하세요` }, { status: 400 });
  const input_hash = createHash('sha256').update(text).digest('hex');

  const degraded: string[] = [];
  const errors: string[] = [];

  // 1. 규칙층 (동기)
  const rule = ruleMatch(text);

  let llm: LlmPatternResult | null = null;
  let drafts: ClaimDraft[] = [];
  let claims: Claim[] = [];
  let scored = computeScore(rule, null);

  try {
    // 2. LLM 2건 병렬
    const [pj, cj] = await Promise.allSettled([
      judgePatterns(text, rule.patterns.map((p) => p.id)),
      extractClaims(text),
    ]);
    if (pj.status === 'fulfilled') llm = pj.value;
    else {
      pushUnique(degraded, llmKind(pj.reason));
      errors.push(`judge: ${String((pj.reason as Error)?.message ?? pj.reason)}`);
    }
    if (cj.status === 'fulfilled') drafts = cj.value;
    else {
      pushUnique(degraded, llmKind(cj.reason));
      errors.push(`extract: ${String((cj.reason as Error)?.message ?? cj.reason)}`);
    }

    // 3. 점수 합산
    scored = computeScore(rule, llm);

    // 4~5. 기업 매핑 + 공시 대조
    claims = await resolveClaims(drafts, degraded);
  } catch (e) {
    // 어떤 경우에도 500을 내지 않는다: 규칙층 결과로 응답
    pushUnique(degraded, 'internal_error');
    errors.push(`pipeline: ${String((e as Error)?.message ?? e)}`);
    scored = computeScore(rule, null);
  }

  // 6. 응답 조립
  const level: RiskLevel = scored.level;
  const guideLevel = level === 'uncertain' ? 'medium' : level;
  const res: CheckResponse = {
    risk: {
      score: scored.score,
      level,
      headline: scored.headline,
      patterns: scored.patterns,
      benign: scored.benign,
      stage: llm?.stage,
      reflection: llm?.reflection,
    },
    claims,
    actions: ACTION_GUIDE[guideLevel],
    contacts: ACTION_GUIDE.contacts,
    checked_at: new Date().toISOString(),
    disclaimer: VERDICT_COPY.disclaimer,
    degraded: degraded.length ? degraded : undefined,
  };

  // 로그: 응답을 막지 않는다 (after = 응답 전송 후 실행, 실패해도 무시)
  const latency_ms = Date.now() - t0;
  after(async () => {
    try {
      await getSupabase().from('checks').insert({
        input_text: text,
        input_hash,
        risk_score: res.risk.score,
        risk_level: res.risk.level,
        patterns: res.risk.patterns.map((p) => ({ id: p.id, confidence: p.confidence, spans: p.spans })),
        claims: res.claims,
        llm_model: LLM_MODEL,
        latency_ms,
        error: errors.length ? errors.join(' | ').slice(0, 1000) : null,
      });
    } catch (e) {
      console.error('checks insert 실패', e);
    }
  });

  return Response.json(res);
}
