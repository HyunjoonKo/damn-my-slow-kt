# 🐌 damn-my-slow-kt

KT 인터넷 SLA 속도 미달 시 **자동으로 요금 감면 신청**하는 CLI 도구.

매일 새벽 4시에 속도 측정 → SLA 미달 시 자동 이의신청 → 기록 저장.

## 요구사항

- Node.js 18+
- KT 인터넷 회선 및 계정

## 설치

### npx로 바로 실행 (설치 불필요)

```bash
npx damn-my-slow-kt --help
```

### 글로벌 설치

```bash
npm install -g damn-my-slow-kt
damn-my-slow-kt --help
```

## 시작하기

### 1. 초기 설정

```bash
npx damn-my-slow-kt init
```

인터랙티브 모드로 다음을 설정합니다:
- KT 계정 (아이디/비밀번호)
- 요금제 정보
- Discord/Telegram 알림 (선택)
- **자동 스케줄 설치** (macOS launchd / Linux systemd/cron)

### 2. 1회 테스트 실행

```bash
# 실제 감면 신청 없이 테스트
npx damn-my-slow-kt run --dry-run

# 실제 실행 (SLA 미달 시 이의신청)
npx damn-my-slow-kt run
```

## 명령어

```bash
damn-my-slow-kt init              # 초기 설정 + 스케줄 설치
damn-my-slow-kt run               # 1회 측정 + 감면 신청
damn-my-slow-kt run --dry-run     # 측정만 (감면 신청 생략)
damn-my-slow-kt config show       # 설정 확인
damn-my-slow-kt history           # 측정 이력 조회 (최근 20개)
damn-my-slow-kt history -n 50     # 최근 50개
damn-my-slow-kt history -m 2026-04  # 특정 월 조회
damn-my-slow-kt report            # 월간 요약 리포트
damn-my-slow-kt schedule install  # 자동 스케줄 등록
damn-my-slow-kt schedule remove   # 자동 스케줄 제거
```

### 옵션

```bash
damn-my-slow-kt run --config /path/to/config.yaml  # 설정 파일 지정
damn-my-slow-kt run --verbose                       # 상세 로그
damn-my-slow-kt run --screenshot                    # 결과 스크린샷 저장
damn-my-slow-kt --no-update-check run               # 업데이트 체크 비활성화
```

## 설정 파일 (config.yaml)

`init` 명령으로 자동 생성됩니다:

```yaml
credentials:
  id: "kt_아이디@example.com"
  password: "비밀번호"

plan:
  name: "기가라이트"
  speed_mbps: 1000  # 계약 속도 (Mbps)

schedule:
  time: "04:00"  # 측정 시간
  timezone: "Asia/Seoul"

notification:
  discord_webhook: ""  # Discord 웹훅 URL (선택)
  telegram_bot_token: ""  # Telegram 봇 토큰 (선택)
  telegram_chat_id: ""   # Telegram 채팅 ID (선택)

headless: true  # false로 하면 브라우저 창 표시
db_path: "~/.damn-my-slow-kt/history.db"
```

> ⚠️ config.yaml은 .gitignore에 포함되어 있습니다. (비밀번호 보호)

## 자동 스케줄

### macOS (launchd)

`init` 명령 또는 수동으로:

```bash
damn-my-slow-kt schedule install
```

`~/Library/LaunchAgents/com.damn-my-slow-kt.plist` 파일을 생성하여 launchd에 등록합니다.

```bash
# 제거
damn-my-slow-kt schedule remove
```

### Linux (systemd)

systemd user 모드 타이머를 사용합니다:

```bash
damn-my-slow-kt schedule install

# 상태 확인
systemctl --user status damn-my-slow-kt.timer

# 제거
damn-my-slow-kt schedule remove
```

systemd가 없는 경우 crontab에 등록됩니다.

### Windows

Windows에서는 작업 스케줄러(Task Scheduler)를 직접 설정하세요:

1. Win + R → `taskschd.msc`
2. "기본 작업 만들기" 클릭
3. 프로그램: `damn-my-slow-kt run --config C:\path\to\config.yaml`
4. 트리거: 매일 04:00

## 자동 업데이트 체크

실행 시 npm registry에서 최신 버전을 자동으로 확인합니다 (24시간에 1번):

```
🔄 새 버전이 있습니다: v0.1.0 → v0.2.0
   npm install -g damn-my-slow-kt@latest
```

비활성화:
```bash
damn-my-slow-kt --no-update-check run
```

## KT SLA 기준

- **최저보장속도**: 계약 속도의 50% (1Gbps → 500Mbps)
- **5회 측정 중 3회 이상 미달** → SLA 실패 → 자동 이의신청
- 이의신청 성공 시 요금 감면 처리

## 이력 조회

```bash
damn-my-slow-kt history
```

```
📊 인터넷 속도 측정 이력
┌────────────────────┬──────┬──────────────┬──────────────┬──────────┬──────────┬──────────┐
│ 일시               │ ISP  │ 다운로드     │ 업로드       │ Ping     │ SLA      │ 이의신청 │
├────────────────────┼──────┼──────────────┼──────────────┼──────────┼──────────┼──────────┤
│ 2026-04-08 04:00   │ KT   │ 64.0 Mbps    │ 0.0 Mbps     │ 0 ms     │ ❌       │ ✅       │
└────────────────────┴──────┴──────────────┴──────────────┴──────────┴──────────┴──────────┘
```

## 라이선스

MIT
