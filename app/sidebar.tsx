'use client';

import Link from 'next/link';
import type { CheckResponse, RiskLevel } from '@/lib/types';

export type Contact = { name: string; value: string; url: string };
export type Stats = { today: { total: number; high: number }; all: { total: number } };
export type HistoryItem = { id: string; at: string; text: string; level: RiskLevel; score: number; response: CheckResponse };

export const HISTORY_KEY = 'jjirasi.history.v1';
export const HISTORY_MAX = 20;

export const LV: Record<RiskLevel, { cls: 'hi' | 'mid' | 'lo' | 'unk'; name: string; title: string }> = {
  high: { cls: 'hi', name: '높음', title: '지금 하지 말아야 할 것' },
  medium: { cls: 'mid', name: '주의', title: '확인할 것' },
  low: { cls: 'lo', name: '낮음', title: '참고' },
  uncertain: { cls: 'unk', name: '판단 유보', title: '확인할 것' },
};

export function kst(iso: string) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16), md: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
}
export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.id === 'string' && typeof x.text === 'string' && x.response?.risk) : [];
  } catch {
    return [];
  }
}
export function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* 저장 불가(사생활 보호 모드 등)면 조용히 무시 */
  }
}

// 사이드바 바로가기 6개: 라벨은 v3 목업, URL은 patterns.json action_guide.contacts에서 이름으로 찾는다
const LINKS: { match: string; label: string; tel?: string }[] = [
  { match: '파인 유사투자자문업자', label: '파인 · 유사투자자문업자 신고현황' },
  { match: '파인 제도권', label: '파인 · 제도권 금융회사 조회' },
  { match: '금융감독원 불법금융신고', label: '금융감독원 불법금융신고', tel: '1332' },
  { match: '경찰 사이버범죄', label: '경찰 사이버범죄 신고 ECRM' },
  { match: 'KISA', label: 'KISA 불법스팸대응센터', tel: '118' },
  { match: '금융위 불공정거래', label: '금융위 불공정거래 신고' },
];

export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="brand" onClick={onClick} aria-label="찌라시체크 홈으로">
      <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 9.2l2.6 2.6L13 6.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      찌라시체크
    </button>
  );
}

export function MobileBar({ open, onMenu, onHome }: { open: boolean; onMenu: () => void; onHome: () => void }) {
  return (
    <div className="mbar">
      <button type="button" className="hb" aria-label="메뉴 열기" aria-expanded={open} aria-controls="side" onClick={onMenu}>
        <i /><i /><i />
      </button>
      <button type="button" className="mlogo" onClick={onHome} aria-label="찌라시체크 홈으로">찌라시체크</button>
    </div>
  );
}

export function Sidebar({
  contacts, history, currentId, stats, open, onNew, onSelect, onDelete,
}: {
  contacts: Contact[];
  history: HistoryItem[];
  currentId: string | null;
  stats: Stats | null;
  open: boolean;
  onNew: () => void;
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  const todayKst = kst(new Date().toISOString()).date;
  const histToday = history.filter((h) => kst(h.at).date === todayKst);
  const histPrev = history.filter((h) => kst(h.at).date !== todayKst);
  const findContact = (m: string) => contacts.find((c) => c.name.includes(m));

  const renderHist = (items: HistoryItem[]) =>
    items.map((h) => {
      const k = kst(h.at);
      const cls = (LV[h.level] ?? LV.uncertain).cls;
      return (
        <div key={h.id} className={`hitem${h.id === currentId ? ' on' : ''}`}>
          <button type="button" className="hbtn" onClick={() => onSelect(h)} aria-current={h.id === currentId ? 'true' : undefined}>
            <i className={`d ${cls}`} aria-hidden="true" />
            <span className="t">{h.text.slice(0, 30)}</span>
            <time dateTime={h.at}>{k.date === todayKst ? k.time : k.md}</time>
          </button>
          <button type="button" className="x" onClick={() => onDelete(h.id)} aria-label={`이력 삭제: ${h.text.slice(0, 20)}`}>×</button>
        </div>
      );
    });

  return (
    <aside className={`side${open ? ' open' : ''}`} id="side" aria-label="사이드바">
      <Brand onClick={onNew} />
      <button type="button" className="newbtn" onClick={onNew}>＋ 새 검사</button>
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
        <Link className="link" href="/patterns"><span>판정 기준 보기</span></Link>
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
  );
}
