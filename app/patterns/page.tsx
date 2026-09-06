import type { Metadata } from 'next';
import patterns from '@/data/patterns.json';
import PatternsShell from './shell';

export const metadata: Metadata = { title: '판정 기준 — 찌라시체크' };

type PatternDef = (typeof patterns)['patterns'][number];

export default function PatternsPage() {
  const levels = patterns.scoring.levels;
  const midFrom = Math.round(levels.medium[0] * 100);
  const highFrom = Math.round(levels.high[0] * 100);
  const hardIds = patterns.patterns.filter((p) => p.hard).map((p) => p.id);

  // 카테고리별 묶음 (등장 순서 유지)
  const groups: { category: string; items: PatternDef[] }[] = [];
  for (const p of patterns.patterns) {
    const g = groups.find((x) => x.category === p.category);
    if (g) g.items.push(p);
    else groups.push({ category: p.category, items: [p] });
  }

  return (
    <PatternsShell contacts={patterns.action_guide.contacts}>
      <div className="doc col">
        <h1>판정 기준</h1>
        <p className="lead">
          금융감독원 소비자경보·금융위원회 보도자료·경찰청 단속 자료에서 유형화한 사기 수법 16종입니다. 메시지의 표현이 이 유형과 일치하는지를 판정하며, 발신자를 판단하지 않습니다.
        </p>
        <ul className="rules">
          <li>등급 경계: 위험 신호 지수 {midFrom} 미만 낮음 · {midFrom}~{highFrom - 1} 주의 · {highFrom} 이상 높음 (여러 유형이 겹치면 점수가 합산되고, 공시 링크·리스크 고지 같은 정상 신호는 차감)</li>
          <li>hard가 아닌 유형이 하나만 일치하면 등급은 최대 &lsquo;주의&rsquo;(점수는 그대로 표시)</li>
          <li>hard 3종({hardIds.join('·')})은 금융감독원이 &lsquo;100% 사기&rsquo;로 안내한 신호라 단독으로도 &lsquo;높음&rsquo;</li>
        </ul>

        {groups.map((g) => (
          <div className="card" key={g.category}>
            <h2>{g.category} <span>{g.items.length}종</span></h2>
            {g.items.map((p) => (
              <div className="pat" key={p.id} id={p.id}>
                <div className="pn">
                  {p.label}
                  <span className="pc">{p.id}</span>
                  {p.hard && <span className="tag hi">100% 사기 신호</span>}
                </div>
                <p className="desc">{p.description}</p>
                <p className="legal">{p.legal_basis}</p>
                {p.sources.length > 0 && (
                  <div className="src">
                    출처:{' '}
                    {p.sources.map((s, i) => (
                      <span key={s.url}>
                        {i > 0 && ' · '}
                        <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>
                      </span>
                    ))}
                  </div>
                )}
                {p.next_step_hint && <p className="nx">이 다음 단계: {p.next_step_hint}</p>}
              </div>
            ))}
          </div>
        ))}

        <div className="card">
          <h2>정상 신호(점수 차감) <span>{patterns.benign_signals.length}종</span></h2>
          {patterns.benign_signals.map((b) => (
            <div className="pat" key={b.id}>
              <div className="pn">
                {b.label}
                <span className="pc">{b.id}</span>
                <span className="tag lo">−{b.weight}</span>
              </div>
              <p className="desc">{b.note}</p>
            </div>
          ))}
        </div>
        <div className="disc">{patterns.verdict_copy.disclaimer}</div>
      </div>
    </PatternsShell>
  );
}
