# 평가 결과 (gold 53건)

- 실행: 2026-09-06T03:32:34.335Z / 대상: http://localhost:3000

## 사기 32건
- expected_level 일치: 19/32
- level ≥ medium(uncertain 포함): 31/32
- expected_patterns recall(패턴 단위): 59/83 (71%)

## 정상 21건
- level = low: 20/21
- 오발동: 1건 — B10(medium, [P04,P10], 0.438)

## 지연
- 평균 3083ms / 오류 0건 / degraded 0건

## 상세

| id | label | expected | got | score | patterns | recall | claims | degraded | ms |
|---|---|---|---|---|---|---|---|---|---|
| S01 | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:out_of_scope |  | 4949 |
| S02 | scam | high | medium | 0.35 | P08 | 1/2 | capital_increase:out_of_scope |  | 2584 |
| S03 | scam | high | high | 0.65 | P05 P15 | 2/3 |  |  | 3608 |
| S04 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2628 |
| S05 | scam | high | high | 0.592 | P03 P09 P11 | 2/3 |  |  | 2540 |
| S06 | scam | high | high | 0.584 | P02 P03 P12 | 3/4 |  |  | 3017 |
| S07 | scam | high | medium | 0.448 | P02 P13 | 2/3 |  |  | 3956 |
| S08 | scam | medium | high | 0.617 | P03 P04 P09 P10 | 3/3 |  |  | 3141 |
| S09 | scam | high | high | 0.524 | P03 P15 P16 | 2/4 |  |  | 6353 |
| S10 | scam | high | high | 0.6 | P14 | 1/1 |  |  | 2415 |
| S11 | scam | high | high | 0.545 | P01 P06 | 2/3 |  |  | 4204 |
| S12 | scam | high | high | 0.902 | P04 P08 P11 P13 | 4/4 |  |  | 2587 |
| S13 | scam | medium | low | 0.05 | P09 | 1/1 |  |  | 2969 |
| S14 | scam | high | high | 0.725 | P03 P08 P16 | 3/3 | supply_contract:out_of_scope |  | 3009 |
| S15 | scam | high | medium | 0.475 | P04 P06 | 2/3 |  |  | 3365 |
| S16 | scam | high | high | 0.666 | P02 P10 | 2/3 |  |  | 2607 |
| S17 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2460 |
| S18 | scam | medium | medium | 0.35 | P01 | 1/1 | insider_claim:out_of_scope |  | 2846 |
| S19 | scam | medium | high | 0.588 | P03 P04 P13 | 3/3 |  |  | 2834 |
| S20 | scam | high | medium | 0.4 | P11 | 1/2 |  |  | 2363 |
| S21 | scam | high | medium | 0.448 | P01 P16 | 2/3 | merger:out_of_scope |  | 2955 |
| S22 | scam | high | medium | 0.3 | P15 | 1/2 |  |  | 2177 |
| S23 | scam | medium | medium | 0.32 | P03 P16 | 2/2 |  |  | 4035 |
| S24 | scam | high | high | 0.663 | P07 P10 | 1/3 |  |  | 7819 |
| S25 | scam | medium | medium | 0.35 | P01 | 1/2 | executive_rumor:not_disclosure_event |  | 2383 |
| S26 | scam | medium | medium | 0.363 | P04 P09 | 2/3 |  |  | 2678 |
| S27 | scam | high | high | 0.55 | P07 | 1/2 |  |  | 2433 |
| S28 | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:out_of_scope |  | 3466 |
| S29 | scam | medium | uncertain | 0.3 | P06 | 1/2 |  |  | 2250 |
| S30 | scam | high | uncertain | 0.3 | P15 | 1/2 | listing:out_of_scope |  | 1518 |
| B01 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2934 |
| B02 | benign | low | low | 0 |  | 0/0 | capital_increase:out_of_scope |  | 3685 |
| B03 | benign | low | low | 0 |  | 0/0 |  |  | 3453 |
| B04 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 2729 |
| B05 | benign | low | low | 0 |  | 0/0 |  |  | 2425 |
| B06 | benign | low | low | 0 |  | 0/1 |  |  | 3184 |
| B07 | benign | low | low | 0 |  | 0/0 |  |  | 2254 |
| B08 | benign | low | low | 0.15 | P04 | 0/0 |  |  | 1949 |
| B09 | benign | low | low | 0 |  | 0/0 | ceo_change:out_of_scope |  | 2160 |
| B10 | benign | low | medium | 0.438 | P04 P10 | 0/0 |  |  | 1824 |
| B11 | benign | low | low | 0 |  | 0/0 | convertible_bond:out_of_scope |  | 1897 |
| B12 | benign | low | low | 0.1 | P03 | 0/0 |  |  | 5674 |
| B13 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 5200 |
| B14 | benign | low | low | 0 |  | 0/0 | major_holder:out_of_scope |  | 3018 |
| B15 | benign | low | low | 0 |  | 0/0 | listing:out_of_scope |  | 3218 |
| B16 | benign | low | low | 0 |  | 0/0 |  |  | 2218 |
| B17 | benign | low | low | 0 |  | 0/0 | supply_contract:out_of_scope |  | 2411 |
| B18 | benign | low | low | 0 |  | 0/0 |  |  | 2227 |
| B19 | benign | low | low | 0 |  | 0/0 | earnings:out_of_scope |  | 1946 |
| B20 | benign | low | low | 0 |  | 0/0 |  |  | 2240 |
| S01R | scam | high | high | 1 | P01 P03 P04 | 3/4 | supply_contract:unconfirmed |  | 4689 |
| B01R | benign | low | low | 0 |  | 0/0 | supply_contract:confirmed |  | 3233 |
| S28R | scam | high | medium | 0.438 | P04 P10 | 2/2 | capital_increase:partial |  | 2685 |

## 해석 (2026-09-06, level 경계 변경 후)

- level 경계를 `patterns.json > scoring.levels` 기준 low [0, 0.3) / medium [0.3, 0.5) / high [0.5, 1]로 변경(이번만 예외적으로 허용). `lib/scoring.ts`는 이 값을 JSON에서 읽는다.
- 변경 효과: 사기 중 0.5~0.6 구간이던 S05·S06·S09·S11이 high로 올라가 expected_level 일치가 16/32 → 19/32. 정상 20건은 변화 없음(오발동 B10 1건 유지, 0.438은 medium).
- STEP 6 완료 기준 충족: 정상 20건 오발동 1건(≤ 2), 사기 30건 level ≥ medium 29건(+실제 기업 사본 2건 모두 ≥ medium) (≥ 27).
- S13("대표님 말씀대로 … 12%네요")은 P09(weight 0.15) 단독이라 점수 규칙상 low가 상한이다.
- B10(피해 경험담)은 규칙층이 "VIP방·가입비"를 P04·P10으로 태깅해 medium. 점수 규칙이 규칙층 ∪ LLM 합집합이라 LLM Reflection만으로는 낮출 수 없다.
- S29·S30은 LLM이 `uncertain: true`로 판단해 "판단 유보"(medium 색)로 표시됐다.
- LLM(HCX-005) 한도(60 req/min·60k tokens/min) 때문에 `--gap 2000`으로 실행했다.
