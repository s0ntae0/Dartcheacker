# AI·데이터 설명 (기능명세서 §4용)

## 1. AI(LLM) 역할 — 2가지

모델: 네이버 CLOVA Studio **HyperCLOVA X (HCX-005)**, Chat Completions v3, temperature 0.1. 두 호출은 병렬 실행되며 각각 12초 타임아웃. 실패 시 규칙층 결과만으로 응답하고 `degraded`에 사유를 표시한다.

### 1-1. 패턴 판정 (`judgePatterns`)

| 항목 | 내용 |
|---|---|
| 입력 | 시스템 프롬프트: 패턴 사전 요약(16개 패턴의 id·label·설명·예시 3개, 정상 신호 4개), 출력 스키마, 판정 규칙. 사용자 메시지: 원문 + 규칙층 후보 패턴 id |
| 절차 | ① Discrimination(사기 신호 찾기) → ② Reflection("이 글이 정상일 이유"를 반박 논거로 검토: 사기 수법 설명글·피해 경험담·공식 안내·출처 있는 정보 공유·단순 질문은 패턴 아님) → ③ Synthesis(종합) |
| 출력(JSON) | `patterns[{id, spans[], confidence}]`, `benign[{id, spans[]}]`, `reflection`(정상일 가능성 한 줄), `uncertain`(bool), `stage`(① 유인 ~ ⑧ 2차 사기) |
| 안전장치 | span은 원문에 문자 그대로 존재하는 구절만 인정(서버가 재검증해 없으면 제거 → 환각 차단). confidence < 0.5는 무시. JSON 파싱 실패 시 LLM 결과 전체 무시. 발신자(업체·개인)에 대한 판단은 하지 않도록 지시 |
| 점수 반영 | 규칙층 ∪ LLM 매치 집합 → noisy-OR(1 − Π(1 − wᵢ)) → 조합 가중(예: 미공개정보+긴급성 ×1.3) → 정상 신호 차감(최대 0.3, hard 매치 시 미적용) → 등급 경계 low <0.3 / medium 0.3~0.5 / high ≥0.5 (`patterns.json > scoring.levels`) → 단독 비-hard 패턴은 medium 상한 → hard 패턴은 high 확정 → `uncertain`이면 "판단 유보" |

### 1-2. 주장 추출 (`extractClaims`)

| 항목 | 내용 |
|---|---|
| 입력 | 원문 |
| 출력(JSON) | `claims[{text, corp_name, type, amount_raw, date_hint}]` (최대 5개). type 12종: supply_contract, capital_increase, convertible_bond, earnings, major_holder, ceo_change, merger, listing, executive_rumor, price_forecast, insider_claim, other. `sender_orgs[]`: 발신자가 자칭하는 소속 금융회사·자문사·기관의 고유명(최대 3개, 종목 기업명·"증권사" 같은 일반 표현 제외) |
| 규칙 | 기업명이 명시된 주장만. 발신자 소속 회사(증권사 사칭 등)는 제외. 기업명은 원문 표기 그대로(별칭 해석은 서버) |
| 후처리(서버) | 금액 정규화(억→1e8, 조→1e12, 만→1e4; LLM이 빠뜨리면 원문에서 재추출), 기업 매핑(pg_trgm), 유형별 OpenDART 대조. `sender_orgs`는 이름 정규화(공백·(주) 제거) 후 중복·일반명사·종목 기업명과 겹치는 것을 제외하고 파인 조회 링크 2개(제도권 금융회사 조회 / 유사투자자문업자 신고현황)를 붙인다. **등록 여부는 판정하지 않는다** |

LLM은 **판정의 최종 권한을 갖지 않는다.** 위험 등급은 규칙 기반 점수 규칙(`patterns.json > scoring`)이 결정하고, 공시 대조 판정은 OpenDART 응답과의 수치 비교(±15%, 실적 ±10%)로 결정한다.

## 2. 입력·출력 데이터

