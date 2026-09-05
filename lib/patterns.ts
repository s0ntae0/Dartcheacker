import patternsJson from '@/data/patterns.json';
import type { PatternHit } from './types';

export type PatternDef = (typeof patternsJson)['patterns'][number];
export type BenignDef = (typeof patternsJson)['benign_signals'][number];
export type BenignHit = { id: string; label: string; spans: string[] };

export const PATTERNS: PatternDef[] = patternsJson.patterns;
export const BENIGN: BenignDef[] = patternsJson.benign_signals;
export const SCORING = patternsJson.scoring;
export const VERDICT_COPY = patternsJson.verdict_copy;
export const ACTION_GUIDE = patternsJson.action_guide;
export const PATTERN_MAP = new Map(PATTERNS.map((p) => [p.id, p]));
export const BENIGN_MAP = new Map(BENIGN.map((b) => [b.id, b]));

const RULE_CONFIDENCE = 0.6;
const NON_PRESS_HOSTS = ['t.me', 'open.kakao.com', 'band.us'];

const compiledPatterns = PATTERNS.map((def) => ({ def, regexes: def.regex.map((r) => new RegExp(r, 'g')) }));
const compiledBenign = BENIGN.map((def) => ({ def, regexes: def.regex.map((r) => new RegExp(r, 'g')) }));

function matchSpans(text: string, keywords: string[], regexes: RegExp[]): string[] {
  const spans = new Set<string>();
  for (const k of keywords) if (k && text.includes(k)) spans.add(k);
  for (const re of regexes) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) if (m[0]) spans.add(m[0]);
  }
  return [...spans];
}

function isNonPressUrl(span: string): boolean {
  const m = span.match(/https?:\/\/([^/\s]+)/i);
  if (!m) return false;
  const host = m[1].toLowerCase();
  return NON_PRESS_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

export function toHit(def: PatternDef, spans: string[], confidence: number): PatternHit {
  return {
    id: def.id,
    label: def.label,
    category: def.category,
    spans,
    confidence,
    hard: def.hard,
    legal_basis: def.legal_basis,
    next_step_hint: def.next_step_hint ?? null,
    sources: def.sources,
  };
}

/** 규칙층: keywords는 includes, regex는 전역 매치. 동기, <5ms. */
export function ruleMatch(text: string): { patterns: PatternHit[]; benign: BenignHit[] } {
  const patterns: PatternHit[] = [];
  for (const { def, regexes } of compiledPatterns) {
    const spans = matchSpans(text, def.keywords, regexes);
    if (spans.length) patterns.push(toHit(def, spans, RULE_CONFIDENCE));
  }
  const benign: BenignHit[] = [];
  for (const { def, regexes } of compiledBenign) {
    let spans = matchSpans(text, def.keywords, regexes);
    if (def.id === 'B02') spans = spans.filter((s) => !isNonPressUrl(s));
    if (spans.length) benign.push({ id: def.id, label: def.label, spans });
  }
  return { patterns, benign };
}
