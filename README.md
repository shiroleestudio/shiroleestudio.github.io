# shiroleestudio.github.io

이시로스튜디오(아기토끼 시로) 허브 사이트. GitHub Pages로 루트 주소 https://shiroleestudio.github.io 에 공개된다.

구성

- `index.html` — 첫 화면: 맨 위가 3D '시로의 집'(아래 절), 그 밑에 지금 쓸 수 있는 것, 메뉴판, 최근 소식
- `works/` — 작품 목록, `works/timeline/`, `works/space-surfer/` 소개 페이지
- `news/` + `feed.xml` — 소식과 RSS(Atom). 새 소식은 두 곳에 함께 추가
- `about/` — 시로 이야기, `support/` — 자주 묻는 질문·문의
- `sitemap.xml`, `robots.txt`, `assets/og.png`(공유 이미지), `assets/img/`(스크린샷)
- `privacy/<앱이름>/` — 앱별 개인정보처리방침 (swingby, timeline, coffee)
- `app-ads.txt` — 애드몹 app-ads.txt (가입 후 한 줄 채움)
- `404.html` — 없는 주소 안내

규칙

- 외부 스크립트·폰트 없이 정적 파일만 쓴다. 경로는 상대경로(404.html만 절대경로).
- 머리말·꼬리말은 페이지마다 같은 마크업이 들어 있다. 메뉴를 바꾸면 모든 페이지를 함께 고친다.
- 아직 공개되지 않은 곳(예: itch.io 페이지)은 링크하지 않는다.
- 시로 그래픽은 캐릭터 시트 확정 전 임시 표현이다. `TODO(character-sheet)` 주석 참고.
- 개인 실명·소속·직업은 어디에도 넣지 않는다. 문의는 shiroleestudio@gmail.com.
- 릴리스마다 `CHANGELOG.md` 맨 위에 한 줄 추가하고 `vX.Y.Z` 태그를 남긴다.

운영

- 배포: `main` 에 푸시하면 GitHub Pages 가 그대로 올린다(빌드 없음, 1~2분). 상태는 Actions 탭의 "pages build and deployment".
- 되돌리기: 잘못 올라갔으면 `git revert` 로 커밋을 되돌려 다시 푸시한다. 설정을 만질 일은 없다.
- 깨졌을 때 볼 곳: Settings → Pages 의 Source 가 `main` / root 인지. 그 외에는 HTML 문법 오류뿐이다.
- 외부 계정·정기 점검·다른 저장소 목록은 `STUDIO.md`.
- 라이선스: 코드(HTML·CSS·JS)는 `LICENSE`(MIT). 시로 캐릭터 그림과 글은 이시로스튜디오의 것으로, MIT 에 포함되지 않는다.

## 시로의 집 (첫 화면의 3D 건물, 파일은 `building/`)

첫 화면의 주인공. 1층 찻집 · 2층 갤러리(화실+공방) · 3층 다락(놀이방·천문대) + 루프탑, 지붕 위 돔에서 망원경이 나온다. 방 라벨이 곧 메뉴다. 그 아래 글 메뉴판은 폰·검색·3D 가 안 되는 기기를 위한 같은 내용. `building/index.html` 은 첫 화면으로 넘기기만 한다.

- `building/house.glb` — 모델. **손으로 고치지 않는다.** `building/model/build_house.py` 를 고치고 다시 만든다:
  `pip install bpy` (Python 3.11) 후 `python building/model/build_house.py building/house.glb`, 또는 `blender -b -P building/model/build_house.py -- building/house.glb`.
- 모델과 코드의 약속: 노드 extras 의 `floor`(층)·`cut`(S/N/E/W, 카메라가 그쪽이면 걷어 냄), 빈 객체 `anchor_<방id>`(라벨 자리), 재질 이름 `glow*`(불 켜진 창).
- `building/building.js` — 회전·단면·층 고르기·라벨·그림체(툰 3단 명암 + 화면 공간 잉크 외곽선 + 종이 결). 방과 링크는 맨 위 `ROOMS`(사이트 뿌리 기준 경로). 작품이 늘면 `ROOMS` 와 첫 화면 메뉴판을 같이 고친다.
- 콘셉트 그림(나노바나나 초안)은 저장소 밖 프로젝트 폴더에 있다. AI 초안이라 사이트에 올리지 않는다.
- 캐릭터(시로·카피바라씨·코알라씨)는 캐릭터 시트 뒤에 넣는다. `TODO(character-sheet)`.
- three.js r180 과 GLTFLoader 는 `assets/vendor/three/`(MIT) 사본, `importmap` 으로 `three` 를 가리킨다. 외부 스크립트 없음.
- 위아래·좌우로 돌린다(위아래는 거의 눈높이~위에서 내려다보기 사이로 막아 둠). 무대 위에서는 세로로 끌어도 페이지가 스크롤되지 않는다(`touch-action:none`). 층을 고르면 그 위는 걷어 낸다. WebGL 이 없으면 목록만, '동작 줄이기'면 자동 회전 없음.
- 이름표는 무대 가장자리에 세우고 방까지 긴 인출선으로 잇는다(도감처럼). 넓은 화면은 양옆 끝, 폭 520px 미만은 위아래 끝 띠. 카메라 거리가 그 칸만큼 건물을 작게 잡는다(`resize()`).
