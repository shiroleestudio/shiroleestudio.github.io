# 시로의 집 — 생성 텍스처 (build_house.py 가 부른다)
# 나뭇결·지붕널·회벽·돌·풀을 PIL 로 그려 glb 안에 WebP 로 넣는다. 손그림 텍스처가 생기면 이 파일 대신 그 그림을 쓴다.
# 모든 텍스처는 이음새 없이 반복되고, 1 타일 = 건물 1 m 다(UV 는 build_house.py 의 상자 투영).
import math
import random

from PIL import Image, ImageDraw, ImageFilter

SIZE = 512


def _hex(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def _mix(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def _shade(c, k):
    """k<1 어둡게, k>1 밝게 (채도는 그대로)."""
    return tuple(max(0, min(255, int(round(v * k)))) for v in c)


def _blotch(rng, amount=0.06, scale=48):
    """수채 번짐처럼 느린 얼룩: 작은 잡음을 키워 흐린다. -amount..+amount 의 밝기 배율 이미지."""
    small = Image.effect_noise((SIZE // scale * 2, SIZE // scale * 2), 60).resize((SIZE, SIZE), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(scale / 3))
    return small, amount


def _apply_blotch(img, rng, amount=0.06, scale=48):
    noise, amt = _blotch(rng, amount, scale)
    px = img.load(); npx = noise.load()
    for y in range(SIZE):
        for x in range(SIZE):
            k = 1 + (npx[x, y] - 128) / 128 * amt
            px[x, y] = _shade(px[x, y], k)
    return img


def _tile_blur(img, r):
    """이음새가 남지 않게 3x3 으로 깔고 흐린 뒤 가운데를 잘라 낸다."""
    big = Image.new('RGB', (SIZE * 3, SIZE * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * SIZE, j * SIZE))
    big = big.filter(ImageFilter.GaussianBlur(r))
    return big.crop((SIZE, SIZE, SIZE * 2, SIZE * 2))


def wood(base, boards=5, vertical=False, knots=True, seed=1):
    """널빤지: 결은 가로(u 방향). vertical 이면 세로."""
    rng = random.Random(seed)
    c = _hex(base)
    img = Image.new('RGB', (SIZE, SIZE), c)
    d = ImageDraw.Draw(img)
    bh = SIZE / boards
    for b in range(boards):
        y0 = int(b * bh)
        tone = _shade(c, rng.uniform(0.88, 1.12))
        d.rectangle((0, y0, SIZE, y0 + bh), fill=tone)
        # 결: 얇고 긴 물결선
        for _ in range(int(bh / 9)):
            yy = y0 + rng.uniform(2, bh - 2)
            amp = rng.uniform(1.0, 4.0); ph = rng.uniform(0, 6.28)
            col = _shade(tone, rng.uniform(0.74, 0.9))
            pts = [(x, yy + amp * math.sin(x / SIZE * 2 * math.pi * rng.choice([1, 2]) + ph)) for x in range(0, SIZE + 1, 8)]
            d.line(pts, fill=col, width=rng.choice([1, 2, 2, 3]))
        # 옹이
        if knots and rng.random() < 0.7:
            kx, ky = rng.uniform(0, SIZE), y0 + bh * rng.uniform(0.3, 0.7)
            for r in range(10, 2, -2):
                d.ellipse((kx - r * 1.6, ky - r, kx + r * 1.6, ky + r), outline=_shade(tone, 0.7 + r * 0.02), width=2)
        # 널 사이 틈
        d.line((0, y0, SIZE, y0), fill=_shade(tone, 0.62), width=3)
    img = _tile_blur(img, 0.5)
    img = _apply_blotch(img, rng, 0.1, 40)
    if vertical:
        img = img.rotate(90)
    return img


def logs(base, rows=3, seed=2):
    """통나무 옆면: 결만 (둥근 모양은 모델이 낸다). 가로 결에 약간의 어두운 띠."""
    img = wood(base, boards=rows, knots=True, seed=seed)
    return img


def shingles(base, rows=6, seed=3):
    """지붕널: 가로 줄마다 엇갈린 널, 아래 가장자리가 어둡다."""
    rng = random.Random(seed)
    c = _hex(base)
    img = Image.new('RGB', (SIZE, SIZE), c)
    d = ImageDraw.Draw(img)
    rh = SIZE / rows
    w = SIZE / 4
    for r in range(rows):
        y0 = r * rh
        off = (w / 2) if r % 2 else 0
        for i in range(-1, 5):
            x0 = i * w + off + rng.uniform(-3, 3)
            tone = _shade(c, rng.uniform(0.85, 1.15))
            d.rectangle((x0 + 2, y0, x0 + w - 2, y0 + rh), fill=tone)
            d.line((x0 + 2, y0 + rh - 2, x0 + w - 2, y0 + rh - 2), fill=_shade(tone, 0.6), width=5)
    img = _tile_blur(img, 0.8)
    return _apply_blotch(img, rng, 0.08, 36)


def plaster(base, seed=4):
    rng = random.Random(seed)
    img = Image.new('RGB', (SIZE, SIZE), _hex(base))
    d = ImageDraw.Draw(img)
    for _ in range(60):     # 붓 자국
        x, y = rng.uniform(0, SIZE), rng.uniform(0, SIZE)
        L, a = rng.uniform(40, 140), rng.uniform(-0.3, 0.3)
        col = _shade(_hex(base), rng.uniform(0.96, 1.03))
        d.line((x, y, x + L * math.cos(a), y + L * math.sin(a)), fill=col, width=int(rng.uniform(6, 18)))
    img = _tile_blur(img, 2.5)
    return _apply_blotch(img, rng, 0.05, 64)


def stone(base, seed=5):
    rng = random.Random(seed)
    c = _hex(base)
    img = Image.new('RGB', (SIZE, SIZE), _shade(c, 0.72))
    d = ImageDraw.Draw(img)
    rows, cols = 6, 4
    rh, cw = SIZE / rows, SIZE / cols
    for r in range(rows):
        off = cw / 2 if r % 2 else 0
        for i in range(-1, cols + 1):
            x0, y0 = i * cw + off, r * rh
            pad = rng.uniform(3, 6)
            d.rounded_rectangle((x0 + pad, y0 + pad, x0 + cw - pad, y0 + rh - pad), radius=int(rng.uniform(8, 20)),
                                fill=_shade(c, rng.uniform(0.85, 1.18)))
    img = _tile_blur(img, 1.0)
    return _apply_blotch(img, rng, 0.07, 32)


def grass(base, seed=6):
    rng = random.Random(seed)
    c = _hex(base)
    img = Image.new('RGB', (SIZE, SIZE), c)
    d = ImageDraw.Draw(img)
    for _ in range(2500):
        x, y = rng.uniform(0, SIZE), rng.uniform(0, SIZE)
        d.line((x, y, x + rng.uniform(-2, 2), y - rng.uniform(3, 8)), fill=_shade(c, rng.uniform(0.85, 1.15)), width=1)
    img = _tile_blur(img, 0.7)
    return _apply_blotch(img, rng, 0.08, 48)


# 재질 키 → (텍스처 함수, 타일/m, X·Y 벽면에서 u·v 를 바꿀지(세로 결))
RECIPES = {
    'log':     (lambda c: logs(c, 3, 2), 0.72, False),
    'log2':    (lambda c: logs(c, 3, 7), 0.72, False),
    'plank':   (lambda c: wood(c, 5, True, True, 11), 0.8, True),
    'plank2':  (lambda c: wood(c, 5, True, True, 12), 0.8, True),
    'floor':   (lambda c: wood(c, 4, False, True, 13), 0.6, False),
    'beam':    (lambda c: wood(c, 4, False, False, 14), 1.2, False),
    'wood2':   (lambda c: wood(c, 4, False, False, 15), 1.2, False),
    'plaster': (lambda c: plaster(c, 4), 0.5, False),
    'cream':   (lambda c: plaster(c, 8), 0.5, False),
    'shingle': (lambda c: shingles(c, 6, 3), 1.0, False),
    'shingle2': (lambda c: shingles(c, 6, 9), 1.0, False),
    'stone':   (lambda c: stone(c, 5), 1.0, False),
    'stone2':  (lambda c: stone(c, 10), 1.0, False),
    'grass':   (lambda c: grass(c, 6), 0.7, False),
    'grass2':  (lambda c: grass(c, 16), 0.7, False),
}


def make_all(colors, out_dir):
    """colors: 키→'#rrggbb'. out_dir 에 <키>.png 를 쓰고 {키: (경로, 타일/m, 세로결)} 을 돌려준다."""
    import os
    out = {}
    for key, (fn, tiles, swap) in RECIPES.items():
        if key not in colors:
            continue
        path = os.path.join(out_dir, key + '.png')
        fn(colors[key]).save(path)
        out[key] = (path, tiles, swap)
    return out


if __name__ == '__main__':
    import sys
    sys.path.insert(0, '.')
    cols = {'log': '#8a6a4c', 'plank': '#9b7a58', 'floor': '#a8845e', 'plaster': '#e9e2d0', 'shingle': '#5a4636',
            'stone': '#8b877e', 'grass': '#9aa47a', 'beam': '#5e4633'}
    print(make_all(cols, sys.argv[1] if len(sys.argv) > 1 else '.'))
