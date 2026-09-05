'use client';

import { useState, type ReactNode } from 'react';
import type { CheckResponse, Claim, PatternHit, RiskLevel, Verdict } from '@/lib/types';
import { EXAMPLES } from '@/data/examples';

const MAX_LEN = 4000;

const LEVEL: Record<RiskLevel, { name: string; badge: string; num: string; mark: string; bar: string }> = {
  low: { name: '낮음', badge: 'bg-green-100 text-green-800 border-green-300', num: 'text-green-700', mark: 'bg-green-200', bar: 'bg-green-500' },
  medium: { name: '주의', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', num: 'text-yellow-700', mark: 'bg-yellow-200', bar: 'bg-yellow-500' },
  high: { name: '높음', badge: 'bg-red-100 text-red-800 border-red-300', num: 'text-red-700', mark: 'bg-red-200', bar: 'bg-red-500' },
  uncertain: { name: '판단 유보', badge: 'bg-gray-100 text-gray-700 border-gray-300', num: 'text-gray-600', mark: 'bg-gray-200', bar: 'bg-gray-400' },
};

const VERDICT: Record<Verdict, { name: string; cls: string }> = {
  confirmed: { name: '확인됨', cls: 'bg-green-100 text-green-800' },
  partial: { name: '일부 상이', cls: 'bg-yellow-100 text-yellow-800' },
  unconfirmed: { name: '공시 근거 미확인', cls: 'bg-gray-100 text-gray-700' },
  not_disclosure_event: { name: '공시 대상 아님', cls: 'bg-gray-100 text-gray-700' },
  out_of_scope: { name: '검증 범위 밖', cls: 'bg-gray-100 text-gray-700' },
};

const STAGES = ['① 유인', '② 격리', '③ 신뢰 구축', '④ 권위·기밀', '⑤ 편취', '⑥ 출금 장벽', '⑦ 이탈', '⑧ 2차 사기'];
const STAGE_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

const DEGRADED_LABEL: Record<string, string> = {
  llm_timeout: 'AI 판정 지연(규칙 기반 결과만 표시)',
  llm_parse: 'AI 판정 결과 해석 실패(규칙 기반 결과만 표시)',
  llm_error: 'AI 판정 오류(규칙 기반 결과만 표시)',
  dart_unavailable: 'DART 공시 조회 지연',
  corp_lookup: '기업 검색 지연',
};

function fmtKST(iso: string) {
  try {
    return (
      new Date(iso).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }) + ' KST'
    );
  } catch {
    return iso;
  }
}

