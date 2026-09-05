# 찌라시체크 — 구현 스펙 (Claude Code용)

이 문서는 구현 지시서다. 위에서 아래로 순서대로 진행하고, 각 STEP의 "완료 기준"을 만족하면 커밋 후 다음으로 넘어간다. 판단이 필요한 부분은 이 문서의 결정을 따르고, 문서에 없는 결정은 "가장 단순한 쪽"을 택한다.

## 0. 프로젝트 개요

- 서비스: 리딩방·SNS 주식 메시지를 붙여넣으면 ① 사기 패턴 위험 신호 지수, ② 메시지 속 주장의 DART 공시 대조 결과를 보여주는 모바일 웹.
- 대회: 2026 금융 AI Challenge (금융보안원). **마감 2026-09-07(월) 10:00 KST**. 배포 URL은 9/7~9/11 항상 접속 가능해야 함(결격 사유).
- 배포: https://dartcheacker.vercel.app/ (Vercel, 이미 연결됨). 로컬: `~/Desktop/jjirasi-check`.
- 스택: Next.js 16 (App Router, TS, Tailwind — create-next-app 기본), Supabase(Postgres), OpenDART API, LLM API(환경변수의 키에 맞는 SDK). Python 백엔드 없음 — 전부 route handler.
- 1인 프로젝트. 시간이 없으므로 **추상화 최소, 파일 수 최소, 테스트는 gold 50건 스크립트 하나**.

## 1. 환경·자산

환경변수 (`.env.local`과 Vercel에 이미 등록됨):
```
OPENDART_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
<LLM 키>   # ANTHROPIC_API_KEY 또는 OPENAI_API_KEY — .env.local에 있는 쪽을 쓴다
```

동봉 파일 → 레포 위치:
- `patterns.json` → `data/patterns.json` (패턴 사전 16종·정상 신호 4종·점수 규칙·행동요령·신고처·면책. **수정 금지, 로드해서 쓴다**)
- `gold_samples.json` → `data/gold_samples.json` (평가셋 50건)
- `seed-corps.mjs` → `scripts/seed-corps.mjs`
- `schema.sql` → `supabase/schema.sql` (참고용. **이미 Supabase에 적용돼 있음**, 다시 실행하지 말 것)

Supabase 테이블(적용 완료): `corps(corp_code pk, corp_name, stock_code, modify_date)`, `corp_aliases(alias pk, corp_code)`, `disclosures(rcept_no pk, corp_code, corp_name, report_nm, rcept_dt, flr_nm, rm, fetched_at)`, `checks(id, created_at, input_text, input_hash, risk_score, risk_level, patterns jsonb, claims jsonb, llm_model, latency_ms, error)`, `feedback`. RLS 전부 켜짐·정책 없음 → 서버는 **service_role 키**로 접근. 함수 `find_corp(q text, lim int)` → `(corp_code, corp_name, stock_code, sim)` pg_trgm 퍼지 검색.

## 2. 디렉토리

```
app/
  page.tsx                 # 단일 페이지 UI
  api/check/route.ts       # POST — 전체 파이프라인
  api/health/route.ts      # GET — {ok, corps_count, checked_at}
lib/
  types.ts                 # 응답 계약
  patterns.ts              # patterns.json 로드 + 규칙층 매치(span 포함)
  scoring.ts               # 점수 합산 규칙
  llm.ts                   # LLM 호출 2종 (주장 추출 / 패턴 판정) + JSON 파싱
  corp.ts                  # 기업명 → corp_code (find_corp + aliases)
  dart.ts                  # OpenDART 클라이언트 + disclosures 캐시
  verify.ts                # 주장 vs 공시 대조 판정
  supabase.ts              # service_role 클라이언트
data/
  patterns.json
  gold_samples.json
  examples.ts              # UI 예시 버튼 3개 텍스트
scripts/
  seed-corps.mjs
  eval.mjs                 # gold 50 실행 → 표 출력
docs/
  SPEC.md                  # 이 문서
```

## 3. 응답 계약 (`lib/types.ts`)

