import { BENIGN_MAP, PATTERN_MAP, SCORING, VERDICT_COPY, toHit, type BenignHit } from './patterns';
import type { PatternHit, RiskLevel } from './types';

export interface LlmPatternResult {
  patterns: { id: string; spans: string[]; confidence: number }[];
  benign: { id: string; spans: string[] }[];
  reflection?: string;
  uncertain?: boolean;
  stage?: string;
}

const LLM_MIN_CONFIDENCE = 0.5;
const BENIGN_PENALTY_CAP = 0.3;

export interface ScoreResult {
  score: number;
  level: RiskLevel;
  headline: string;
  patterns: PatternHit[];
  benign: BenignHit[];
}

/** patterns.json > scoring 규칙 그대로: 규칙층 ∪ LLM → noisy-OR → combo → benign 차감 → 캡 → hard 오버라이드 → level */
export function computeScore(rule: { patterns: PatternHit[]; benign: BenignHit[] }, llm: LlmPatternResult | null): ScoreResult {
  // 1. 매치 집합 병합 (같은 id는 spans 합집합, confidence max)
  const merged = new Map<string, PatternHit>();
  for (const h of rule.patterns) merged.set(h.id, { ...h, spans: [...h.spans] });
  for (const h of llm?.patterns ?? []) {
    if (h.confidence < LLM_MIN_CONFIDENCE || h.spans.length === 0) continue;
    const def = PATTERN_MAP.get(h.id);
    if (!def) continue;
    const prev = merged.get(h.id);
    if (prev) {
      prev.spans = [...new Set([...prev.spans, ...h.spans])];
      prev.confidence = Math.max(prev.confidence, h.confidence);
    } else merged.set(h.id, toHit(def, [...new Set(h.spans)], h.confidence));
  }
  const patterns = [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(patterns.map((p) => p.id));
  const hard = patterns.some((p) => p.hard);

  const benignMap = new Map<string, BenignHit>();
  for (const b of rule.benign) benignMap.set(b.id, { ...b, spans: [...b.spans] });
  for (const b of llm?.benign ?? []) {
    const def = BENIGN_MAP.get(b.id);
    if (!def || b.spans.length === 0) continue;
    const prev = benignMap.get(b.id);
    if (prev) prev.spans = [...new Set([...prev.spans, ...b.spans])];
    else benignMap.set(b.id, { id: def.id, label: def.label, spans: [...new Set(b.spans)] });
  }
  const benign = [...benignMap.values()];

  // 2. noisy-OR
  let score = 1;
  for (const p of patterns) score *= 1 - (PATTERN_MAP.get(p.id)?.weight ?? 0);
  score = 1 - score;

  // 3. combo multiplier
  for (const c of SCORING.combos) if (c.ids.every((id) => ids.has(id))) score *= c.multiplier;

  // 4. benign 차감 (hard 매치 시 무시, 합계 최대 0.3)
  if (!hard && benign.length) {
    const penalty = Math.min(BENIGN_PENALTY_CAP, benign.reduce((s, b) => s + (BENIGN_MAP.get(b.id)?.weight ?? 0), 0));
    score -= penalty;
  }

  // 5. clamp
  score = Math.max(0, Math.min(1, score));

  // 6. level
  let level: RiskLevel = score < 0.3 ? 'low' : score < 0.6 ? 'medium' : 'high';
  if (patterns.length === 1 && !hard && level === 'high') level = 'medium';
  if (hard) level = 'high';
  else if (llm?.uncertain) level = 'uncertain';

  // 7. headline
  const headline = level === 'uncertain' ? '판단을 유보합니다 — 근거 확인 후 판단하세요' : VERDICT_COPY[level];

  return { score: Math.round(score * 1000) / 1000, level, headline, patterns, benign };
}
