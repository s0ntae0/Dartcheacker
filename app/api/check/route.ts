import type { CheckResponse } from '@/lib/types';
import patterns from '@/data/patterns.json';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// STEP 1: 고정 더미 응답. STEP 2에서 실제 파이프라인으로 교체.
export async function POST(req: Request) {
  let text = '';
  try {
    const body = await req.json();
    text = typeof body?.text === 'string' ? body.text : '';
  } catch {
    return Response.json({ error: 'JSON body 필요' }, { status: 400 });
  }
  if (text.trim().length < 10) return Response.json({ error: '10자 이상 입력하세요' }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: '4000자 이하로 입력하세요' }, { status: 400 });

  const p01 = patterns.patterns.find((p) => p.id === 'P01')!;
  const res: CheckResponse = {
    risk: {
      score: 0.72,
      level: 'high',
      headline: patterns.verdict_copy.high,
      patterns: [
        {
          id: p01.id, label: p01.label, category: p01.category, hard: p01.hard,
          spans: ['아직 외부 공개 안 된 정보'], confidence: 0.9,
          legal_basis: p01.legal_basis, next_step_hint: p01.next_step_hint, sources: p01.sources,
        },
      ],
      benign: [],
      stage: '① 유인',
      reflection: '(더미) 정상적인 정보 공유일 가능성은 낮습니다.',
    },
    claims: [
      { text: '대류테크 내일 미국 대형 수주 발표 확정', type: 'supply_contract', verdict: 'out_of_scope', detail: "상장사에서 '대류테크'를 찾지 못했습니다" },
    ],
    actions: patterns.action_guide.high,
    contacts: patterns.action_guide.contacts,
    checked_at: new Date().toISOString(),
    disclaimer: patterns.verdict_copy.disclaimer,
  };
  return Response.json(res);
}
