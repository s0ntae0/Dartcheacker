// gold 50건을 로컬 서버에 순차 POST → 지표 출력 + docs/eval_result.md 저장
// 실행: node scripts/eval.mjs [--url http://localhost:3000] [--only S01,B08] [--no-save]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const BASE = opt('--url', process.env.EVAL_URL ?? 'http://localhost:3000');
const ONLY = opt('--only', '')?.split(',').filter(Boolean) ?? [];
const SAVE = !args.includes('--no-save');
const GAP_MS = Number(opt('--gap', process.env.EVAL_GAP_MS ?? '300')); // LLM 분당 한도에 걸리면 --gap 2000 등으로 늘린다

const gold = JSON.parse(readFileSync(new URL('../data/gold_samples.json', import.meta.url), 'utf8'));
const samples = gold.samples.filter((s) => ONLY.length === 0 || ONLY.includes(s.id));
const rank = { low: 0, uncertain: 1, medium: 1, high: 2 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
for (const s of samples) {
  const t0 = Date.now();
  let res, body;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(`${BASE}/api/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: s.text }) });
      body = await res.json();
    } catch (e) {
      body = { error: String(e) };
    }
    if (res?.status !== 429) break;
    await sleep(7000); // rate limit(분당 10회)이면 잠시 대기 후 재시도
  }
  const ms = Date.now() - t0;
  const ok = res?.ok && body?.risk;
  const row = {
    id: s.id, label: s.label, expected: s.expected_level, expected_patterns: s.expected_patterns ?? [],
    level: ok ? body.risk.level : `ERR ${res?.status ?? ''}`, score: ok ? body.risk.score : null,
    patterns: ok ? body.risk.patterns.map((p) => p.id) : [], claims: ok ? body.claims.map((c) => `${c.type}:${c.verdict}`) : [],
    degraded: ok ? (body.degraded ?? []) : [String(body?.error ?? '')], ms,
  };
  rows.push(row);
  const hit = row.expected_patterns.filter((id) => row.patterns.includes(id)).length;
  console.log(`${row.id} ${row.label.padEnd(6)} exp=${row.expected.padEnd(6)} got=${String(row.level).padEnd(9)} score=${row.score ?? '-'} pat=[${row.patterns.join(',')}] recall=${hit}/${row.expected_patterns.length} ${row.degraded.length ? 'DEGRADED:' + row.degraded.join(',') : ''} ${ms}ms`);
  await sleep(GAP_MS);
}

const scam = rows.filter((r) => r.label === 'scam');
const benign = rows.filter((r) => r.label === 'benign');
const levelMatch = scam.filter((r) => r.level === r.expected).length;
const geMedium = scam.filter((r) => (rank[r.level] ?? -1) >= 1).length;
const expTotal = scam.reduce((n, r) => n + r.expected_patterns.length, 0);
const expHit = scam.reduce((n, r) => n + r.expected_patterns.filter((id) => r.patterns.includes(id)).length, 0);
const benignLow = benign.filter((r) => r.level === 'low').length;
const falsePos = benign.filter((r) => r.level !== 'low');
const avgMs = Math.round(rows.reduce((n, r) => n + r.ms, 0) / Math.max(1, rows.length));
const errCount = rows.filter((r) => String(r.level).startsWith('ERR')).length;
const degradedCount = rows.filter((r) => r.degraded.length).length;

const lines = [];
lines.push(`# 평가 결과 (gold ${rows.length}건)`, '', `- 실행: ${new Date().toISOString()} / 대상: ${BASE}`, '');
lines.push(`## 사기 ${scam.length}건`);
lines.push(`- expected_level 일치: ${levelMatch}/${scam.length}`);
lines.push(`- level ≥ medium(uncertain 포함): ${geMedium}/${scam.length}`);
lines.push(`- expected_patterns recall(패턴 단위): ${expHit}/${expTotal} (${expTotal ? Math.round((expHit / expTotal) * 100) : 0}%)`, '');
lines.push(`## 정상 ${benign.length}건`);
lines.push(`- level = low: ${benignLow}/${benign.length}`);
lines.push(`- 오발동: ${falsePos.length}건${falsePos.length ? ' — ' + falsePos.map((r) => `${r.id}(${r.level}, [${r.patterns.join(',')}], ${r.score})`).join(', ') : ''}`, '');
lines.push(`## 지연`, `- 평균 ${avgMs}ms / 오류 ${errCount}건 / degraded ${degradedCount}건`, '');
lines.push(`## 상세`, '', '| id | label | expected | got | score | patterns | recall | claims | degraded | ms |', '|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const hit = r.expected_patterns.filter((id) => r.patterns.includes(id)).length;
  lines.push(`| ${r.id} | ${r.label} | ${r.expected} | ${r.level} | ${r.score ?? '-'} | ${r.patterns.join(' ')} | ${hit}/${r.expected_patterns.length} | ${r.claims.join(' ')} | ${r.degraded.join(' ')} | ${r.ms} |`);
}
const md = lines.join('\n') + '\n';
console.log('\n' + lines.slice(0, 14).join('\n'));
if (SAVE && ONLY.length === 0) {
  writeFileSync(new URL('../docs/eval_result.md', import.meta.url), md);
  console.log('\n→ docs/eval_result.md 저장');
}
