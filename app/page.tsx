import patterns from '@/data/patterns.json';
import CheckApp from './check-app';

// 서버 컴포넌트: patterns.json(40KB)을 클라이언트 번들에 싣지 않고 필요한 값만 넘긴다.
export default function Page() {
  return <CheckApp contacts={patterns.action_guide.contacts} disclaimer={patterns.verdict_copy.disclaimer} />;
}
