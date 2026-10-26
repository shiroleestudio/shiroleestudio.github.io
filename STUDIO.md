# 이시로스튜디오 운영 메모

저장소에 속하지 않는 것만 여기에 적는다. 각 서비스의 빌드·배포·되돌리기는 **그 저장소 README 의 "운영" 절**에 있다.
이 파일은 사람이 따로 손보는 문서가 아니다 — 계정이 생기거나 저장소가 바뀌는 작업을 할 때 같은 PR 에서 함께 고친다.
비밀값(비밀번호, 키, 광고 ID)은 절대 적지 않는다.

## 원칙

- 모든 서비스는 5~10년 이상 운영한다. 유지보수가 쉬운 쪽을 고른다: 의존성은 적게, 표준 기술로, 사람이 혼자 읽을 수 있게.
- 문서는 설명하는 대상 옆에 둔다. 코드를 바꾸는 PR 이 그 문서도 바꾼다. 따로 떨어진 문서는 만들지 않는다.
- 사용자 데이터는 기기 안에만 있다(서버 없음). 백업은 각 앱의 내보내기 기능으로 사용자가 한다.

## 서비스와 저장소

| 서비스 | 저장소 | 주소 | 배포 방식 |
|---|---|---|---|
| 허브 | shiroleestudio/shiroleestudio.github.io | https://shiroleestudio.github.io | main 그대로 Pages |
| 타임라인 | shiroleestudio/prettymuchtimelines | …/prettymuchtimelines/ | 빌드 결과를 커밋, main 그대로 Pages |
| 커피 레시피 | shiroleestudio/coffee | …/coffee/ | Actions 빌드 → Pages |
| 스페이스서퍼 달토끼 | shiroleestudio/swingby | …/swingby/ , itch.io | Actions 빌드 → Pages |
| 메모함 | shiroleestudio/memobox | …/memobox/ | main 그대로 Pages |
| 출석부 | dooholee96-code/choolsukbu | (앱, 사이드로드) | Xcode 로 기기에 설치 |

정적 사이트 다섯은 전부 상대경로이고 서버가 없다. GitHub Pages 를 못 쓰게 되면 어떤 정적 호스팅에든 그대로 올릴 수 있다.

## 계정

| 계정 | 용도 | 비고 |
|---|---|---|
| GitHub 조직 shiroleestudio | 코드·Pages | 소유자가 개인 계정 하나뿐 — 두 번째 소유자를 두는 것이 할 일 |
| shiroleestudio@gmail.com | 문의·스토어·광고 계정의 기준 메일 | 2FA 와 복구 코드를 종이에 보관 |
| itch.io | 게임 웹판 배포 | 위 Gmail 로 가입 |
| 아직 없음 | Google Play Console, AdMob, AdSense, Apple Developer, 도메인 | 명의가 정해진 뒤 만든다 |

## 정기 점검

| 주기 | 할 일 | 해당 |
|---|---|---|
| 매년 10월 | Node LTS 확인 — 워크플로 `node-version` 과 `.nvmrc` 갱신 | 커피, 스윙바이 |
| 매년 | GitHub Actions(`actions/*`) 메이저 갱신, `npm ci && npm run build` 가 아직 되는지 확인 | 커피, 스윙바이 |
| 매년 8월 | Play targetSdk 상향, 광고 SDK 갱신 | 스윙바이 앱판(출시 후) |
| 매년 | Apple Developer 갱신, Expo SDK 업그레이드 | 출석부(유료 출시 시) |
| 매년 | 도메인 자동갱신·결제 수단 확인 | 도메인 구입 후 |
| 분기 | 전 저장소 `git clone --mirror` 를 PC 와 클라우드 드라이브에 보관 | 전체 |
| 분기 | 두 계정의 2FA·복구 코드 확인, 조직 소유자 2명 유지 | GitHub, Gmail |
| 수시 | 60일간 커밋이 없으면 GitHub 이 예약 워크플로를 끈다 — Actions 탭에서 다시 켠다 | 타임라인 `sources.yml` |

## 릴리스

- 버전은 `vX.Y.Z`. 저장소마다 `CHANGELOG.md` 맨 위에 한 줄, GitHub Releases 에서 태그를 만든다.
- 커피는 릴리스마다 `npm run build:single` 의 `dist-single/index.html` 을 Releases 에 첨부한다 — 빌드 도구가 썩어도 그 파일 하나로 서비스를 이어 갈 수 있다.
