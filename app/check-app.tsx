'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { CheckResponse, Claim, ClaimType, RiskLevel, Verdict } from '@/lib/types';
import { EXAMPLES } from '@/data/examples';

export type Contact = { name: string; value: string; url: string };
type Stats = { today: { total: number; high: number }; all: { total: number } };
type HistoryItem = { id: string; at: string; text: string; level: RiskLevel; score: number; response: CheckResponse };

const MAX_LEN = 4000;
const MIN_LEN = 10;
const SITE_URL = 'https://dartcheacker.vercel.app';
const HISTORY_KEY = 'jjirasi.history.v1';
const HISTORY_MAX = 20;
const STRONG_WEIGHT = 0.3;

const LV: Record<RiskLevel, { cls: 'hi' | 'mid' | 'lo' | 'unk'; name: string; title: string }> = {
  high: { cls: 'hi', name: '높음', title: '지금 하지 말아야 할 것' },
  medium: { cls: 'mid', name: '주의', title: '확인할 것' },
  low: { cls: 'lo', name: '낮음', title: '참고' },
  uncertain: { cls: 'unk', name: '판단 유보', title: '확인할 것' },
};
const VD: Record<Verdict, { cls: 'lo' | 'mid' | 'unk'; name: string }> = {
  confirmed: { cls: 'lo', name: '확인됨' },
  partial: { cls: 'mid', name: '일부 상이' },
  unconfirmed: { cls: 'unk', name: '공시 근거 미확인' },
  not_disclosure_event: { cls: 'unk', name: '공시 대상 아님' },
  out_of_scope: { cls: 'unk', name: '검증 범위 밖' },
};
const TYPE_LABEL: Record<ClaimType, string> = {
  supply_contract: '공급계약', capital_increase: '유상증자', convertible_bond: '전환사채', earnings: '실적',
  major_holder: '최대주주 변경', ceo_change: '대표이사 변경', merger: '합병', listing: '상장',
  executive_rumor: '임원 거취', price_forecast: '가격 예측', insider_claim: '내부정보 주장', other: '기타',
};
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
// 사이드바 바로가기 6개: 라벨은 v3 목업, URL은 patterns.json action_guide.contacts에서 이름으로 찾는다
const LINKS: { match: string; label: string; tel?: string }[] = [
  { match: '파인 유사투자자문업자', label: '파인 · 유사투자자문업자 신고현황' },
  { match: '파인 제도권', label: '파인 · 제도권 금융회사 조회' },
  { match: '금융감독원 불법금융신고', label: '금융감독원 불법금융신고', tel: '1332' },
  { match: '경찰 사이버범죄', label: '경찰 사이버범죄 신고 ECRM' },
  { match: 'KISA', label: 'KISA 불법스팸대응센터', tel: '118' },
  { match: '금융위 불공정거래', label: '금융위 불공정거래 신고' },
];

function kst(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16), md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
}
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'string' && typeof x.text === 'string' && x.response?.risk) : [];
  } catch {
    return [];
  }
}
function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* 저장 불가(사생활 보호 모드 등)면 조용히 무시 */
  }
}
function grow(el: HTMLTextAreaElement, max: number) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
}

function Brand() {
  return (
    <div className="brand">
      <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 9.2l2.6 2.6L13 6.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      찌라시체크
    </div>
  );
}

