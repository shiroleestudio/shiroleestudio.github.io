# shiroleestudio.github.io

이시로스튜디오(아기토끼 시로) 허브 사이트. GitHub Pages로 루트 주소 https://shiroleestudio.github.io 에 공개된다.

구성

- `index.html` — 첫 화면(소개, 지금 쓸 수 있는 것, 메뉴, 최근 소식)
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
