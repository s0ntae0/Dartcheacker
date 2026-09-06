'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CheckResponse, Claim, PatternHit, RiskLevel, Verdict } from '@/lib/types';
import { EXAMPLES } from '@/data/examples';

export type Contact = { name: string; value: string; url: string };
type Stats = { today: { total: number; high: number }; all: { total: number } };

const MAX_LEN = 4000;
const MIN_LEN = 10;
const SITE_URL = 'https://dartcheacker.vercel.app';

const LEVEL: Record<RiskLevel, { name: string; color: string; badge: string; actionTitle: string }> = {
  low: { name: '낮음', color: '#16A34A', badge: 'bg-green-50 text-green-800 border-green-200', actionTitle: '참고' },
  medium: { name: '주의', color: '#D97706', badge: 'bg-amber-50 text-amber-800 border-amber-200', actionTitle: '확인할 것' },
  high: { name: '높음', color: '#DC2626', badge: 'bg-red-50 text-red-800 border-red-200', actionTitle: '지금 하지 말아야 할 것' },
  uncertain: { name: '판단 유보', color: '#64748B', badge: 'bg-slate-100 text-slate-700 border-slate-300', actionTitle: '확인할 것' },
};

const VERDICT: Record<Verdict, { name: string; cls: string }> = {
  confirmed: { name: '확인됨', cls: 'bg-green-50 text-green-800 border-green-200' },
  partial: { name: '일부 상이', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  unconfirmed: { name: '공시 근거 미확인', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  not_disclosure_event: { name: '공시 대상 아님', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  out_of_scope: { name: '검증 범위 밖', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
};

const STAGES = ['① 유인', '② 격리', '③ 신뢰 구축', '④ 권위·기밀', '⑤ 편취', '⑥ 출금 장벽', '⑦ 이탈', '⑧ 2차 사기'];
const STAGE_MARKS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

const DEGRADED_LABEL: Record<string, string> = {
  llm_timeout: 'AI 판정 지연(규칙 기반 결과만 표시)',
  llm_parse: 'AI 판정 결과 해석 실패(규칙 기반 결과만 표시)',
  llm_error: 'AI 판정 오류(규칙 기반 결과만 표시)',
  llm_rate_limit: 'AI 판정 요청 한도 초과(규칙 기반 결과만 표시)',
  dart_unavailable: 'DART 공시 조회 지연',
  corp_lookup: '기업 검색 지연',
  internal_error: '일부 처리 오류(규칙 기반 결과만 표시)',
};

const HOW = [
  { n: '1', title: '붙여넣기', body: '메시지를 그대로 넣습니다. 회원가입 없음' },
  { n: '2', title: '두 가지 대조', body: '금감원이 유형화한 사기 수법 16종과 표현을 대조하고, 메시지 속 주장을 DART 공시와 비교합니다' },
  { n: '3', title: '근거와 함께 판정', body: '매치된 구절, 법 조문, 공시 원문 링크를 함께 보여줍니다. 미확인은 미확인으로만 표시합니다' },
];

function fmtKst(iso: string): string {
  try {
    const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} KST`;
  } catch {
    return iso;
  }
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
const isTel = (v: string) => /^[\d-]+$/.test(v);

function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="#1E3A8A" />
      <path d="M8 8h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7.5L11 25v-4H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z" fill="#fff" />
      <path d="M11.5 14.5l3 3 6-6" fill="none" stroke="#1E3A8A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Highlighted({ text, spans, color }: { text: string; spans: string[]; color: string }) {
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
      <mark key={idx} className="rounded px-0.5 font-semibold" style={{ backgroundColor: `${color}26`, color: '#0F172A' }}>
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <p className="whitespace-pre-wrap break-words text-[15px] leading-7">{out}</p>;
}

function Gauge({ score, level }: { score: number; level: RiskLevel }) {
  const R = 70;
  const L = Math.PI * R;
  const target = L * (1 - Math.max(0, Math.min(1, score)));
  const [offset, setOffset] = useState(L);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOffset(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const n = Math.round(score * 100);
  const lv = LEVEL[level];
  return (
    <div className="w-[160px] shrink-0 mx-auto sm:mx-0" role="img" aria-label={`위험 신호 지수 ${n}점, 등급 ${lv.name}`}>
      <svg viewBox="0 0 160 92" width="160" height="92" aria-hidden="true">
        <path d="M10 82 A70 70 0 0 1 150 82" fill="none" stroke="#E2E8F0" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M10 82 A70 70 0 0 1 150 82"
          fill="none"
          stroke={lv.color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={L}
          strokeDashoffset={offset}
          className="gauge-fill"
        />
        <text x="80" y="80" textAnchor="middle" fontSize="36" fontWeight="800" fill="#0F172A">{n}</text>
      </svg>
      <div className="text-center -mt-1">
        <span className={`badge ${lv.badge}`}>{lv.name}</span>
      </div>
    </div>
  );
}

function StageBar({ stage }: { stage: string }) {
  const hit = STAGE_MARKS.map((m) => stage.includes(m));
  const last = hit.lastIndexOf(true);
  if (last < 0) return null;
  return (
    <div className="mt-4">
      <div className="text-xs text-slate-600 mb-1.5">이 메시지가 해당하는 단계: <span className="font-semibold text-ink">{stage}</span></div>
      <div className="flex gap-0.5" aria-hidden="true">
        {STAGES.map((s, i) => (
          <div key={s} className={`h-2 flex-1 rounded-sm ${i <= last ? (hit[i] ? 'bg-red-500' : 'bg-red-300') : 'bg-slate-200'}`} title={s} />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-slate-500 mt-1">
        <span>{STAGES[0]}</span>
        <span>{STAGES[STAGES.length - 1]}</span>
      </div>
    </div>
  );
}

function PatternItem({ p, color }: { p: PatternHit; color: string }) {
  return (
    <li className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-slate-500">{p.id} · {p.category}</div>
          <div className="font-semibold text-[15px] mt-0.5">{p.label}</div>
        </div>
        {p.hard && <span className="badge bg-red-600 text-white border-red-600">강한 신호</span>}
      </div>
      {p.spans.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {p.spans.map((s, i) => (
            <li key={i} className="text-sm text-ink border-l-4 pl-3 py-0.5" style={{ borderColor: color }}>
              “{s}”
            </li>
          ))}
        </ul>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-accent underline underline-offset-2 inline-block py-2 min-h-11 leading-7">법적 근거 보기</summary>
        <p className="text-slate-700 leading-6 mt-1">{p.legal_basis}</p>
        {p.sources.length > 0 && (
          <p className="mt-2 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
            <span>출처</span>
            {p.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="underline text-accent py-1" aria-label={`${s.title} (${domainOf(s.url)})`}>
                {domainOf(s.url)}
              </a>
            ))}
          </p>
        )}
      </details>
    </li>
  );
}

function ClaimRow({ c }: { c: Claim }) {
  const v = VERDICT[c.verdict] ?? VERDICT.unconfirmed;
  return (
    <li className="rounded-xl border border-line bg-white p-4 flex gap-3 items-start">
      <span className={`badge shrink-0 ${v.cls}`}>{v.name}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">
          “{c.text}”
          {c.corp && <span className="text-xs text-slate-500 ml-1.5">{c.corp.corp_name} ({c.corp.stock_code})</span>}
          {c.evidence?.corrected && <span className="badge ml-1.5 bg-orange-50 text-orange-800 border-orange-200">정정 반영</span>}
        </p>
        <p className="mt-1.5 text-sm text-slate-700 leading-6"><Linkify text={c.detail} /></p>
        {c.note && <p className="mt-1 text-xs text-slate-500 leading-5"><Linkify text={c.note} /></p>}
        {c.evidence && (
          <a
            href={c.evidence.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center min-h-11 mt-1 px-3 rounded-lg border border-line bg-slate-50 text-sm font-medium text-accent hover:bg-slate-100"
            aria-label={`공시 원문 보기: ${c.evidence.report_nm.trim()} (새 창)`}
          >
            공시 원문 보기 <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </li>
  );
}

export default function CheckApp({ contacts, disclaimer }: { contacts: Contact[]; disclaimer: string }) {
  const [text, setText] = useState('');
  const [checkedText, setCheckedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Stats | null) => j && setStats(j))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (result && resultsRef.current) resultsRef.current.scrollIntoView({ block: 'start' });
  }, [result]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const runCheck = useCallback(async (input: string) => {
    if (loadingRef.current) return;
    const t = input.trim();
    if (t.length < MIN_LEN) { setError(`${MIN_LEN}자 이상 입력하세요.`); return; }
    if (t.length > MAX_LEN) { setError(`${MAX_LEN}자 이하로 입력하세요.`); return; }
    loadingRef.current = true;
    setLoading(true);
    setStage('사기 수법 대조 중…');
    setError(null);
    setResult(null);
    const timer = setTimeout(() => setStage('공시 조회 중…'), 1500);
    try {
      const res = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(res.status === 429 ? '잠시 요청이 많습니다. 1분 뒤 다시 시도해주세요.' : (json?.error ?? `오류가 발생했습니다 (${res.status})`));
        return;
      }
      setCheckedText(t);
      setResult(json as CheckResponse);
    } catch {
      setError('연결이 끊겼습니다. 다시 시도해주세요.');
    } finally {
      clearTimeout(timer);
      loadingRef.current = false;
      setLoading(false);
      setStage(null);
    }
  }, []);

  function useExample(t: string) {
    setText(t);
    void runCheck(t);
  }

  function reset() {
    setText('');
    setResult(null);
    setError(null);
    window.scrollTo({ top: 0 });
    textareaRef.current?.focus();
  }

  function buildShareText(r: CheckResponse): string {
    const lv = LEVEL[r.risk.level] ?? LEVEL.uncertain;
    const lines = [`[찌라시체크 결과] 위험 신호 지수 ${Math.round(r.risk.score * 100)} · ${lv.name}`];
    lines.push(`일치 유형: ${r.risk.patterns.length ? r.risk.patterns.map((p) => p.label).join(' / ') : '없음'}`);
    const when = fmtKst(r.checked_at);
    if (r.claims.length) {
      for (const c of r.claims.slice(0, 3)) {
        const short = c.text.length > 30 ? `${c.text.slice(0, 30)}…` : c.text;
        lines.push(`공시 대조: ${c.corp ? `${c.corp.corp_name} ` : ''}${short} — ${(VERDICT[c.verdict] ?? VERDICT.unconfirmed).name} (${when} 기준)`);
      }
    } else lines.push(`공시 대조: 기업명이 포함된 주장 없음 (${when} 기준)`);
    lines.push(`자세히: ${SITE_URL}`);
    return lines.join('\n');
  }

  async function copyResult() {
    if (!result) return;
    const s = buildShareText(result);
    try {
      await navigator.clipboard.writeText(s);
      setToast('결과 요약을 복사했습니다. 그 채팅방에 붙여넣어 공유하세요.');
    } catch {
      setCopyFallback(s);
    }
  }

  const lv = result ? LEVEL[result.risk.level] ?? LEVEL.uncertain : null;
  const hardHit = result?.risk.patterns.some((p) => p.hard) ?? false;
  const nextHint = result?.risk.patterns.find((p) => p.next_step_hint)?.next_step_hint ?? null;
  const allSpans = result ? result.risk.patterns.flatMap((p) => p.spans) : [];
  const showStats = !!stats && stats.all.total > 0;

  return (
    <>
      <header className="sticky top-0 z-20 bg-white border-b border-line">
        <div className="max-w-[640px] mx-auto px-4 h-14 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2 min-h-11" aria-label="찌라시체크 홈">
            <Mark size={24} />
            <span className="font-bold text-[17px] text-brand">찌라시체크</span>
          </a>
          <nav aria-label="페이지 내 이동" className="hidden md:flex items-center gap-1 text-sm text-slate-700">
            <a href="#how" className="px-3 py-3 rounded-lg hover:bg-slate-50">작동 원리</a>
            <a href="#report" className="px-3 py-3 rounded-lg hover:bg-slate-50">신고처</a>
            <a href="#sources" className="px-3 py-3 rounded-lg hover:bg-slate-50">출처</a>
          </nav>
        </div>
      </header>

      <main id="top" className="flex-1 w-full max-w-[640px] mx-auto px-4 pb-16 space-y-6">
        {/* 1. 히어로 */}
        {result ? (
          <h1 className="text-lg font-bold pt-5">그 메시지, 공시로 확인하세요</h1>
        ) : (
          <section className="pt-8 pb-2 -mx-4 px-4" style={{ background: 'linear-gradient(180deg, rgba(30,58,138,0.07) 0%, rgba(30,58,138,0) 100%)' }}>
            <h1 className="text-[28px] sm:text-[34px] font-extrabold leading-tight tracking-tight text-ink">그 메시지, 공시로 확인하세요</h1>
            <p className="mt-3 text-[15px] text-slate-700 leading-7">
              리딩방·오픈채팅·SNS에서 받은 주식 메시지를 붙여넣으면 사기 수법 일치 여부와 공시 근거를 30초 안에 알려드립니다.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-brand" aria-label="신뢰 근거">
              {['금융감독원 소비자경보 기준', 'OpenDART 실시간 대조', '판정 근거 전부 인용'].map((t) => (
                <li key={t} className="rounded-full border border-blue-200 bg-white px-3 py-1.5">{t}</li>
              ))}
            </ul>
          </section>
        )}

        {/* 2. 입력 카드 */}
        <section className="card p-4 shadow-sm" aria-labelledby="input-title">
          <h2 id="input-title" className="sr-only">메시지 입력</h2>
          <label htmlFor="msg" className="sr-only">받은 메시지</label>
          <textarea
            id="msg"
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder="받은 메시지를 그대로 붙여넣으세요. 링크·이모지 그대로 두셔도 됩니다."
            className="w-full h-40 resize-y rounded-xl border border-slate-300 p-3 text-[15px] leading-6 focus:outline-none focus:border-accent focus:ring-2 focus:ring-blue-200"
          />
          <div className="flex items-center justify-end mt-1">
            <span className={`text-xs ${text.length >= MAX_LEN ? 'text-red-700' : 'text-slate-500'}`}>{text.length.toLocaleString()}/{MAX_LEN.toLocaleString()}</span>
          </div>
          <button
            type="button"
            onClick={() => void runCheck(text)}
            disabled={loading}
            className="mt-2 w-full h-[52px] rounded-xl bg-accent text-white text-[16px] font-bold disabled:opacity-70 flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            {loading && <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" />}
            {loading ? stage ?? '확인 중…' : '공시로 확인하기'}
          </button>
          <p className="mt-2 text-sm text-red-700 min-h-5" role="alert">{error ?? ''}</p>
        </section>

        {/* 3. 예시 카드 */}
        <details className="group" open={!result}>
          <summary className="cursor-pointer list-none text-[17px] font-bold py-2 min-h-11 flex items-center gap-2">
            <span>이런 메시지, 받아보셨나요?</span>
            <span className="text-xs font-normal text-slate-500 group-open:hidden">펼치기</span>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-1">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.key}
                type="button"
                onClick={() => useExample(ex.text)}
                disabled={loading}
                className="card text-left p-4 hover:border-blue-300 hover:shadow-sm disabled:opacity-60 flex flex-col gap-2 min-h-[132px]"
              >
                <span className="text-xs text-slate-500">{ex.source}</span>
                <span className="text-sm text-ink leading-6 line-clamp-2">{ex.text}</span>
                <span className="mt-auto text-sm font-semibold text-accent">이 메시지로 검사 <span aria-hidden="true">→</span></span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 leading-5">
            예시는 실제 사실이 아닌 가상 메시지입니다. 기업명은 검증 시연을 위해 실제 상장사를 사용했습니다.
          </p>
        </details>

        {/* 4. 작동 원리 */}
        <details id="how" className="group scroll-mt-20" open={!result}>
          <summary className="cursor-pointer list-none text-[17px] font-bold py-2 min-h-11 flex items-center gap-2">
            <span>작동 원리</span>
            <span className="text-xs font-normal text-slate-500 group-open:hidden">펼치기</span>
          </summary>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
            {HOW.map((h) => (
              <li key={h.n} className="card p-4">
                <div className="flex items-center gap-2">
                  <span className="h-7 w-7 rounded-full bg-brand text-white text-sm font-bold flex items-center justify-center" aria-hidden="true">{h.n}</span>
                  <span className="font-semibold">{h.title}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700 leading-6">{h.body}</p>
              </li>
            ))}
          </ol>
        </details>

        {/* 5. 오늘의 검사 */}
        {showStats && stats && (
          <p className="text-sm text-slate-600 rounded-xl bg-white border border-line px-4 py-3" aria-label="검사 통계">
            오늘 <span className="font-semibold text-ink">{stats.today.total.toLocaleString()}건</span> 검사 · 높음 <span className="font-semibold text-red-700">{stats.today.high.toLocaleString()}건</span> · 누적 <span className="font-semibold text-ink">{stats.all.total.toLocaleString()}건</span>
          </p>
        )}

        {/* 결과 */}
        {result && lv && (
          <div ref={resultsRef} className="space-y-6 scroll-mt-20">
            {/* 카드 A */}
            <section className="card p-4 sm:p-5 shadow-sm" aria-labelledby="card-a">
              <div className="flex items-center justify-between gap-2">
                <h2 id="card-a" className="text-[17px] font-bold">위험 신호 지수</h2>
                <button type="button" onClick={() => void copyResult()} className="min-h-11 px-3 rounded-lg border border-line bg-slate-50 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  결과 복사
                </button>
              </div>
              {hardHit && (
                <div className="mt-3 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 bg-red-600 text-white text-[15px] font-bold leading-6">
                  금융감독원이 &lsquo;100% 사기&rsquo;로 안내한 신호가 포함돼 있습니다
                </div>
              )}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <Gauge score={result.risk.score} level={result.risk.level} />
                <p className="text-[15px] leading-7 text-ink text-center sm:text-left">{result.risk.headline}</p>
              </div>
              {result.risk.stage && result.risk.stage !== '해당 없음' && <StageBar stage={result.risk.stage} />}
              {result.risk.reflection && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-600">반대로 생각해보면</div>
                  <p className="text-sm text-slate-700 leading-6 mt-1">{result.risk.reflection}</p>
                </div>
              )}
              {result.risk.patterns.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {result.risk.patterns.map((p) => (
                    <PatternItem key={p.id} p={p} color={lv.color} />
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-sm text-slate-700">금감원 소비자경보 유형과 일치하는 표현이 발견되지 않았습니다.</p>
              )}
              {nextHint && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="text-xs font-semibold text-amber-800">이 다음에 올 수 있는 것</div>
                  <p className="text-sm text-amber-900 mt-1 leading-6">{nextHint}</p>
                </div>
              )}
              {result.risk.benign.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="정상 신호">
                  {result.risk.benign.map((b) => (
                    <li key={b.id} className="badge bg-green-50 text-green-800 border-green-200">
                      {b.id === 'B01' ? '공시 링크 포함 — 근거 확인 가능' : b.label}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 원문 하이라이트 */}
            <section className="card p-4 sm:p-5 shadow-sm" aria-labelledby="card-hl">
              <h2 id="card-hl" className="text-[17px] font-bold mb-3">원문에서 걸린 부분</h2>
              <Highlighted text={checkedText} spans={allSpans} color={lv.color} />
            </section>

            {/* 카드 B */}
            <section className="card p-4 sm:p-5 shadow-sm" aria-labelledby="card-b">
              <h2 id="card-b" className="text-[17px] font-bold">메시지 속 주장, 공시로 확인</h2>
              {result.claims.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {result.claims.map((c, i) => (
                    <ClaimRow key={i} c={c} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-700 leading-6">기업명이 포함된 구체적 주장이 없어 공시 대조를 하지 않았습니다.</p>
              )}
            </section>

            {/* 행동 요령 */}
            <section className="card p-4 sm:p-5 shadow-sm" aria-labelledby="card-act">
              <h2 id="card-act" className="text-[17px] font-bold">{lv.actionTitle}</h2>
              <ul className="mt-3 space-y-2.5">
                {result.actions.map((a) => (
                  <li key={a} className="flex items-start gap-3 text-[15px] leading-6">
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full border-2" style={{ borderColor: lv.color }} aria-hidden="true" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* 하단 */}
            <div className="space-y-3">
              <p className="text-sm text-slate-600">최종 확인 {fmtKst(result.checked_at)}</p>
              {result.degraded && result.degraded.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm p-3 leading-6" role="status">
                  일부 확인이 지연됐습니다: {result.degraded.map((d) => DEGRADED_LABEL[d] ?? d).join(', ')}
                </div>
              )}
              <p className="text-xs text-slate-500 leading-5">{disclaimer}</p>
              <button type="button" onClick={reset} className="w-full h-[52px] rounded-xl border border-line bg-white text-[15px] font-bold text-brand hover:bg-slate-50">
                다른 메시지 검사하기
              </button>
            </div>
          </div>
        )}

        {/* 6. 신고처 */}
        <section id="report" className="scroll-mt-20" aria-labelledby="report-title">
          <h2 id="report-title" className="text-[17px] font-bold py-2">신고·상담처</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {contacts.map((c) => (
              <li key={c.name} className="card p-4 flex flex-col gap-1">
                <span className="text-sm text-slate-700 leading-5">{c.name}</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {c.value && isTel(c.value) ? (
                    <a href={`tel:${c.value.replace(/-/g, '')}`} className="inline-flex items-center min-h-11 text-lg font-bold text-accent" aria-label={`${c.value} 전화 걸기: ${c.name}`}>
                      {c.value}
                    </a>
                  ) : c.value ? (
                    <span className="text-base font-semibold">{c.value}</span>
                  ) : null}
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 text-sm text-accent underline underline-offset-2" aria-label={`바로가기: ${c.name} (새 창)`}>
                      바로가기 <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer id="sources" className="border-t border-line bg-white scroll-mt-20">
        <div className="max-w-[640px] mx-auto px-4 py-6 text-xs text-slate-500 leading-5 space-y-2">
          <p>출처: 금융감독원 소비자경보 · 금융위원회 · OpenDART · 자본시장법</p>
          <p>{disclaimer}</p>
          <p>데이터 기준: 최근 90일 공시 · 상장사 3,989개사</p>
        </div>
      </footer>

      {toast && (
        <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-2rem)] rounded-xl bg-ink text-white text-sm px-4 py-3 shadow-lg">
          {toast}
        </div>
      )}

      {copyFallback && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="copy-title">
          <div className="card w-full max-w-md p-4 space-y-3">
            <h2 id="copy-title" className="font-bold">결과 요약을 직접 복사하세요</h2>
            <p className="text-sm text-slate-600">클립보드 권한이 없어 자동 복사에 실패했습니다. 아래 텍스트를 길게 눌러 복사하세요.</p>
            <label htmlFor="copy-text" className="sr-only">결과 요약 텍스트</label>
            <textarea id="copy-text" readOnly value={copyFallback} className="w-full h-40 rounded-xl border border-slate-300 p-3 text-sm" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => setCopyFallback(null)} className="w-full h-11 rounded-xl bg-accent text-white font-bold">닫기</button>
          </div>
        </div>
      )}
    </>
  );
}