function Highlighted({ text, spans }: { text: string; spans: Map<string, boolean> }) {
  const ranges: [number, number, boolean][] = [];
  for (const [s, weak] of spans) {
    if (!s) continue;
    let i = text.indexOf(s);
    while (i >= 0) {
      ranges.push([i, i + s.length, weak]);
      i = text.indexOf(s, i + s.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e, weak], idx) => {
    if (s < pos) return;
    if (s > pos) out.push(text.slice(pos, s));
    out.push(
      <mark key={idx} className={weak ? 'mid' : undefined}>
        {text.slice(s, e)}
      </mark>,
    );
    pos = e;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return <div className="orig">{out}</div>;
}

export default function CheckApp({ contacts, disclaimer, weights }: { contacts: Contact[]; disclaimer: string; weights: Record<string, number> }) {
  const [text, setText] = useState('');
  const [dockText, setDockText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [checkedText, setCheckedText] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [fromHistory, setFromHistory] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [copied, setCopied] = useState(false);
  const [openLegal, setOpenLegal] = useState<Record<string, boolean>>({});
  const loadingRef = useRef(false);
  const homeTa = useRef<HTMLTextAreaElement>(null);
  const dockTa = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const focusHome = useRef(false);

  const fetchStats = useCallback(() => {
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Stats | null) => j && setStats(j))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setHistory(loadHistory());
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (!result && focusHome.current) {
      focusHome.current = false;
      homeTa.current?.focus();
    }
  }, [result]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const runCheck = useCallback(
    async (input: string) => {
      if (loadingRef.current) return;
      const t = input.trim();
      if (t.length < MIN_LEN) { setError(`${MIN_LEN}자 이상 입력하세요.`); return; }
      if (t.length > MAX_LEN) { setError(`${MAX_LEN.toLocaleString()}자 이하로 입력하세요.`); return; }
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(res.status === 429 ? '잠시 요청이 많습니다. 1분 뒤 다시 시도해주세요.' : (json?.error ?? `오류가 발생했습니다 (${res.status})`));
          return;
        }
        const r = json as CheckResponse;
        const item: HistoryItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: r.checked_at, text: t, level: r.risk.level, score: r.risk.score, response: r };
        setHistory((h) => {
          const next = [item, ...h].slice(0, HISTORY_MAX);
          saveHistory(next);
          return next;
        });
        setCheckedText(t);
        setText(t);
        setDockText('');
        setResult(r);
        setCurrentId(item.id);
        setFromHistory(false);
        setOpenLegal({});
        mainRef.current?.scrollTo({ top: 0 });
        fetchStats();
      } catch {
        setError('연결이 끊겼습니다. 다시 시도해주세요.');
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [fetchStats],
  );

  function newCheck() {
    setResult(null);
    setText('');
    setDockText('');
    setError(null);
    setCurrentId(null);
    setFromHistory(false);
    setDrawer(false);
    focusHome.current = true;
  }
  function openHistory(item: HistoryItem) {
    setResult(item.response);
    setCheckedText(item.text);
    setText(item.text);
    setCurrentId(item.id);
    setFromHistory(true);
    setError(null);
    setOpenLegal({});
    setDrawer(false);
    mainRef.current?.scrollTo({ top: 0 });
  }
  function removeHistory(id: string) {
    setHistory((h) => {
      const next = h.filter((x) => x.id !== id);
      saveHistory(next);
      return next;
    });
    if (id === currentId) setCurrentId(null);
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>, value: string) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runCheck(value);
    }
  }
  function shareText(r: CheckResponse): string {
    const lv = LV[r.risk.level] ?? LV.uncertain;
    const when = kst(r.checked_at);
    const lines = [`[찌라시체크 결과] 위험 신호 지수 ${Math.round(r.risk.score * 100)} · ${lv.name}`];
    lines.push(`일치 유형: ${r.risk.patterns.length ? r.risk.patterns.map((p) => p.label).join(' / ') : '없음'}`);
    if (r.claims.length) {
      for (const c of r.claims.slice(0, 3)) {
        const short = c.text.length > 30 ? `${c.text.slice(0, 30)}…` : c.text;
        lines.push(`공시 대조: ${c.corp ? `${c.corp.corp_name} ` : ''}${short} — ${(VD[c.verdict] ?? VD.unconfirmed).name} (${when.date} ${when.time} KST 기준)`);
      }
    } else lines.push(`공시 대조: 기업명이 포함된 주장 없음 (${when.date} ${when.time} KST 기준)`);
    lines.push(`자세히: ${SITE_URL}`);
    return lines.join('\n');
  }
  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(shareText(result));
      setCopied(true);
    } catch {
      window.prompt('아래 텍스트를 복사하세요', shareText(result));
    }
  }
  const findContact = (m: string) => contacts.find((c) => c.name.includes(m));

  // ----- 파생값 -----
  const lv = result ? LV[result.risk.level] ?? LV.uncertain : null;
  const n = result ? Math.round(result.risk.score * 100) : 0;
  const meterOn = result ? Math.round(result.risk.score * 10) : 0;
  const hardHits = result ? result.risk.patterns.filter((p) => p.hard) : [];
  const isWeak = (id: string, hard: boolean) => !hard && (weights[id] ?? 0) < STRONG_WEIGHT;
  const spanMap = new Map<string, boolean>();
  if (result) {
    for (const p of result.risk.patterns) {
      const weak = isWeak(p.id, p.hard);
      for (const s of p.spans) spanMap.set(s, spanMap.has(s) ? spanMap.get(s)! && weak : weak);
    }
  }
  const stageHit = result?.risk.stage ? STAGE_MARKS.map((m) => result.risk.stage!.includes(m)) : [];
  const stageLast = stageHit.lastIndexOf(true);
  const nextHint = result?.risk.patterns.find((p) => p.next_step_hint)?.next_step_hint ?? null;
  const reflection = result?.risk.reflection ?? null;
  const when = result ? kst(result.checked_at) : null;
  const todayKst = kst(new Date().toISOString()).date;
  const histToday = history.filter((h) => kst(h.at).date === todayKst);
  const histPrev = history.filter((h) => kst(h.at).date !== todayKst);

  const renderHist = (items: HistoryItem[]) =>
    items.map((h) => {
      const k = kst(h.at);
      const cls = (LV[h.level] ?? LV.uncertain).cls;
      return (
        <div key={h.id} className={`hitem${h.id === currentId ? ' on' : ''}`}>
          <button type="button" className="hbtn" onClick={() => openHistory(h)} aria-current={h.id === currentId ? 'true' : undefined}>
            <i className={`d ${cls}`} aria-hidden="true" />
            <span className="t">{h.text.slice(0, 30)}</span>
            <time dateTime={h.at}>{k.date === todayKst ? k.time : k.md}</time>
          </button>
          <button type="button" className="x" onClick={() => removeHistory(h.id)} aria-label={`이력 삭제: ${h.text.slice(0, 20)}`}>×</button>
        </div>
      );
    });

  return (
    <div className="app">
      {drawer && <button type="button" className="scrim" aria-label="메뉴 닫기" onClick={() => setDrawer(false)} />}
      <aside className={`side${drawer ? ' open' : ''}`} id="side" aria-label="사이드바">
        <Brand />
        <button type="button" className="newbtn" onClick={newCheck}>＋ 새 검사</button>
        <div className="hist" aria-label="검사 이력">
          {history.length === 0 ? (
            <div className="empty">검사 결과가 여기에 쌓입니다</div>
          ) : (
            <>
              {histToday.length > 0 && <div className="grp">오늘</div>}
              {renderHist(histToday)}
              {histPrev.length > 0 && <div className="grp">이전</div>}
              {renderHist(histPrev)}
            </>
          )}
        </div>
        <nav className="links" aria-label="바로가기">
          <div className="grp" style={{ paddingTop: 12 }}>바로가기</div>
          {LINKS.map((l) => {
            const c = findContact(l.match);
            if (l.tel) {
              return (
                <a key={l.label} className="link" href={`tel:${l.tel}`} aria-label={`${l.label} ${l.tel} 전화 걸기`}>
                  <span>{l.label}</span><b>{l.tel}</b>
                </a>
              );
            }
            return (
              <a key={l.label} className="link" href={c?.url ?? '#'} target="_blank" rel="noopener noreferrer" aria-label={`${l.label} (새 창)`}>
                <span>{l.label}</span><span className="ext" aria-hidden="true">↗</span>
              </a>
            );
          })}
        </nav>
        {stats && stats.today.total > 0 && (
          <div className="sstat">오늘 <b className="num">{stats.today.total.toLocaleString()}</b>건 검사 · 높음 <b className="num">{stats.today.high.toLocaleString()}</b>건</div>
        )}
      </aside>

      <main className="main" ref={mainRef}>
        <div className="mbar">
          <button type="button" className="hb" aria-label="메뉴 열기" aria-expanded={drawer} aria-controls="side" onClick={() => setDrawer(true)}>
            <i /><i /><i />
          </button>
          찌라시체크
        </div>

        {!result ? (
          <div className="home col" id="home">
            <h1>받은 메시지, 공시로 확인하세요</h1>
            <div className="box">
              <textarea
                ref={homeTa}
                value={text}
                onChange={(e) => { setText(e.target.value.slice(0, MAX_LEN)); grow(e.target, 320); }}
                onKeyDown={(e) => onKey(e, text)}
                placeholder="리딩방·오픈채팅·SNS에서 받은 주식 메시지를 그대로 붙여넣으세요"
                aria-label="받은 메시지"
              />
              <div className="boxf">
                <span className="c num">{text.length.toLocaleString()} / {MAX_LEN.toLocaleString()}</span>
                <button type="button" className="send" onClick={() => void runCheck(text)} disabled={loading}>
                  {loading ? '확인 중…' : <>공시로 확인 <kbd aria-label="Cmd 또는 Ctrl + Enter">⌘↵</kbd></>}
                </button>
              </div>
            </div>
            {error && <p className="err" role="alert">{error}</p>}
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button key={ex.key} type="button" className="chip" disabled={loading} onClick={() => { setText(ex.text); void runCheck(ex.text); }}>
                  <span>예시</span>{ex.source}
                </button>
              ))}
            </div>
            <p className="chipsnote">예시는 실제 사실이 아닌 가상 메시지입니다. 기업명은 검증 시연을 위해 실제 상장사를 사용했습니다.</p>
            <div className="basis">
              <b>판정 기준</b> 금융감독원 소비자경보·금융위원회 보도자료에서 유형화한 사기 수법 16종 · 자본시장법 제174·176·178조<br />
              <b>대조 데이터</b> OpenDART 최근 90일 공시 · 상장사 3,989개사 · 회원가입 없음
            </div>
          </div>
        ) : (
          <>
            <div className="res col" id="res">
              {/* 지수 카드 */}
              <div className="card">
                <div className="top">
                  <div>
                    <div className="score">
                      <div className={`n ${lv!.cls} num`}>{n}</div>
                      <span className={`tag ${lv!.cls}`}>{lv!.name}</span>
                    </div>
                    <div className="headline">
                      {result.risk.headline}
                      {result.risk.patterns.length > 0 && <> — 일치하는 표현 <b>{result.risk.patterns.length}개</b></>}
                    </div>
                    <div className={`meter ${lv!.cls}`} aria-hidden="true">
                      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < meterOn ? 'on' : undefined} />)}
                    </div>
                  </div>
                  <div className="meta">
                    최종 확인 <span className="num">{when!.date} {when!.time}</span> KST<br />
                    {fromHistory && (
                      <>
                        <button type="button" className="more" onClick={() => void runCheck(checkedText)} disabled={loading}>{loading ? '확인 중…' : '다시 검사'}</button>
                        <br />
                      </>
                    )}
                    <button type="button" className="btn" onClick={() => void copyResult()}>{copied ? '복사됨' : '결과 요약 복사'}</button>
                  </div>
                </div>
                {result.risk.stage && result.risk.stage !== '해당 없음' && (
                  <div className="stage">
                    <span>이 메시지가 해당하는 단계</span>
                    <div className="bar" aria-hidden="true">
                      {STAGE_MARKS.map((m, i) => <i key={m} className={i <= stageLast ? 'on' : undefined} />)}
                    </div>
                    <span>{result.risk.stage}</span>
                  </div>
                )}
              </div>

              {hardHits.length > 0 && (
                <div className="alert" role="alert">
                  금융감독원이 &lsquo;100% 사기&rsquo;로 안내한 신호가 포함돼 있습니다 — {hardHits.map((p) => p.label).join(', ')}
                </div>
              )}
              {result.degraded && result.degraded.length > 0 && (
                <div className="alert mid" role="status">일부 확인이 지연됐습니다: {result.degraded.map((d) => DEGRADED_LABEL[d] ?? d).join(', ')}</div>
              )}

              {/* 일치한 수법 */}
              {result.risk.patterns.length > 0 && (
                <div className="card">
                  <h2>일치한 수법 {result.risk.patterns.length} <span>원문 구절을 그대로 인용</span></h2>
                  {result.risk.patterns.map((p) => {
                    const weak = isWeak(p.id, p.hard);
                    const open = !!openLegal[p.id];
                    return (
                      <div className="prow" key={p.id}>
                        <div>
                          <div className="pn">{p.label}</div>
                          <div className="pc">{p.category} · {p.id}</div>
                        </div>
                        <div>
                          {p.spans.map((s, i) => <p key={i} className={`q${weak ? ' mid' : ''}`}>“{s}”</p>)}
                          <button type="button" className="more" aria-expanded={open} aria-controls={`legal-${p.id}`} onClick={() => setOpenLegal((o) => ({ ...o, [p.id]: !open }))}>
                            법적 근거와 출처 {open ? '↑' : '↓'}
                          </button>
                          {open && (
                            <div className="legal" id={`legal-${p.id}`}>
                              {p.legal_basis}
                              {p.sources.length > 0 && (
                                <div className="src">
                                  <span>출처</span>
                                  {p.sources.map((s) => (
                                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" aria-label={`${s.title} (${domainOf(s.url)}, 새 창)`}>{domainOf(s.url)}</a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 원문 */}
              <div className="card">
                <h2>원문 <span>걸린 구절 표시</span></h2>
                <Highlighted text={checkedText} spans={spanMap} />
              </div>

              {/* 공시 대조 */}
              <div className="card">
                <h2>메시지 속 주장, 공시로 확인 <span>OpenDART 최근 90일</span></h2>
                {result.claims.length > 0 ? (
                  <table>
                    <thead><tr><th scope="col">주장</th><th scope="col">판정</th><th scope="col">근거</th></tr></thead>
                    <tbody>
                      {result.claims.map((c: Claim, i) => {
                        const v = VD[c.verdict] ?? VD.unconfirmed;
                        return (
                          <tr key={i}>
                            <td>
                              “{c.text}”
                              <div className="d">{c.corp ? `${c.corp.corp_name} (${c.corp.stock_code}) · ` : ''}{TYPE_LABEL[c.type] ?? c.type}</div>
                            </td>
                            <td className="v"><span className={`tag ${v.cls}`}>{v.name}</span></td>
                            <td>
                              <div className="d">{c.detail}</div>
                              {c.note && <div className="n">{c.note}</div>}
                              {c.evidence && (
                                <div className="n">
                                  <a className="lnk" href={c.evidence.url} target="_blank" rel="noopener noreferrer" aria-label={`DART 원문 ${c.evidence.rcept_no} (새 창)`}>DART 원문 {c.evidence.rcept_no} ↗</a>
                                  {c.evidence.corrected && <span className="corr">정정 반영</span>}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="note">기업명이 포함된 구체적 주장이 없어 공시 대조를 하지 않았습니다</div>
                )}
              </div>

              {/* 노트 */}
              {(reflection || nextHint) && (
                <div className="card">
                  <div className="cols" style={reflection && nextHint ? undefined : { gridTemplateColumns: '1fr' }}>
                    {reflection && <div className="note"><h3>반대로 생각해보면</h3>{reflection}</div>}
                    {nextHint && <div className="note next"><h3>이 다음에 올 수 있는 것</h3>{nextHint}</div>}
                  </div>
                </div>
              )}

              {/* 행동 요령 */}
              <div className="card">
                <h2>{lv!.title}</h2>
                <ol className="todo">
                  {result.actions.map((a) => <li key={a}>{a}</li>)}
                </ol>
              </div>
              <div className="disc">{disclaimer}</div>
            </div>

            <div className="dock col" id="dock">
              <div className="box">
                <textarea
                  ref={dockTa}
                  rows={1}
                  value={dockText}
                  onChange={(e) => { setDockText(e.target.value.slice(0, MAX_LEN)); grow(e.target, 120); }}
                  onKeyDown={(e) => onKey(e, dockText)}
                  placeholder="다른 메시지를 붙여넣으세요"
                  aria-label="다른 메시지"
                />
                <button type="button" className="send" onClick={() => void runCheck(dockText)} disabled={loading}>{loading ? '확인 중…' : '공시로 확인'}</button>
              </div>
              {error && <p className="err" role="alert">{error}</p>}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