| 구분 | 데이터 | 출처·형식 |
|---|---|---|
| 입력 | 사용자가 붙여넣은 메시지 텍스트(10~4,000자) | 사용자 |
| 참조 | 패턴 사전 `data/patterns.json` — 16개 사기 패턴(keywords·regex·가중치·hard 여부·법적 근거·출처)·정상 신호 4개·점수 규칙·행동 요령·신고처·면책 | 금감원 소비자경보, 금융위 보도자료, 경찰청 자료, 자본시장법, 판례를 근거로 작성 |
| 참조 | 상장사 목록 `corps` (약 4,000건: corp_code·corp_name·stock_code) | OpenDART corpCode.xml (`scripts/seed-corps.mjs`) |
| 참조 | 공시 목록 캐시 `disclosures` (최근 90일, 10분 TTL) | OpenDART `list.json` |
| 참조 | 유상증자·전환사채 결정, 실적, 공시 원문 | OpenDART `piicDecsn.json`, `cvbdIsDecsn.json`, `fnlttSinglAcnt.json`, `document.xml` (원문은 공급계약 계약금액·매출액 대비·계약상대 추출) |
| 출력 | `CheckResponse`: 위험 점수·등급·근거 문구·매치 패턴(구절·법적 근거·출처)·정상 신호·진행 단계·정상 가능성 검토, 주장별 판정·설명·DART 링크·공시 의무 안내, 발신자 자칭 소속(`sender_orgs`, 파인 조회 링크), 행동 요령·신고처, 확인 시각, 면책, 부분 장애 사유 | `lib/types.ts` |
| 평가 | `data/gold_samples.json` 53건(사기 30·정상 20·실제 상장사 사본 3) → `docs/eval_result.md` (사기 ≥ medium 31/32, 정상 low 20/21, 패턴 recall 71%, 평균 3초) | 실제 보도 문구를 변형해 작성, 기업명은 가상(실제 상장사와 겹치지 않음을 `find_corp`로 확인) |

## 3. 개인정보·로그

- 회원가입·로그인 없음. 이름·연락처·계좌 등 개인정보를 **수집하지 않는다**.
- 검증 로그(`checks` 테이블)에 **입력 텍스트 원문**, sha256 해시, 점수·등급, 매치 패턴(id·confidence·구절), 주장 판정 결과, 모델명, 지연 시간, 오류 메시지를 저장한다. 목적: 서비스 품질 확인과 향후 라벨 데이터. 사용자는 메시지에 포함된 타인의 개인정보를 지우고 붙여넣는 것을 권장한다.
- IP 주소는 요청 제한(분당 10회)을 위해 서버 메모리에만 잠시 보관하며 저장하지 않는다.
- **검사 이력**은 이용자 브라우저의 `localStorage`(`jjirasi.history.v1`, 최대 20건)에만 저장되며 서버로 전송하지 않는다. 기기·브라우저 간 동기화는 없고, 이용자가 항목별로 삭제할 수 있다.
- LLM API(CLOVA Studio)에는 입력 텍스트가 전송된다. 외부 전송 대상은 CLOVA Studio와 OpenDART(기업 코드·접수번호만) 두 곳이다.
- 모든 데이터 접근은 서버(Route Handler)에서 service_role 키로만 이루어지며 클라이언트 번들에는 키가 포함되지 않는다.

## 4. 판정 표현 원칙

- 판정 대상은 메시지의 표현이지 발신자가 아니다.
- "사기입니다 / 사기꾼 / 허위 / 가짜 / 불법 업체 / 사기 확률 N%"를 쓰지 않는다. 미확인은 "공시 근거 미확인"으로만 표시하며, 확인 시각과 향후 공시로 상태가 바뀔 수 있음을 함께 안내한다.
- 본 결과는 공개된 기준과 메시지 문구를 자동 비교한 참고 정보이며 특정 개인·업체의 위법·사기 여부에 대한 법적 판단이 아니다(면책 문구 항상 표시).