```ts
export type RiskLevel = 'low' | 'medium' | 'high' | 'uncertain';
export type Verdict = 'confirmed' | 'partial' | 'unconfirmed' | 'not_disclosure_event' | 'out_of_scope';

export interface PatternHit {
  id: string;            // P01..P16
  label: string;
  category: string;
  spans: string[];       // 원문에서 그대로 인용된 구절 (하이라이트용)
  confidence: number;    // 0..1
  hard: boolean;
  legal_basis: string;
  next_step_hint: string | null;
  sources: { title: string; url: string }[];
}

export interface Claim {
  text: string;          // 주장 원문 구절
  corp?: { corp_code: string; corp_name: string; stock_code: string };
  type: 'supply_contract' | 'capital_increase' | 'convertible_bond' | 'earnings' | 'major_holder' | 'ceo_change' | 'merger' | 'listing' | 'executive_rumor' | 'price_forecast' | 'insider_claim' | 'other';
  amount?: { value: number; unit: '원'; raw: string };   // 정규화된 금액(원 단위)
  date_hint?: string;    // "어제", "9/3", "다음주" 등 원문 그대로
  verdict: Verdict;
  evidence?: { rcept_no: string; report_nm: string; rcept_dt: string; url: string; corrected: boolean };
  detail: string;        // 한 줄 설명 (예: "계약금액 1,180억 — 글의 1,200억과 1.7% 차이")
  note?: string;         // 공시 의무·기한 안내 등
}

export interface CheckResponse {
  risk: {
    score: number;                 // 0..1
    level: RiskLevel;
    headline: string;              // verdict_copy[level]
    patterns: PatternHit[];
    benign: { id: string; label: string; spans: string[] }[];
    stage?: string;                // "④ 권위·기밀 → ⑤ 편취 직전"
    reflection?: string;           // LLM이 쓴 '정상일 가능성' 한 줄
  };
  claims: Claim[];
  actions: string[];               // action_guide[level]
  contacts: { name: string; value: string; url: string }[];
  checked_at: string;              // ISO, KST 표시용
  disclaimer: string;
  degraded?: string[];             // ['llm_timeout', 'dart_unavailable'] 등 — 있으면 UI에 노란 배너
}
```

## 4. 파이프라인 (`POST /api/check`, body `{ text: string }`)

```
0. 입력 검증: 10자 미만/4000자 초과 → 400. sha256 → input_hash.
1. 규칙층 (동기, <5ms): patterns.ts → 후보 PatternHit[] (spans = 매치된 구절), benign hits.
   hard 패턴 매치 시 이 시점에 risk.level='high' 확정 (LLM 결과가 낮춰도 유지).
2. LLM 2건 병렬 (Promise.allSettled, 각 타임아웃 12초):
   a) 패턴 판정 (3단: Discrimination → Reflection → Synthesis) — 규칙층 후보를 힌트로 제공
   b) 주장 추출 — Claim[] 초안 (corp 이름·type·amount·date_hint)
3. 점수 합산 (scoring.ts): 규칙층 ∪ LLM 확정 패턴 → noisy-OR → combo → benign 차감 → 단독 캡 → hard 오버라이드 → level.
4. 기업 매핑 (corp.ts): 각 claim의 기업명 → corp_aliases 정확 매치 → find_corp(sim ≥ 0.4) → 없으면 corp 없음.
5. 공시 대조 (dart.ts + verify.ts): corp 있고 type이 대조 가능 유형이면 OpenDART 조회 → verdict. 타임아웃 8초, 실패 시 verdict='unconfirmed' + degraded.push('dart_unavailable').
6. 응답 조립 + checks 테이블 insert (실패해도 응답은 반환).
```
`export const maxDuration = 60;` route에 명시. 목표 총 지연 < 15초.

### 4.1 규칙층 (`lib/patterns.ts`)
- `patterns.json`의 각 패턴에 대해 `keywords`는 `includes`, `regex`는 `new RegExp(r, 'g')`로 매치. 매치된 문자열(키워드 자체 또는 regex 전체 매치)을 span으로 수집. 같은 패턴 중복 span은 dedupe.
- `benign_signals`도 동일하게. 단 B02(언론 URL)는 URL 호스트가 `t.me`, `open.kakao.com`, `band.us`면 제외.
- 반환: `{ patterns: PatternHit[](confidence 0.6 고정), benign: [...] }`.

