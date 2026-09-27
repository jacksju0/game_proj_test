# 3D 윷놀이 (game_proj_test)

브라우저에서 즐기는 3D 전통 윷놀이. **사람 vs 사람**, **사람 vs PC** 대전, 대기실·방 채팅(비속어 필터), 토스페이먼츠 **테스트 결제**로 포인트 충전, 아이템 구매를 지원합니다.

**▶ 게임 하러 가기: https://jacksju0.github.io/game_proj_test/**

- 프론트엔드: React + Vite + three.js(@react-three/fiber) → **GitHub Pages**
- 백엔드: **Supabase** (Postgres + RLS, Realtime, Edge Functions)
- 결제: **토스페이먼츠** 결제창 SDK v2 (테스트 모드)

## 게임 규칙 요약

| 항목 | 내용 |
| --- | --- |
| 말 | 1인당 4개. 같은 칸의 내 말은 업혀서 함께 이동 |
| 윷 | 도(1)·개(2)·걸(3)·윷(4)·모(5)·빽도(-1, 표시된 가락 하나만 배가 위) |
| 추가 던지기 | 윷·모가 나오거나 상대 말을 잡으면 한 번 더 |
| 지름길 | 모서리(5·10번)나 중앙에 **멈추면** 대각선으로 진입, 중앙에 멈추면 출발점 방향 |
| 완주 | 출발점(참먹이)에 도달하거나 지나가면 완주. 4개 모두 완주하면 승리 |
| 선공 | 게임 시작 시 동전 던지기. 방장(0번 자리)=앞면, 상대=뒷면 |
| 기권 | 게임 중 방을 나가면 기권패 |

### 아이템 (내 턴 시작 후 윷을 던지기 전에만 사용)

| 아이템 | 가격 | 효과 |
| --- | --- | --- |
| 🎯 한번 더 던지기 | 500P | 이번 턴에 윷을 한 번 더 던짐 (턴당 1회) |
| 💫 죽은 말 부활하기 | 1000P | 직전 상대 턴에 잡힌 내 말을 잡힌 자리에 부활. 잡힌 **직후 내 턴**에만 사용 가능 |

> 부활한 말은 잡힌 자리로 돌아가며, 그 자리에 상대 말이 있으면 함께 놓입니다(서로 잡지 않음). 이후 이동부터는 일반 규칙대로 잡기가 적용됩니다.

## 구조

```
src/                       프론트엔드 (React)
  screens/                 로그인·회원가입, 대기실(방 목록·채팅·접속자), 방 대기 화면
  game/                    3D 판(Board3D), 윷/동전 3D 애니메이션, 게임 화면
  components/              채팅, 포인트 구매(토스), 아이템 구매
supabase/
  migrations/              DB 스키마 (profiles, rooms, room_players, chat_messages, payments, RPC)
  functions/
    _shared/yut.ts         윷놀이 엔진 (서버·클라이언트 공용, 서버가 판정 권한을 가짐)
    _shared/profanity.ts   비속어 탐지기 (Gemini gemini-3.5-flash-lite, 실패 시 금칙어 목록)
    signup/                회원가입 (이름·아이디·비밀번호)
    game/                  방 생성/참가/나가기/시작, 던지기·이동·아이템, PC AI
    chat/                  채팅 전송 + 비속어 필터 ("비속어는 사용 할 수 없습니다.")
    payments/              토스 결제 주문 생성·승인 → 1원 = 1포인트 적립
tests/                     엔진 시뮬레이션·비속어 필터 테스트 (npm test)
```

- 윷 결과는 서버(Edge Function)에서 `crypto.getRandomValues`로 결정되고, 모든 이동·아이템 사용은 서버에서 검증됩니다.
- 방 상태는 `rooms.state`(jsonb)에 저장되고 Supabase Realtime으로 양쪽에 전파됩니다.
- 회원 비밀번호는 Supabase Auth가 해시로 저장하며, 아이디는 내부적으로 `아이디@yutnori.game` 형식의 계정으로 매핑됩니다.

## 배포

### 프론트엔드 (GitHub Pages)
`main`에 push하면 `.github/workflows/deploy-frontend.yml`이 테스트 → 빌드 → Pages 배포를 수행합니다.

### 백엔드 (Supabase)
`supabase/` 변경을 push하면 `.github/workflows/deploy-backend.yml`이 마이그레이션과 Edge Functions를 Supabase에 배포합니다. 저장소 시크릿이 필요합니다.

| 종류 | 이름 | 설명 |
| --- | --- | --- |
| Secret | `SUPABASE_ACCESS_TOKEN` | Supabase 계정 액세스 토큰 |
| Secret | `SUPABASE_DB_PASSWORD` | DB 비밀번호 (마이그레이션용, 선택) |
| Supabase Secret | `GEMINI_API_KEY` | 채팅 비속어 판단용 Gemini API 키 (없으면 금칙어 목록으로 판단) |
| Variable | `VITE_TOSS_CLIENT_KEY` | 토스페이먼츠 **테스트 클라이언트 키** (`test_ck_…`, 공개값) |

### 토스페이먼츠 테스트 키 설정
1. [개발자센터](https://developers.tosspayments.com) → API 키 → **API 개별 연동 키**의 테스트 키 확인
2. 클라이언트 키(`test_ck_…`) → GitHub 저장소 Variable `VITE_TOSS_CLIENT_KEY`
3. 시크릿 키(`test_sk_…`) → Supabase 대시보드 → Edge Functions → Secrets → `TOSS_SECRET_KEY`
   (시크릿 키는 절대 프론트엔드/저장소에 넣지 마세요)

키를 설정하지 않으면 토스페이먼츠 문서 공개 테스트 키로 동작합니다(결제는 되지만 내 개발자센터 내역에는 표시되지 않음).

## 로컬 실행

```bash
npm install
npm run dev      # http://localhost:5173/game_proj_test/
npm test         # 엔진/비속어 필터 테스트
```
