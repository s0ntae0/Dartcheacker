# UI v3 — 목업 포팅 지시서 (docs/UI_V3.md)

`docs/mock/v3.html`이 확정 디자인이다. **이 HTML의 구조·CSS 변수·클래스·카피를 그대로 `app/page.tsx`로 옮긴다.** 새로 디자인하지 않는다. `globals.css`에 v3의 `<style>`을 그대로 넣고 JSX에서 같은 클래스명을 쓰는 게 가장 빠르다. UI_POLISH.md·UI_V2.md는 폐기.

## 레이아웃
- `.app` grid `260px 1fr`, 높이 100vh. 좌 `aside.side`, 우 `main.main`(자체 스크롤).
- ≤900px: 사이드바 숨기고 `.mbar`(햄버거 + 로고) 표시. 햄버거 → 사이드바를 좌측 드로어로(오버레이, 바깥 클릭 닫힘). 드로어 내용은 데스크톱 사이드바와 동일.

## 사이드바 (`aside.side`)
1. `.brand` 로고(인라인 SVG 마크 + "찌라시체크")
2. `.newbtn` "＋ 새 검사" → 결과 상태를 빈 상태로, textarea 비우고 포커스, 이력 선택 해제
3. `.hist` 이력 — **§신규 기능 A**
4. `.links` 바로가기 6개(고정, 하단): 파인 유사투자자문업자 신고현황(↗) / 파인 제도권 금융회사 조회(↗) / 금융감독원 불법금융신고 **1332**(`tel:`) / 경찰 사이버범죄 신고 ECRM(↗) / KISA 불법스팸대응센터 **118**(`tel:`) / 금융위 불공정거래 신고(↗). URL은 `patterns.json > action_guide.contacts`.
5. `.sstat` "오늘 N건 검사 · 높음 M건" (`/api/stats`, 0이면 숨김)

## 메인 — 빈 상태 (`#home`)
- 세로 중앙 정렬. h1 "받은 메시지, 공시로 확인하세요"
- `.box` 입력 박스: textarea(min 112px, 자동 높이 확장 최대 320px) + 하단 좌 카운터 `0 / 4,000` + 우 `.send` "공시로 확인 ⌘↵". `⌘/Ctrl+Enter` 동작.
- `.chips` 예시 3개: "예시 리딩방 메시지 / 공시 공유 글 / 유상증자 공지" — 클릭 시 textarea 채우고 **자동 검사**. 칩 아래 회색 한 줄: "예시는 실제 사실이 아닌 가상 메시지입니다. 기업명은 검증 시연을 위해 실제 상장사를 사용했습니다." (v3.html엔 빠져 있음 — 추가)
- `.basis` 판정 기준 2줄