### 4.2 LLM 패턴 판정 (`lib/llm.ts` → `judgePatterns`)
시스템 프롬프트에 패턴 사전 요약(id·label·description·examples 3개)을 넣고, 사용자 메시지에 원문 + 규칙층 후보 id 목록. 반드시 JSON만 출력. 스키마:
```json
{
  "patterns": [{ "id": "P01", "spans": ["원문 그대로 인용"], "confidence": 0.9 }],
  "benign": [{ "id": "B04", "spans": ["..."] }],
  "reflection": "이 글이 정상적인 정보 공유·질문·공식 안내·사기 수법 설명글일 가능성과 그 이유 한 줄",
  "uncertain": false,
  "stage": "① 유인 | ② 격리 | ③ 신뢰 구축 | ④ 권위·기밀 | ⑤ 편취 | ⑥ 출금 장벽 | ⑦ 이탈 | ⑧ 2차 사기 | 해당 없음"
}
```
지시 규칙 (프롬프트에 그대로):
1. span은 원문에 **문자 그대로 존재하는 구절**만. 인용 못 하면 그 패턴은 넣지 않는다.
2. 먼저 사기 신호를 찾고(Discrimination), 그다음 "이 글이 정상일 이유"를 반박 논거로 쓰고(Reflection), 마지막에 종합한다(Synthesis). 사기 수법을 **설명·경고**하는 글, 피해 경험담, 증권사 공식 안내, 공시 링크가 있는 정보 공유는 패턴이 아니다.
3. 확신이 없으면 `uncertain: true`.
4. 발신자에 대한 판단은 하지 않는다. 메시지의 표현만 판단한다.
파싱: 응답에서 첫 `{`~마지막 `}` 추출 → JSON.parse. 실패 시 LLM 결과 무시하고 규칙층만 사용 + degraded.push('llm_parse'). span이 원문에 없는 항목은 서버에서 제거한다(환각 차단).

### 4.3 LLM 주장 추출 (`lib/llm.ts` → `extractClaims`)
스키마:
```json
{ "claims": [ { "text": "원문 구절", "corp_name": "대류테크", "type": "supply_contract", "amount_raw": "1,200억", "date_hint": "내일" } ] }
```
type 매핑 지시: 공급/수주/납품 계약→supply_contract, 유상증자/유증→capital_increase, CB/전환사채/BW→convertible_bond, 매출/영업이익/실적→earnings, 최대주주 변경/지분 인수→major_holder, 대표이사 변경→ceo_change, 합병/인수→merger, 상장/IPO→listing, 회장·임원 사임·거취(대표이사 아님)→executive_rumor, 상한가/급등/폭락 예측→price_forecast, "내부정보"·"미공개" 류→insider_claim, 나머지→other. 기업명은 원문 표기 그대로(별칭 해석은 서버가 함). 금액 정규화는 서버(`억`→1e8, `천만`→1e7, `만`→1e4, `조`→1e12).

### 4.4 점수 (`lib/scoring.ts`)
`patterns.json > scoring` 그대로:
1. 매치 패턴 집합 = 규칙층 ∪ LLM(confidence ≥ 0.5). 같은 id는 spans 합집합, confidence는 max.
2. `score = 1 − Π(1 − w_i)`.
3. `combos` 중 두 id가 모두 매치된 항목마다 `score *= multiplier`.
4. benign 매치당 weight 차감(합계 최대 0.3). hard 매치 있으면 차감 안 함.
5. clamp 0..1.
6. level: <0.3 low, <0.6 medium, else high. **단 hard=false 패턴이 정확히 1개면 level ≤ medium.** hard 매치 있으면 level=high. LLM `uncertain`이고 hard 없으면 level='uncertain'(표시는 medium 색).
7. `headline = verdict_copy[level]` (uncertain은 "판단을 유보합니다 — 근거 확인 후 판단하세요").

### 4.5 기업 매핑 (`lib/corp.ts`)
1. `corp_aliases` 정확 매치.
2. `select * from find_corp($1, 3)` → sim ≥ 0.4면 1위 채택. 0.25~0.4면 채택하되 claim.note="기업명 매칭 불확실: {corp_name}?".
3. 실패 시 corp 없음 → verdict='out_of_scope', detail="상장사에서 '{name}'을 찾지 못했습니다".

