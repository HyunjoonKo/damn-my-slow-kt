# damn-my-slow-kt

KT 인터넷 SLA 속도 미달 시 요금 감면을 자동화하는 CLI 도구.

## 개요

KT는 SLA(Service Level Agreement) 기준 속도에 미달하면 요금 감면을 제공한다.
하지만 사용자가 직접 KT 홈페이지에 로그인 → 속도 측정 → 감면 신청을 해야 하는데, 이 과정이 귀찮아서 대부분 하지 않는다.

이 도구는 이 전체 과정을 자동화한다.

## 핵심 기능

1. **KT 홈페이지 자동 로그인** (Playwright 기반 브라우저 자동화)
2. **KT 공식 SLA 속도 측정 실행** (speed.kt.com)
3. **측정 결과 기록** (SQLite)
4. **속도 미달 시 감면 자동 신청**
5. **결과 리포트** (Discord/Telegram 알림 옵션)

## KT SLA 측정 플로우

1. https://speed.kt.com/sla/slatest/introduce.asp 접속
2. "품질보증(SLA) 테스트" 버튼 클릭
3. KT 계정 로그인 (accounts.kt.com)
4. 비밀번호 변경 안내 → "다음에 하기" 클릭 (필요 시)
5. 회선 선택 → 측정 시작 (#measureBtn)
6. 5회 자동 측정 완료 대기 (약 25분)
7. 결과 파싱 → SLA pass/fail 판단
8. fail 시 "이의신청" 버튼 클릭

## SLA 기준

- 최저보장속도: 계약 속도의 50% (기가라이트 1G → 500Mbps)
- 5회 측정 중 3회 이상 미달 시 SLA 실패 → 감면 신청 가능
- 유선(LAN) 연결만 대상

## 기술 스택

- **언어**: Python 3.11+
- **브라우저 자동화**: Playwright (headless Chrome)
- **스케줄링**: cron
- **설정**: YAML config 파일
- **데이터 저장**: SQLite (측정 이력)
- **알림**: Discord webhook / Telegram bot (선택)

## 설정 파일 (config.yaml)

```yaml
credentials:
  id: "사용자ID"
  password: "비밀번호"
plan:
  name: "기가라이트"
  speed_mbps: 1000
schedule:
  time: "04:00"
  timezone: "Asia/Seoul"
notification:
  discord_webhook: ""
  telegram_bot_token: ""
  telegram_chat_id: ""
```

## CLI 인터페이스

```bash
damn-my-slow-kt init              # config.yaml 생성
damn-my-slow-kt config show       # 현재 설정 보기
damn-my-slow-kt run               # 1회 측정 + 감면 신청
damn-my-slow-kt run --dry-run     # 측정만 (감면 신청 생략)
damn-my-slow-kt history           # 측정 이력 조회
damn-my-slow-kt history --month 2026-04
damn-my-slow-kt report            # 요약 리포트
damn-my-slow-kt schedule install  # cron 등록
damn-my-slow-kt schedule remove   # cron 제거
```

## 프로젝트 구조

```
damn-my-slow-kt/
├── README.md
├── SPEC.md
├── pyproject.toml
├── src/
│   └── damn_my_slow_kt/
│       ├── __init__.py
│       ├── cli.py         # CLI 엔트리포인트
│       ├── config.py      # YAML 설정 로드/저장
│       ├── db.py          # SQLite 이력 저장
│       ├── report.py      # 리포트 생성
│       ├── notify.py      # Discord/Telegram 알림
│       ├── scheduler.py   # cron 등록/해제
│       └── providers/
│           ├── __init__.py
│           └── kt.py      # KT 자동화
```

## 주의사항

- Playwright headless 모드에서 KT 속도측정 엔진 동작이 제한될 수 있음 → `headless: false` 권장
- KT 2FA/CAPTCHA 대응 필요할 수 있음
- 비밀번호 평문 저장 → config.yaml을 .gitignore에 포함