## 메인 — 결과 상태 (`#res` + `#dock`)
`.col` 760px 중앙. 카드 순서와 바인딩:
| 카드 | CheckResponse |
|---|---|
| 지수 카드 `.top` | `.n` = round(score×100), 색·`.tag` = level (uncertain → `.tag.unk` "판단 유보", 숫자 `--unk`). `.headline` = headline + 매치 개수. `.meter` on 개수 = round(score×10), 색 = level. `.meta` = checked_at KST + "결과 요약 복사" 버튼. `.stage` = risk.stage (없으면 행 생략) |
| hard 배너 | `risk.patterns.some(hard)`일 때 지수 카드 바로 아래 `.alert`(v2의 스타일: 좌 3px `--hi` 보더, `--hi-bg`) "금융감독원이 '100% 사기'로 안내한 신호가 포함돼 있습니다 — {label}" |
| degraded 배너 | 같은 `.alert`를 `--mid` 색으로: "일부 확인이 지연됐습니다: {사유}" |
| 일치한 수법 | `.prow` × patterns. `.q` 색: weight ≥ 0.3 또는 hard → 기본(적), 미만 → `.mid`. "법적 근거와 출처 ↓" 토글 → legal_basis + sources 도메인 링크. 0건이면 카드 자체 생략 |
| 원문 | 입력 원문 + spans → `<mark>` (색은 위와 동일 규칙) |
| 공시 대조 | table × claims. verdict → 태그(confirmed lo "확인됨" / partial mid "일부 상이" / unconfirmed unk "공시 근거 미확인" / not_disclosure_event unk "공시 대상 아님" / out_of_scope unk "검증 범위 밖"). 3열 = detail + note + evidence 링크 "DART 원문 {rcept_no} ↗" + corrected면 `.corr` "정정 반영". claims 0건이면 표 대신 한 줄 "기업명이 포함된 구체적 주장이 없어 공시 대조를 하지 않았습니다" |
| 노트 카드 | 좌 reflection("반대로 생각해보면"), 우 첫 next_step_hint("이 다음에 올 수 있는 것"). 둘 다 없으면 카드 생략, 하나면 1단 |
| 행동 요령 | 제목 high "지금 하지 말아야 할 것" / medium·uncertain "확인할 것" / low "참고". `ol.todo` = actions |
| `.disc` | disclaimer |
| `#dock` | sticky 하단 입력. textarea 1줄 시작, 최대 120px. "공시로 확인" → 새 검사 실행 → 결과 교체 + 이력 추가 + 스크롤 top |

지수 카드 우측 `.meta`에 "다시 검사" 텍스트 링크 추가(이력에서 불러온 결과일 때만 표시, 클릭 시 같은 텍스트로 재검사).

## 신규 기능 A — 검사 이력 (features.md 30번)
- 저장소: `localStorage` key `jjirasi.history.v1`, 최대 20건, 배열 `{id, at, text, level, score, response}`. 검사 성공 시 unshift. 4,000자 × 20건이라 용량 문제 없음.
- 사이드바 `.hist`: "오늘"/"이전" 그룹(KST 기준), `.hitem` = 등급 점 `.d.{hi|mid|lo|unk}` + 앞 30자 + 시각(오늘은 HH:MM, 이전은 M/D). 현재 표시 중인 항목 `.on`.
- 클릭 → **API 호출 없이** 저장된 response로 결과 렌더, textarea에 원문 채움, `#dock` 표시.
- 항목 hover 시 우측에 × (삭제). 0건이면 `.hist`에 회색 "검사 결과가 여기에 쌓입니다" 한 줄.
- 브라우저 저장이라 기기 간 동기화 없음 — 명세서·ai_data.md에 "브라우저 localStorage, 서버 전송 없음" 명시.

## 신규 기능 B — 결과 요약 복사 (features.md 29번, 이미 정의됨)
형식 유지:
```
[찌라시체크 결과] 위험 신호 지수 92 · 높음
일치 유형: 미공개·내부 정보 주장 / 긴급·희소성 압박 / 외부 채널 이동 유도
공시 대조: 에코프로 미국 수주 — 공시 근거 미확인 (2026-09-06 14:32 KST 기준)
자세히: https://dartcheacker.vercel.app
```
성공 시 버튼 텍스트 1.5초 "복사됨".

## 하지 않는 것
- 그림자는 `.box` 하나만. 그라데이션·아이콘 세트·애니메이션 라이브러리·이모지 금지.
- 색상 추가 금지 — 토큰은 v3.html `:root` 그대로.
- 파이프라인·점수·patterns.json 수정 금지.

## 완료 기준
- 1440px·390px 스크린샷: 빈 상태·결과 상태 각 1장 + 모바일 드로어 열린 화면 1장
- 예시 칩 3개 클릭 → 결과 → 사이드바 이력에 3건 쌓임 → 이력 클릭 시 즉시 렌더(네트워크 탭에 /api/check 없음)
- S10 텍스트 수동 입력 → hard `.alert` 확인
- 375px 가로 스크롤 0, Lighthouse 모바일 Accessibility ≥ 95
- features.md 30번(검사 이력) 추가, user_flow.md·ai_data.md 갱신