### 4.6 OpenDART (`lib/dart.ts`)
베이스 `https://opendart.fss.or.kr/api/`. 모든 호출 `crtfc_key` 포함, 8초 타임아웃, 응답 `status !== '000'`이면 에러.
- 공시목록: `list.json?corp_code=&bgn_de=YYYYMMDD&end_de=YYYYMMDD&page_count=100` — 기본 범위 **최근 90일**. 결과를 `disclosures`에 upsert(캐시). 같은 corp_code에 대해 `fetched_at`이 10분 이내면 캐시만 사용.
- 유상증자 결정: `piicDecsn.json?corp_code=&bgn_de=&end_de=` → 필드: `nstk_ostk_cnt`(신주 수), `fdpp_*`(자금조달 목적별 금액), `ic_mthn`(증자방식: 주주배정/제3자배정/일반공모), `bddd`(이사회결의일). 총액 = fdpp_* 합.
- 전환사채 결정: `cvbdIsDecsn.json?...` → `bd_fta`(권면총액), `cv_prc`(전환가), `bddd`.
- 실적: `fnlttSinglAcnt.json?corp_code=&bsns_year=&reprt_code=` (11013 1분기, 11012 반기, 11014 3분기, 11011 사업보고서) → `account_nm`이 매출액/영업이익/당기순이익인 행의 `thstrm_amount`(당기). 연결(CFS) 우선, 없으면 OFS.
- 공시 원문: `document.xml?rcept_no=` → zip → XML. **공급계약 전용**: 텍스트에서 `계약금액` 뒤 숫자, `매출액대비` 뒤 %, `계약상대` 추출(정규식, 표 태그 제거 후). 실패하면 목록의 report_nm만으로 verdict='partial' 처리(detail="공시는 확인됐으나 계약금액 추출 실패").
- 뷰어 링크: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo={rcept_no}`.
- 정정: report_nm이 `[정정]`으로 시작하면 corrected=true. 같은 유형 공시가 여러 건이면 **rcept_dt 최신**을 evidence로.

### 4.7 대조 판정 (`lib/verify.ts`)
type별:
| type | 조회 | 판정 |
|---|---|---|
| supply_contract | list.json에서 report_nm에 `단일판매` 또는 `공급계약` 포함 → 최신 1건 → document.xml 파싱 | 금액 있음 && \|공시−주장\|/공시 ≤ 0.15 → confirmed / > 0.15 → partial / 공시 없음 → unconfirmed |
| capital_increase | piicDecsn.json (90일) | 건 있음: 총액 오차 ≤ 15% && 방식 일치(주장에 방식 언급 시) → confirmed, 아니면 partial(detail에 실제 금액·방식) / 없음 → unconfirmed |
| convertible_bond | cvbdIsDecsn.json | 권면총액 오차 ≤ 15% → confirmed / partial / unconfirmed |
| earnings | fnlttSinglAcnt.json 최신 분기(현재 9월이면 2026 반기 11012, 없으면 1분기) | 주장 항목·금액 있으면 오차 ≤ 10% confirmed / partial. 금액 없이 "실적 좋다" 류면 detail에 실제 수치만 표시, verdict='partial' |
| major_holder / ceo_change / merger | list.json report_nm 키워드(최대주주 변경 / 대표이사 변경 / 합병) | 있음 confirmed / 없음 unconfirmed |
| listing | list.json에서 corp 없으면(비상장) out_of_scope, detail="상장 예정 여부는 KIND 예비심사 청구 목록에서 확인" + 링크 https://kind.krx.co.kr | — |
| executive_rumor | 조회 안 함 | not_disclosure_event, note="회장 등 미등기 임원의 취임·사임은 공시 의무 대상이 아니라 공시 유무로 진위를 판단할 수 없습니다 (횡령·배임 혐의 발생은 공시 대상)" |
| price_forecast | 조회 안 함 | out_of_scope, detail="가격 예측은 공시로 확인할 수 없는 주장입니다" |
| insider_claim | 조회 안 함 | out_of_scope, detail="공개 전 정보라는 주장은 구조적으로 검증 불가 — 사실이면 미공개중요정보 이용(자본시장법 174조), 거짓이면 사기. 어느 쪽도 매수 근거가 아닙니다" |
| other | list.json 90일 목록만 | unconfirmed, detail="최근 90일 공시 N건 중 관련 항목 없음" |

unconfirmed 공통 note (공시 의무 유형일 때): "이 내용이 사실이라면 {유형}은 사유 발생 {당일|익일}까지 공시 의무가 있습니다. {checked_at} 기준 확인되지 않았으며, 향후 공시로 상태가 바뀔 수 있습니다." 기한: supply_contract 익일, capital_increase·convertible_bond·major_holder·ceo_change 당일, merger 익일.

**표현 규칙(강제)**: "허위", "가짜", "거짓"이라는 단어를 verdict detail에 쓰지 않는다. 미확인은 미확인이다.

### 4.8 로그 (`checks` insert)
input_text, input_hash, risk_score, risk_level, patterns(id·confidence·spans만), claims(전체), llm_model, latency_ms, error. await 하지 말고 fire-and-forget (`void supabase.from('checks').insert(...)`).

## 5. UI (`app/page.tsx`) — 모바일 우선

한 페이지. 상단 → 하단:
1. 로고/서비스명 "찌라시체크" + 한 줄 설명 "리딩방·SNS 주식 메시지, 공시로 확인하세요".
2. textarea(placeholder "받은 메시지를 그대로 붙여넣으세요") + **예시 버튼 3개**(`data/examples.ts`): "위험 높음 예시" / "공시 확인됨 예시" / "일부 상이 예시". 클릭 시 textarea 채움. + "검사하기" 버튼(로딩 스피너, 중복 클릭 방지).
3. 결과 카드 A — 위험 신호 지수: 큰 숫자(0~100) + level 색 배지(low 초록 / medium 노랑 / high 빨강 / uncertain 회색) + headline. 아래 매치 패턴 리스트: label, 인용 span(따옴표), 접기/펼치기로 legal_basis + 출처 링크. stage 있으면 진행 바. `next_step_hint`가 있는 패턴 중 첫 번째를 "다음에 올 가능성이 높은 것" 박스로. benign 있으면 초록 배지("공시 링크 포함 — 근거 확인 가능").
   **hard 패턴 매치 시 카드 A 맨 위에 빨간 배너** "금감원이 '100% 사기'로 안내한 신호입니다".
4. 원문 하이라이트: 입력 텍스트를 다시 보여주되 span 부분을 level 색으로 mark. (span 문자열 find → 분할 렌더, 겹침은 무시)
5. 결과 카드 B — 주장별 공시 대조: claim마다 행. verdict 배지(confirmed 초록 "확인됨" / partial 노랑 "일부 상이" / unconfirmed 회색 "공시 근거 미확인" / not_disclosure_event 회색 "공시 대상 아님" / out_of_scope 회색 "검증 범위 밖") + detail + evidence 있으면 "DART 원문" 링크(새 탭) + corrected면 "정정 반영" 태그 + note.
6. 행동 요령 박스(actions) + 신고처(contacts, 전화는 `tel:` 링크).
7. 하단: "최종 확인 {checked_at KST}" + disclaimer 회색 작은 글씨. degraded 있으면 노란 배너 "일부 확인이 지연됐습니다: {항목}".

없는 기능의 버튼(공시 추적 알림, 신고 버튼, 로그인)은 **만들지 않는다**. 기능명세서에 "미구현 제외"라고 돼 있음.

### 5.1 예시 3개 (`data/examples.ts`)
STEP 6에서 실제 상장사로 교체하기 전까지 임시:
- high: gold S01 텍스트
- confirmed: gold B01 텍스트
- partial: gold S28 텍스트

## 6. 안정화

- LLM 실패/타임아웃 → 규칙층만으로 응답. `degraded: ['llm_timeout']`. 절대 500 내지 않는다.
- OpenDART 실패 → 해당 claim verdict='unconfirmed', detail="공시 조회가 일시적으로 불가합니다", degraded push.
- rate limit: 모듈 스코프 `Map<ip, timestamps[]>` 분당 10회 초과 시 429 + JSON `{error}`. UI는 "잠시 후 다시 시도".
- 입력 4000자 제한(UI에서도 카운터).
- OpenDART 일일 한도 1만 건 — disclosures 캐시 10분 필수.
- `/api/health`: corps count + now. 9/7~9/11 동안 외부 모니터(UptimeRobot 무료)로 5분 간격 핑 — 사용자에게 설정 안내만.

## 7. 평가 (`scripts/eval.mjs`)

`data/gold_samples.json` 50건을 로컬 서버(`http://localhost:3000/api/check`)에 순차 POST(간격 300ms). 출력:
- 사기 30건: expected_level 일치 수 / level ≥ medium 수 / expected_patterns 중 recall(패턴 단위)
- 정상 20건: level=low 수(= 오발동 아님), 오발동 목록(id, 매치 패턴, score)
- 평균 지연
- 결과를 `docs/eval_result.md`로 저장 (기획서에 숫자 인용)