function Highlighted({ text, spans, markCls }: { text: string; spans: string[]; markCls: string }) {
  const ranges: [number, number][] = [];
  for (const s of spans) {
    if (!s) continue;
    let i = text.indexOf(s);
    while (i >= 0) {
      ranges.push([i, i + s.length]);
      i = text.indexOf(s, i + s.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], idx) => {
    if (s < pos) return; // 겹침 무시
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <mark key={idx} className={`${markCls} rounded px-0.5`}>
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <p className="whitespace-pre-wrap break-words text-sm leading-6">{out}</p>;
}

function StageBar({ stage }: { stage: string }) {
  const hit = STAGE_MARKS.map((m) => stage.includes(m));
  const last = hit.lastIndexOf(true);
  if (last < 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs text-gray-600 mb-1">사기 진행 단계(추정): {stage}</div>
      <div className="flex gap-0.5">
        {STAGES.map((s, i) => (
          <div key={s} className={`h-2 flex-1 rounded-sm ${i <= last ? (hit[i] ? 'bg-red-500' : 'bg-red-300') : 'bg-gray-200'}`} title={s} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{STAGES[0]}</span>
        <span>{STAGES[STAGES.length - 1]}</span>
      </div>
    </div>
  );
}

function PatternItem({ p }: { p: PatternHit }) {
  return (
    <li className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs text-gray-500">{p.id} · {p.category}</span>
          <div className="font-semibold text-sm">{p.label}</div>
        </div>
        {p.hard && <span className="shrink-0 text-[11px] px-2 py-0.5 rounded-full bg-red-600 text-white">강한 신호</span>}
      </div>
      {p.spans.length > 0 && (
        <ul className="mt-2 space-y-1">
          {p.spans.map((s, i) => (
            <li key={i} className="text-sm text-gray-800">“{s}”</li>
          ))}
        </ul>
      )}
      <details className="mt-2 text-xs text-gray-600">
        <summary className="cursor-pointer text-blue-700">근거·출처 보기</summary>
        <p className="mt-1 leading-5">{p.legal_basis}</p>
        {p.sources.length > 0 && (
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {p.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline break-all">{s.title}</a>
              </li>
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}

function ClaimRow({ c }: { c: Claim }) {
  const v = VERDICT[c.verdict] ?? VERDICT.unconfirmed;
  return (
    <li className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-start gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v.cls}`}>{v.name}</span>
        {c.corp && (
          <span className="text-xs text-gray-600">{c.corp.corp_name} ({c.corp.stock_code})</span>
        )}
        {c.evidence?.corrected && <span className="text-[11px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">정정 반영</span>}
      </div>
      <p className="mt-1.5 text-sm text-gray-900">“{c.text}”</p>
      <p className="mt-1 text-sm text-gray-700">{c.detail}</p>
      {c.evidence && (
        <p className="mt-1 text-xs">
          <a href={c.evidence.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            DART 원문: {c.evidence.report_nm.trim()} ({c.evidence.rcept_dt})
          </a>
        </p>
      )}
      {c.note && <p className="mt-1 text-xs text-gray-500 leading-5">{c.note}</p>}
    </li>
  );
}

export default function Home() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    if (loading) return;
    const t = text.trim();
    if (t.length < 10) { setError('10자 이상 입력하세요.'); return; }
    if (t.length > MAX_LEN) { setError(`${MAX_LEN}자 이하로 입력하세요.`); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(res.status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해주세요.' : (json?.error ?? `오류가 발생했습니다 (${res.status})`));
        return;
      }
      setResult(json as CheckResponse);
    } catch {
      setError('네트워크 오류입니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }

  const lv = result ? LEVEL[result.risk.level] ?? LEVEL.uncertain : null;
  const hardHit = result?.risk.patterns.some((p) => p.hard) ?? false;
  const nextHint = result?.risk.patterns.find((p) => p.next_step_hint)?.next_step_hint ?? null;
  const allSpans = result ? result.risk.patterns.flatMap((p) => p.spans) : [];

  return (
    <main className="flex-1 w-full max-w-md mx-auto px-4 py-6 pb-16">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">찌라시체크</h1>
        <p className="text-sm text-gray-600 mt-1">리딩방·SNS 주식 메시지, 공시로 확인하세요</p>
      </header>

      <section className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          placeholder="받은 메시지를 그대로 붙여넣으세요"
          rows={6}
          className="w-full resize-y rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex items-center justify-between mt-1">
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.key}
                type="button"
                onClick={() => { setText(ex.text); setResult(null); setError(null); }}
                className="text-xs px-2 py-1 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100"
              >
                {ex.label}
              </button>
            ))}
          </div>
          <span className={`text-[11px] ${text.length >= MAX_LEN ? 'text-red-600' : 'text-gray-400'}`}>{text.length}/{MAX_LEN}</span>
        </div>
        <button
          type="button"
          onClick={check}
          disabled={loading}
          className="mt-3 w-full rounded-lg bg-blue-600 text-white font-semibold py-3 disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {loading && <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />}
          {loading ? '확인 중… (최대 20초)' : '검사하기'}
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>

      {result && lv && (
        <div className="mt-5 space-y-5">
          {result.degraded && result.degraded.length > 0 && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-300 text-yellow-900 text-xs p-3">
              일부 확인이 지연됐습니다: {result.degraded.map((d) => DEGRADED_LABEL[d] ?? d).join(', ')}
            </div>
          )}

          {/* 카드 A — 위험 신호 지수 */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-base font-bold">위험 신호 지수</h2>
            {hardHit && (
              <div className="mt-2 rounded-lg bg-red-600 text-white text-sm font-semibold p-3">
                금감원이 &lsquo;100% 사기&rsquo;로 안내한 신호입니다
              </div>
            )}
            <div className="mt-3 flex items-center gap-4">
              <div className={`text-5xl font-black tabular-nums ${lv.num}`}>{Math.round(result.risk.score * 100)}</div>
              <div>
                <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${lv.badge}`}>{lv.name}</span>
                <p className="text-sm mt-1 leading-5">{result.risk.headline}</p>
              </div>
            </div>
            {result.risk.stage && result.risk.stage !== '해당 없음' && <StageBar stage={result.risk.stage} />}
            {result.risk.reflection && (
              <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-2 leading-5">
                <span className="font-semibold">정상일 가능성 검토:</span> {result.risk.reflection}
              </p>
            )}
            {result.risk.benign.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {result.risk.benign.map((b) => (
                  <span key={b.id} className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
                    {b.id === 'B01' ? '공시 링크 포함 — 근거 확인 가능' : b.label}
                  </span>
                ))}
              </div>
            )}
            {result.risk.patterns.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {result.risk.patterns.map((p) => (
                  <PatternItem key={p.id} p={p} />
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-gray-600">매치된 사기 신호 패턴이 없습니다.</p>
            )}
            {nextHint && (
              <div className="mt-4 rounded-lg border border-orange-300 bg-orange-50 p-3">
                <div className="text-xs font-semibold text-orange-800">다음에 올 가능성이 높은 것</div>
                <p className="text-sm text-orange-900 mt-1 leading-5">{nextHint}</p>
              </div>
            )}
          </section>

          {/* 원문 하이라이트 */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-base font-bold mb-2">원문 하이라이트</h2>
            <Highlighted text={text.trim()} spans={allSpans} markCls={lv.mark} />
          </section>

          {/* 카드 B — 주장별 공시 대조 */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-base font-bold">주장별 공시 대조</h2>
            {result.claims.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {result.claims.map((c, i) => (
                  <ClaimRow key={i} c={c} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-600">공시로 대조할 기업·사건 주장이 발견되지 않았습니다.</p>
            )}
          </section>

          {/* 행동 요령 + 신고처 */}
          <section className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-base font-bold">행동 요령</h2>
            <ol className="mt-2 list-decimal pl-5 space-y-1 text-sm leading-5">
              {result.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <h3 className="text-sm font-bold mt-4">신고·상담처</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {result.contacts.map((c) => (
                <li key={c.name} className="flex flex-wrap gap-x-2">
                  <span className="text-gray-700">{c.name}</span>
                  {c.value && /^[\d-]+$/.test(c.value) ? (
                    <a href={`tel:${c.value.replace(/-/g, '')}`} className="text-blue-700 underline">{c.value}</a>
                  ) : c.value ? (
                    <span>{c.value}</span>
                  ) : null}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline text-xs self-center">바로가기</a>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <footer className="text-[11px] text-gray-500 leading-5">
            <p>최종 확인 {fmtKST(result.checked_at)}</p>
            <p className="mt-1">{result.disclaimer}</p>
          </footer>
        </div>
      )}
    </main>
  );
}
