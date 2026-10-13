# Momentum

## 프로젝트 소개
**Momentum**은 '매일 물 2L 마시기', '영양제 먹기' 같은 습관을 **구글 캘린더**와 연동해 알려 주고,
하루 한 번 체크한 기록으로 **연속 성공 일수(Streak)** 와 통계를 보여 주는 습관 트래커입니다.
3일 만에 끊기던 습관을, 끊기지 않은 날짜를 눈으로 보면서 이어 가도록 돕습니다.

## 주요 기능
- Google 계정 로그인 (Supabase Auth, 캘린더 권한 동의)
- 습관 추가 (이모지, 알림 시간) / 삭제
- 오늘 체크 · 체크 취소
- 연속 성공 일수(현재 / 최고) 자동 계산 및 DB 기록
- 통계: 오늘 완료 수, 최근 7일 달성률, 요일별 완료 막대 그래프, 최근 28일 히트맵
- 오늘의 구글 캘린더 일정 보기 (습관 일정은 강조 표시 + 완료 여부 표시)

## Google API
- **Google Calendar API v3**
- 습관을 추가하면 `events.insert`로 **매일 반복(RRULE:FREQ=DAILY) 일정**을 캘린더에 생성하고, 응답으로 받은 **이벤트 ID와 링크**를 DB에 저장합니다.
- `events.list`로 오늘 일정을 불러와 화면에 표시하고, 습관 일정(반복 이벤트 ID가 일치)은 체크 여부와 함께 보여 줍니다.
- 습관을 삭제하면 저장해 둔 이벤트 ID로 `events.delete`를 호출해 캘린더 일정도 함께 지웁니다.

## 데이터베이스
- **Supabase (PostgreSQL)**
- `habits` 테이블: 습관 이름, 이모지, 알림 시간, 캘린더 이벤트 ID/링크, 현재 연속일수(`current_streak`), 최고 연속일수(`best_streak`)
- `habit_logs` 테이블: 습관별 체크 날짜 (같은 날 중복 체크 방지)
- Row Level Security로 본인 데이터만 접근할 수 있습니다.
- 테이블 생성 SQL: `supabase/schema.sql`

## 사용 기술
Next.js 14 (App Router) · React 18 · Supabase (Auth, PostgreSQL) · Google Calendar API · Vercel · GitHub

## 실행 주소
[https://momentum-pi-pink.vercel.app/](https://momentum-pi-pink.vercel.app/)

## 환경 변수
`.env.example` 참고 — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 참고
Google 로그인 시 받는 캘린더 접근 토큰은 약 1시간 뒤 만료됩니다. 만료되면 화면 상단의 '캘린더 다시 연결' 버튼으로 다시 연결하세요.
