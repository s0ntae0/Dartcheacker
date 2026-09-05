# CLAUDE.md — 찌라시체크

구현 지시서는 `docs/SPEC.md`다. 먼저 전부 읽고 STEP 0부터 순서대로 진행한다. 각 STEP의 완료 기준을 만족하면 커밋·푸시하고 다음 STEP으로. 판단이 필요하면 SPEC의 결정을 따르고, 없으면 가장 단순한 쪽을 택한 뒤 커밋 메시지에 한 줄로 남긴다.

## 절대 규칙
- 마감 2026-09-07 10:00 KST. 완성도보다 **동작하는 배포**가 우선. 500 에러를 내는 코드는 커밋하지 않는다.
- `data/patterns.json`은 수정하지 않는다 (로드해서 쓴다).
- 응답·화면 어디에도 "사기입니다 / 사기꾼 / 허위 / 가짜 / 불법 업체 / 사기 확률 N%" 금지. 미확인은 "공시 근거 미확인"으로만.
- 없는 기능의 버튼은 만들지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용. `NEXT_PUBLIC_` 금지.
- 다른 프로젝트(미래에셋 공시 Agent) 코드를 가져오지 않는다.

## 스택
Next.js 16 App Router + TS + Tailwind, Supabase(service_role), OpenDART API, LLM API(.env.local의 키에 맞는 SDK). Python 없음.

## 명령
- `npm run dev` / `node scripts/seed-corps.mjs` / `node scripts/eval.mjs`
- 커밋 메시지: `step{N}: {한 줄}`