## 8. 작업 순서 (STEP) — 각 완료 기준 충족 후 커밋·푸시

**STEP 0. 자산 배치 + seed** — 파일 배치, `npm i @supabase/supabase-js dotenv adm-zip`, `cp .env.local .env`(gitignore 확인), `node scripts/seed-corps.mjs`. 완료: "corps 총 2,5xx~2,8xx건", `select * from find_corp('삼성전자')` 1위가 삼성전자.

**STEP 1. 뼈대** — types.ts, /api/check 더미(고정 CheckResponse), /api/health, page.tsx(입력·예시 버튼·카드 2장 더미 렌더). 완료: Vercel URL에서 예시 클릭→검사→더미 카드 표시. 모바일 폭(375px)에서 깨지지 않음.

**STEP 2. 트랙 C** — patterns.ts, scoring.ts, llm.ts(judgePatterns), route 연결, 카드 A·하이라이트·hard 배너·행동요령. 완료: gold S01→high, S10→high(hard), S23→medium, B01→low, B08→low(LLM Reflection). eval.mjs 실행 가능.

**STEP 3. 주장 추출 + 기업 매핑** — extractClaims, corp.ts, claims를 카드 B에 verdict='unconfirmed' 더미로 표시. 완료: S01에서 claim(대류테크→매핑 실패→out_of_scope), B01에서 claim(한빛전자→매핑 실패). 실제 상장사명(삼성전자, 에코프로 등) 넣으면 corp 매핑됨.

