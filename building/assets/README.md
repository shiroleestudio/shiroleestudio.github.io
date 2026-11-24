# 시로의 집 — 에셋 폴더

두호가 만든(또는 외주로 받은) 그림·모델을 여기에 넣는다. 빌드 스크립트가 이 폴더를 먼저 보고, 없는 것만 코드로 만든다.
AI 초안(나노바나나 등)은 여기 넣지 않는다 — 저장소 밖 프로젝트 폴더(`hub/`)에 둔다.

## textures/ — 재질 텍스처 (이음새 없이 반복, 1 타일 = 1 m)

파일 이름은 `build_house.py` 의 재질 키와 같다(확장자는 png·jpg·webp 아무거나). 색 지도 `<키>.jpg` 만 넣어도 되고(법선·거칠기는 코드가 만든 것을 씀),
`<키>_n`(접선 공간 법선, OpenGL 규약 +Y 위)·`<키>_orm`(R=AO 또는 1, G=거칠기, B=금속성) 까지 넣으면 그것을 쓴다.
권장 1024×1024(sRGB), 법선·거칠기는 선형. 넣은 뒤 `python building/model/build_house.py building/house.glb` 로 다시 만든다.
지금 들어 있는 것은 ambientCG 의 CC0 사진 텍스처 7벌(`textures/SOURCES.md`) — 지붕널은 아직 코드 생성.

| 키 | 쓰이는 곳 | 타일/m |
|---|---|---|
| `log`, `log2` | 바깥 통나무 벽 | 0.72 |
| `plank`, `plank2` | 널빤지(문·가구·의자, 세로 결) | 0.8 |
| `floor` | 마루 | 0.6 |
| `beam`, `wood2` | 기둥·보·난간 | 1.2 |
| `plaster`, `cream` | 안쪽 회벽 | 0.5 |
| `shingle`, `shingle2` | 지붕널 | 1.0 |
| `stone`, `stone2` | 굴뚝·주춧돌·지하실·돌길 | 1.0 |
| `grass`, `grass2` | 잔디 | 0.7 |

## models/ — 모델 (glb)

집 본체·소품을 Blender 등에서 손으로 만든 glb. 아직 빌드가 읽지 않는다 — 에셋 경로(직접/외주/섞기)가 정해지면
`build_house.py` 가 상자 대신 이 모델을 끼우는 길을 낸다. 약속: Y 위, 1 단위 = 1 m, 원점은 바닥 가운데, 노드 extras `floor`·`cut`, `anchor_<방id>`, 재질 이름 `glow*`(README '시로의 집').

## reference/ — 참고 그림

손그림 콘셉트, 색 견본, 사진 참고. 사이트에 올라가지 않는다(코드가 읽지 않음).

캐릭터(시로·카피바라씨·코알라씨)는 캐릭터 시트가 정해진 뒤 `models/characters/` 에. TODO(character-sheet).
