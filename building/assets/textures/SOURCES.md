# 텍스처 출처

전부 **CC0 1.0**(퍼블릭 도메인) — 출처 표기 의무 없음. 기록은 나중에 바꿀 때를 위해 남긴다.

| 파일 | 원본 | 출처 |
|---|---|---|
| `floor.*` | Wood092 | ambientCG (https://ambientcg.com/view?id=Wood092) |
| `plank.*`, `plank2.jpg` | Wood094 | ambientCG (https://ambientcg.com/view?id=Wood094) |
| `beam.*`, `wood2.jpg` | Wood095 | ambientCG (https://ambientcg.com/view?id=Wood095) |
| `plaster.*`, `cream.jpg` | Plaster002 | ambientCG (https://ambientcg.com/view?id=Plaster002) |
| `stone.*`, `stone2.jpg` | Bricks102 | ambientCG (https://ambientcg.com/view?id=Bricks102) |
| `grass.*`, `grass2.jpg` | Ground037 | ambientCG (https://ambientcg.com/view?id=Ground037) |

원본은 2K JPG(Color·NormalGL·Roughness·AmbientOcclusion). 여기에는 색 1024 JPG(q92, 모델 팔레트 쪽으로 평균색을 옮김),
법선 WebP(OpenGL +Y, 마루·널빤지 1024, 나머지 512 — glb 용량), ORM 512 PNG(R=AO, G=거칠기, B=0) 로 줄여 넣었다. 변형 키(`plank2`·`wood2`·`cream`·`stone2`·`grass2`)는
색만 있고 법선·거칠기는 원본 키 것을 같이 쓴다(`textures.py` FAMILY).

아직 사진이 없는 키: `log`·`log2`(통나무), `shingle`·`shingle2`(지붕널) — 코드가 만든 절차 텍스처 그대로.