**STEP 4. 트랙 A** — dart.ts, verify.ts. supply_contract → capital_increase → convertible_bond → earnings → 나머지 순. 완료: 최근 90일 내 공급계약 공시를 낸 실제 상장사 1곳으로 "OO 1,000억 공급계약" 입력 시 confirmed 또는 partial + DART 링크. 유증 공시 낸 실제 기업으로 방식 불일치 입력 시 partial.

**STEP 5. 안정화** — §6 전부. 완료: LLM 키를 일부러 틀리게 해도 200 + degraded. 5초 안에 11회 호출 시 429.

**STEP 6. 예시 실제화 + 평가** — `data/examples.ts`의 3개를 실제 상장사·실제 최근 공시 기준으로 교체(STEP 4에서 찾은 기업 사용). gold도 해당 3건은 실제 기업명으로 바꾼 사본 추가. eval.mjs 실행 → `docs/eval_result.md`. 완료: 정상 20건 오발동 ≤ 2건, 사기 30건 level ≥ medium ≥ 27건. 미달이면 LLM 프롬프트 지시문(§4.2 규칙 2)만 조정, 가중치는 건드리지 않는다.

**STEP 7. 제출 준비** — README.md(실행 방법·환경변수·구조), `docs/features.md`(기능명세서 §2용: 기능명·설명·화면·구현 상태 표), `docs/user_flow.md`(§3용), `docs/ai_data.md`(§4용: LLM 역할 2가지·입출력·개인정보 미수집 — 입력 텍스트는 검증 로그로 저장됨을 명시). 완료: 3개 md 존재, 최종 배포 URL 정상.

## 9. 금지·주의

- 미래에셋 AI Festival 제출 코드·데이터를 **복사하지 않는다** (대회 규정: 타 대회 산출물 재이용 시 수상 취소). 설계 개념만.
- 화면·응답 어디에도 "사기입니다", "사기꾼", "허위 공시", "불법 업체", "사기 확률 N%" 금지. 허용 표현은 `patterns.json > verdict_copy.allowed_frame`.
- 판정 대상은 메시지의 표현이지 발신자가 아니다. 업체명·인명을 판정문에 자동 삽입하지 않는다.
- 예시·gold의 가상 기업명(한빛전자·청운바이오·대류테크·미래에너지솔루션)이 실제 상장사와 겹치는지 STEP 6에서 `find_corp`로 확인하고, 겹치면 다른 가상명으로 교체.
- 174조 벌금 배수는 4~6배(2024 개정). patterns.json 문구 그대로 쓴다.
- service_role 키는 서버 코드에서만. 클라이언트 번들에 `SUPABASE_SERVICE_ROLE_KEY`가 들어가면 안 된다(`NEXT_PUBLIC_` 접두사 금지).
