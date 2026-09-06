'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { MobileBar, Sidebar, loadHistory, saveHistory, type Contact, type HistoryItem, type Stats } from '../sidebar';

/** /patterns 등 정적 페이지용 셸: 사이드바(이력·바로가기·통계)와 모바일 드로어만 담당. 새 검사·이력 클릭은 /로 이동 */
export default function PatternsShell({ contacts, children }: { contacts: Contact[]; children: ReactNode }) {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Stats | null) => j && setStats(j))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  return (
    <div className="app">
      {drawer && <button type="button" className="scrim" aria-label="메뉴 닫기" onClick={() => setDrawer(false)} />}
      <Sidebar
        contacts={contacts}
        history={history}
        currentId={null}
        stats={stats}
        open={drawer}
        onNew={() => router.push('/')}
        onSelect={(h) => router.push(`/?h=${encodeURIComponent(h.id)}`)}
        onDelete={(id) => setHistory((h) => { const next = h.filter((x) => x.id !== id); saveHistory(next); return next; })}
      />
      <main className="main">
        <MobileBar open={drawer} onMenu={() => setDrawer(true)} onHome={() => router.push('/')} />
        {children}
      </main>
    </div>
  );
}
