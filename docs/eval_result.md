# 평가 결과 (gold 53건)

- 실행: 2026-09-06T06:04:00.630Z / 대상: http://localhost:3000

## 사기 32건
- expected_level 일치: 19/32
- level ≥ medium(uncertain 포함): 31/32
- expected_patterns recall(패턴 단위): 59/83 (71%)

## 정상 21건
- level = low: 20/21
- 오발동: 1건 — B10(medium, [P04,P10], 0.438)

## 지연
- 평균 3014ms / 오류 0건 / degraded 4건

## 상세

| id | label | expected | got | score | patterns | recall | claims | degraded | ms |
|---|---|---|---|---|---|---|---|---|---|
| S01 | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:out_of_scope |  | 5851 |
| S02 | scam | high | medium | 0.35 | P08 | 1/2 | capital_increase:out_of_scope |  | 2574 |
| S03 | scam | high | high | 0.65 | P05 P15 | 2/3 |  |  | 2615 |
| S04 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2580 |
| S05 | scam | high | high | 0.592 | P03 P09 P11 | 2/3 |  |  | 2629 |
| S06 | scam | high | high | 0.584 | P02 P03 P12 | 3/4 |  |  | 2648 |
| S07 | scam | high | medium | 0.448 | P02 P13 | 2/3 |  |  | 3775 |
| S08 | scam | medium | high | 0.617 | P03 P04 P09 P10 | 3/3 |  |  | 5521 |
| S09 | scam | high | high | 0.524 | P03 P15 P16 | 2/4 |  |  | 3211 |
| S10 | scam | high | high | 0.6 | P14 | 1/1 |  |  | 3184 |
| S11 | scam | high | high | 0.545 | P01 P06 | 2/3 |  |  | 3482 |
| S12 | scam | high | high | 0.902 | P04 P08 P11 P13 | 4/4 |  |  | 3190 |
| S13 | scam | medium | low | 0.05 | P09 | 1/1 |  |  | 2720 |
| S14 | scam | high | high | 0.725 | P03 P08 P16 | 3/3 | supply_contract:out_of_scope |  | 2902 |
| S15 | scam | high | medium | 0.475 | P04 P06 | 2/3 |  | llm_rate_limit | 5152 |
| S16 | scam | high | high | 0.666 | P02 P10 | 2/3 |  | llm_rate_limit | 5029 |
| S17 | scam | high | high | 0.55 | P07 | 1/2 |  | llm_rate_limit | 4934 |
| S18 | scam | medium | medium | 0.35 | P01 | 1/1 | executive_rumor:not_disclosure_event |  | 2629 |
| S19 | scam | medium | high | 0.588 | P03 P04 P13 | 3/3 |  |  | 1942 |
| S20 | scam | high | medium | 0.4 | P11 | 1/2 |  |  | 1968 |
| S21 | scam | high | medium | 0.448 | P01 P16 | 2/3 | merger:out_of_scope |  | 3046 |
| S22 | scam | high | medium | 0.3 | P15 | 1/2 |  |  | 2452 |
| S23 | scam | medium | medium | 0.32 | P03 P16 | 2/2 |  |  | 3930 |
| S24 | scam | high | high | 0.663 | P07 P10 | 1/3 |  |  | 2712 |
| S25 | scam | medium | medium | 0.35 | P01 | 1/2 | executive_rumor:not_disclosure_event |  | 2478 |
| S26 | scam | medium | medium | 0.363 | P04 P09 | 2/3 |  |  | 3164 |
| S27 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2517 |
| S28 | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:out_of_scope |  | 3331 |
| S29 | scam | medium | uncertain | 0.3 | P06 | 1/2 |  |  | 1956 |
| S30 | scam | high | uncertain | 0.3 | P15 | 1/2 | listing:out_of_scope |  | 1901 |
| B01 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2825 |
| B02 | benign | low | low | 0 |  | 0/0 |  |  | 3148 |
| B03 | benign | low | low | 0 |  | 0/0 |  |  | 2122 |
| B04 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 2397 |
| B05 | benign | low | low | 0 |  | 0/0 |  |  | 2481 |
| B06 | benign | low | low | 0 |  | 0/1 |  |  | 2579 |
| B07 | benign | low | low | 0 |  | 0/0 |  |  | 2644 |
| B08 | benign | low | low | 0.15 | P04 | 0/0 |  |  | 2001 |
| B09 | benign | low | low | 0 |  | 0/0 | ceo_change:out_of_scope |  | 1881 |
| B10 | benign | low | medium | 0.438 | P04 P10 | 0/0 |  |  | 2001 |
| B11 | benign | low | low | 0 |  | 0/0 | convertible_bond:out_of_scope |  | 2052 |
| B12 | benign | low | low | 0.1 | P03 | 0/0 |  |  | 2461 |
| B13 | benign | low | low | 0 |  | 0/0 |  | llm_rate_limit | 5131 |
| B14 | benign | low | low | 0 |  | 0/0 |  |  | 4754 |
| B15 | benign | low | low | 0 |  | 0/0 | listing:out_of_scope |  | 2580 |
| B16 | benign | low | low | 0 |  | 0/0 |  |  | 2167 |
| B17 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2356 |
| B18 | benign | low | low | 0 |  | 0/0 |  |  | 2308 |
| B19 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 1988 |
| B20 | benign | low | low | 0 |  | 0/0 |  |  | 3075 |
| S01R | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:unconfirmed |  | 4612 |
| B01R | benign | low | low | 0 |  | 0/0 | supply_contract:confirmed |  | 3309 |
| S28R | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:partial |  | 2838 |

## 해석 (2026-09-06, sender_orgs 추가 후 회귀 확인)

- level 경계는 `patterns.json > scoring.levels` 기준 low [0, 0.3) / medium [0.3, 0.5) / high [0.5, 1]. `lib/scoring.ts`는 이 값을 JSON에서 읽는다.
- 발신자 소속(`sender_orgs`) 추출을 주장 추출 프롬프트에 추가한 뒤 재실행: 53건 전부 level·score가 직전 실행과 동일(변경 0건). 오발동은 B10 1건 그대로.
- degraded 4건(S15·S16·S17·B13)은 평가와 동시에 실행한 별도 테스트 호출 때문에 CLOVA 분당 한도(60 req·60k tokens)에 걸린 429이며, 규칙층 결과로 응답해 등급은 같았다.
- S13("대표님 말씀대로 … 12%네요")은 P09(weight 0.15) 단독이라 점수 규칙상 low가 상한이다.
- B10(피해 경험담)은 규칙층이 "VIP방·가입비"를 P04·P10으로 태깅해 medium. 점수 규칙이 규칙층 ∪ LLM 합집합이라 LLM Reflection만으로는 낮출 수 없다.
- S29·S30은 LLM이 `uncertain: true`로 판단해 "판단 유보"(medium 색)로 표시됐다.
