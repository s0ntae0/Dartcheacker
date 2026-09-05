-- 찌라시체크 MVP 스키마 v0.1 (Supabase SQL Editor에 그대로 붙여넣기)
-- 서버(Next.js route handler)는 service_role 키로 접근. anon 키로는 아무 테이블도 못 읽게 RLS만 켜둠.

create extension if not exists pg_trgm;

-- 1. 상장사 목록 (OpenDART corpCode.xml → stock_code 있는 것만 적재)
create table if not exists corps (
  corp_code   text primary key,          -- DART 고유번호 8자리
  corp_name   text not null,
  stock_code  text not null,             -- 종목코드 6자리
  modify_date date,
  created_at  timestamptz default now()
);
create index if not exists corps_name_trgm on corps using gin (corp_name gin_trgm_ops);
create index if not exists corps_stock_code on corps (stock_code);

-- 2. 별칭 (삼전→삼성전자 같은 것. 초기엔 비워두고 필요할 때 추가)
create table if not exists corp_aliases (
  alias      text primary key,
  corp_code  text not null references corps(corp_code) on delete cascade
);

-- 3. 공시 목록 캐시 (OpenDART list.json 응답 저장. 같은 기업 재조회 시 API 호출 절약)
create table if not exists disclosures (
  rcept_no    text primary key,          -- 접수번호 14자리
  corp_code   text not null,
  corp_name   text,
  report_nm   text not null,             -- 공시 제목 ("[정정]" 여부 여기서 판단)
  rcept_dt    date not null,
  flr_nm      text,                      -- 제출인
  rm          text,                      -- 비고 (유·코·정 등)
  fetched_at  timestamptz default now()
);
create index if not exists disclosures_corp_dt on disclosures (corp_code, rcept_dt desc);

-- 4. 검증 로그 (기능명세서 §4 "입력·출력 데이터" 근거 + 나중에 라벨 데이터)
create table if not exists checks (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz default now(),
  input_text   text not null,
  input_hash   text not null,            -- sha256, 동일 입력 캐시/중복 집계용
  risk_score   numeric(4,3),
  risk_level   text check (risk_level in ('low','medium','high','uncertain')),
  patterns     jsonb default '[]'::jsonb, -- [{id, spans[], confidence, source}]
  claims       jsonb default '[]'::jsonb, -- [{text, corp_code, type, verdict, evidence}]
  llm_model    text,
  latency_ms   integer,
  error        text
);
create index if not exists checks_created on checks (created_at desc);
create index if not exists checks_hash on checks (input_hash);

-- 5. 사용자 신고/피드백 (로드맵용. MVP에선 버튼만 없으면 됨. 테이블은 미리)
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  check_id   uuid references checks(id) on delete cascade,
  created_at timestamptz default now(),
  verdict    text check (verdict in ('agree','disagree')),
  note       text
);

-- RLS: 전부 켜고 정책 없음 → anon 접근 불가, service_role만 통과
alter table corps         enable row level security;
alter table corp_aliases  enable row level security;
alter table disclosures   enable row level security;
alter table checks        enable row level security;
alter table feedback      enable row level security;

-- 기업명 퍼지 검색용 함수 (LLM이 뽑은 기업명 → corp_code)
create or replace function find_corp(q text, lim int default 5)
returns table (corp_code text, corp_name text, stock_code text, sim real)
language sql stable as $$
  select c.corp_code, c.corp_name, c.stock_code, similarity(c.corp_name, q) as sim
  from corps c
  where c.corp_name % q or c.corp_name ilike '%' || q || '%'
  order by sim desc, length(c.corp_name)
  limit lim;
$$;
