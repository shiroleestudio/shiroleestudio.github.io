# 텍스처 출처

전부 **CC0 1.0**(퍼블릭 도메인) — 출처 표기 의무 없음. 기록은 나중에 바꿀 때를 위해 남긴다.

| 파일 | 원본 | 출처 |
|---|---|---|
| `floor.*` | Wood092 | ambientCG (https://ambientcg.com/view?id=Wood092) |
| `plank.*`, `plank2.jpg` | Wood094 | ambientCG (https://ambientcg.com/view?id=Wood094) |
| `beam.*`, `wood2.jpg`, `log.*`, `log2.jpg` | Wood095 | ambientCG (https://ambientcg.com/view?id=Wood095) |
| `plaster.*`, `cream.jpg` | Plaster002 | ambientCG (https://ambientcg.com/view?id=Plaster002) |
| `stone.*`, `stone2.jpg` | Bricks102 | ambientCG (https://ambientcg.com/view?id=Bricks102) |
| `grass.*`, `grass2.jpg` | Ground037 | ambientCG (https://ambientcg.com/view?id=Ground037) |
| `shingle.*`, `shingle2.jpg` | RoofingTiles002 (어두운 비늘 슬레이트) | ambientCG (https://ambientcg.com/view?id=RoofingTiles002), 2026-11-27 |
| `bark.*` | Bark012 (1K) | ambientCG (https://ambientcg.com/view?id=Bark012), 2026-11-27 |
| `leafcard.webp` | LeafSet024 (Color + Opacity → RGBA, 3×3 잎 격자) | ambientCG (https://ambientcg.com/view?id=LeafSet024), 2026-11-27 |

원본은 2K JPG(Color·NormalGL·Roughness·AmbientOcclusion). 여기에는 색 1024 JPG(q92, 모델 팔레트 쪽으로 평균색을 옮김),
법선 WebP(OpenGL +Y, 마루·널빤지 1024, 나머지 512 — glb 용량), ORM 512 PNG(R=AO, G=거칠기, B=0) 로 줄여 넣었다. 변형 키(`plank2`·`wood2`·`cream`·`stone2`·`grass2`)는
색만 있고 법선·거칠기는 원본 키 것을 같이 쓴다(`textures.py` FAMILY).

지붕널(`shingle`)은 2026-11-27 부터 슬레이트 사진(나무 지붕널 CC0 사진은 미러에 없었다; 0.5 타일/m, 비늘 한 장 약 20 cm). `leafcard.webp` 는 잎 나무의 네모 카드에 쓰는 유일한 알파 텍스처(`build_house.py` leaf_cards). 통나무(`log`)는 2026-11-24 부터 Wood095 를 어둡게 맞춘 것(다듬은 통나무 느낌).
