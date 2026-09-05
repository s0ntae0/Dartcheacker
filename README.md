# 찌라시체크

리딩방·SNS 주식 메시지를 붙여넣으면 ① **사기 패턴 위험 신호 지수**(금감원 소비자경보·자본시장법 기반 16개 패턴)와 ② **메시지 속 주장의 DART 공시 대조 결과**를 보여주는 모바일 웹.

- 배포: https://dartcheacker.vercel.app/
- 헬스체크: https://dartcheacker.vercel.app/api/health
- 2026 금융 AI Challenge(금융보안원) 출품작

## 실행 방법

```bash
npm install
cp .env.example .env.local   # 아래 환경변수 채우기
cp .env.local .env           # scripts/*.mjs(dotenv)용
node scripts/seed-corps.mjs  # OpenDART corpCode.xml → Supabase corps (상장사 약 4,000건)
npm run dev                  # http://localhost:3000
node scripts/eval.mjs        # gold 53건 평가 → docs/eval_result.md
```

## 환경변수 (`.env.local` / Vercel)

| 변수 | 용도 |
|---|---|
| `OPENDART_KEY` | OpenDART API 인증키 (공시목록·유증·CB·실적·원문) |
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 키. RLS를 우회해 corps/disclosures/checks 접근. **`NEXT_PUBLIC_` 접두사 금지** |
| `CLOVA_API_KEY` | 네이버 CLOVA Studio API 키 (HyperCLOVA X, 기본 모델 `HCX-005`) |
| `CLOVA_MODEL` | (선택) 모델명 override. 기본 `HCX-005` |

Supabase 스키마는 `supabase/schema.sql` (이미 적용됨, 참고용). `find_corp(q, lim)` pg_trgm 퍼지 검색 함수 포함.

## 구조

```
app/
  page.tsx                 단일 페이지 UI (모바일 우선)
  api/check/route.ts       POST {text} → CheckResponse (전체 파이프라인, maxDuration 60s)
  api/health/route.ts      GET → {ok, corps_count, checked_at}
lib/
  types.ts                 응답 계약 (CheckResponse / PatternHit / Claim)
  patterns.ts              data/patterns.json 로드 + 규칙층 매치(keywords·regex, span 수집)
  scoring.ts               noisy-OR → combo → benign 차감 → 단독 캡 → hard 오버라이드 → level
  llm.ts                   CLOVA HCX-005 호출 2종: 패턴 판정(3단) / 주장 추출 + JSON 파싱·span 검증
  corp.ts                  기업명 → corp_code (corp_aliases → find_corp)
  dart.ts                  OpenDART 클라이언트 + disclosures 캐시(10분) + 공급계약 원문 파서
  verify.ts                주장 유형별 공시 대조 판정
  supabase.ts              service_role 클라이언트 (서버 전용)
data/
  patterns.json            패턴 사전 16종·정상 신호 4종·점수 규칙·행동요령·신고처·면책 (수정 금지)
  gold_samples.json        평가셋 (사기 30 + 정상 20 + 실제 상장사 사본 3)
  examples.ts              UI 예시 버튼 3개
scripts/
  seed-corps.mjs           상장사 목록 적재
  eval.mjs                 gold 평가 → docs/eval_result.md
docs/
  SPEC.md · features.md · user_flow.md · ai_data.md · eval_result.md
```

## 파이프라인 (`POST /api/check`)

1. 입력 검증(10~4,000자), sha256 해시, IP당 분당 10회 제한(429)
2. 규칙층: patterns.json keywords/regex 매치 → 후보 패턴 + span. hard 패턴(P05·P07·P14) 매치 시 level=high 확정
3. LLM 2건 병렬(각 12초 타임아웃): 패턴 판정(Discrimination → Reflection → Synthesis) / 주장 추출
4. 점수 합산(규칙층 ∪ LLM) → level(low/medium/high/uncertain)
5. 주장별 기업 매핑 → OpenDART 조회(8초 타임아웃, 90일 범위) → verdict(confirmed/partial/unconfirmed/not_disclosure_event/out_of_scope)
6. 응답 + `checks` 로그(응답 후 비동기)

LLM·DART가 실패해도 규칙층 결과로 200을 반환하고 `degraded` 배열에 사유를 표시한다.

## 운영 메모

- 9/7~9/11 접속 보장: UptimeRobot 등 외부 모니터로 `/api/health`를 5분 간격 핑 권장
- OpenDART 일일 한도 1만 건 → `disclosures` 테이블 10분 캐시
- 응답·화면에 "사기입니다/사기꾼/허위/가짜/불법 업체/사기 확률 N%" 표현을 쓰지 않는다. 미확인은 "공시 근거 미확인"
