import patterns from '@/data/patterns.json';
import CheckApp from './check-app';

// 서버 컴포넌트: patterns.json(40KB)을 클라이언트 번들에 싣지 않고 필요한 값만 넘긴다.
// 화면 자체(v3 목업 포팅)는 app/check-app.tsx.
export default function Page() {
  const weights = Object.fromEntries(patterns.patterns.map((p) => [p.id, p.weight])) as Record<string, number>;
  return <CheckApp contacts={patterns.action_guide.contacts} disclaimer={patterns.verdict_copy.disclaimer} weights={weights} />;
}
