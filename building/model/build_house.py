# 시로의 집 — Blender 모델 생성 스크립트 (Blender 5.0, bpy)
# 콘셉트: /mnt/project-files/hub/concept/ (두호 2026-10-26, 나노바나나 초안)
# 실행:  python build_house.py <out.glb>      (pip 의 bpy 모듈, Blender 5.x) 또는
#        blender -b -P build_house.py -- <out.glb>
# 좌표: Blender X=가로(오른쪽 +), Y=깊이(정면 -Y), Z=위. glTF 로 내보내면 three.js 에서 정면이 +Z.
#
# 사이트가 읽는 약속 (building.js):
#  - 노드 extras: floor(1·2·3, 0=땅, -1=지하실), cut('S','N','E','W' = 카메라가 그쪽에 있으면 걷어낼 면).
#  - 빈 객체 anchor_<id>: 방 라벨이 붙는 자리.
#  - 재질 이름 glow*: 불 켜진 창·전구 (조명 없이 그 색 그대로).
# 캐릭터(시로·카피바라씨·코알라씨)는 넣지 않는다. TODO(character-sheet).
import math
import random
import sys

import bpy  # bpy 를 먼저 (pip bpy 모듈에서는 bmesh 가 bpy 뒤에 생긴다)
import bmesh
from mathutils import Matrix, Vector

# 시작 장면(기본 상자·카메라·조명)을 비운다
for _o in list(bpy.data.objects):
    bpy.data.objects.remove(_o, do_unlink=True)

# ---------------------------------------------------------------- 색 (사이트 팔레트 + 나무 계열)
COL = {
    'log': '#8a6a4c', 'log2': '#76583e', 'plank': '#9b7a58', 'plank2': '#8a6b4c',
    'floor': '#a8845e', 'beam': '#5e4633', 'wood2': '#4e3b2d', 'dark': '#33251c',
    'plaster': '#e9e2d0', 'paper': '#e2dbc8', 'rule': '#bfb39b', 'ink': '#3a2c22',
    'shingle': '#5a4636', 'shingle2': '#4c3a2c', 'stone': '#8b877e', 'stone2': '#77736b',
    'grass': '#9aa47a', 'grass2': '#8a9568', 'green': '#4a5e4f', 'sage': '#7f9378',
    'leaf': '#6f7f5c', 'pot': '#b07a5c', 'brass': '#a88a55', 'night': '#2b3240',
    'door': '#2f3640', 'rug': '#b89a7a', 'red': '#a85a48', 'cream': '#ece4d2',
    'blanket': '#8d98a0', 'jar': '#cfc8b4', 'coffee': '#5b4130',
    'glow': '#f0d394', 'glowbulb': '#f6e2b0',
}

def srgb_to_lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

MATS = {}
def mat(key):
    if key in MATS:
        return MATS[key]
    h = COL[key].lstrip('#')
    rgb = [srgb_to_lin(int(h[i:i + 2], 16)) for i in (0, 2, 4)]
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 1.0
    m.diffuse_color = (*rgb, 1)
    MATS[key] = m
    return m

# ---------------------------------------------------------------- 그룹 (나중에 하나의 메시로 합침)
GROUPS = {}   # name -> {'objs': [], 'props': {}}
def group(name, floor, cut=None):
    if name not in GROUPS:
        GROUPS[name] = {'objs': [], 'props': {'floor': floor, **({'cut': cut} if cut else {})}}
    return name

def _obj_from_bm(bm, name, matkey, grp, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    me.materials.append(mat(matkey))
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    GROUPS[grp]['objs'].append(ob)
    return ob

def box(grp, matkey, center, size, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(Vector(center)) @ _rot(rot) @ Matrix.Diagonal((*size, 1))
    bm.transform(M)
    return _obj_from_bm(bm, 'box', matkey, grp)

def cyl(grp, matkey, center, r, h, axis='Z', seg=10, r2=None, rot=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=h)
    R = _rot(rot) if rot else {'Z': Matrix(), 'X': Matrix.Rotation(math.pi / 2, 4, 'Y'),
                               'Y': Matrix.Rotation(math.pi / 2, 4, 'X')}[axis]
    bm.transform(Matrix.Translation(Vector(center)) @ R)
    return _obj_from_bm(bm, 'cyl', matkey, grp, smooth)

def sphere(grp, matkey, center, r, seg=12, scale=(1, 1, 1), half=False):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    if half:
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS')
    bm.transform(Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*scale, 1)))
    return _obj_from_bm(bm, 'sph', matkey, grp, True)

def prism(grp, matkey, pts2d, y0, y1, plane='XZ'):
    """평면 다각형(x,z) 을 y0..y1 로 뽑은 기둥 (박공 삼각형 등)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts2d]
    b = [bm.verts.new((x, y1, z)) for x, z in pts2d]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(pts2d)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj_from_bm(bm, 'prism', matkey, grp)

def slab(grp, matkey, center, size, holes=()):
    """납작한 판(center·size 는 box 와 같다)에서 사각 구멍 holes=[(x0,x1,y0,y1)] 을 뺀 조각들."""
    cx, cy, cz = center; sx, sy, sz = size
    xs = sorted({cx - sx / 2, cx + sx / 2, *[h[0] for h in holes], *[h[1] for h in holes]})
    ys = sorted({cy - sy / 2, cy + sy / 2, *[h[2] for h in holes], *[h[3] for h in holes]})
    xs = [x for x in xs if cx - sx / 2 <= x <= cx + sx / 2]
    ys = [y for y in ys if cy - sy / 2 <= y <= cy + sy / 2]
    for x0, x1 in zip(xs, xs[1:]):
        for y0, y1 in zip(ys, ys[1:]):
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            if any(h[0] < mx < h[1] and h[2] < my < h[3] for h in holes):
                continue
            if x1 - x0 < 0.01 or y1 - y0 < 0.01:
                continue
            box(grp, matkey, (mx, my, cz), (x1 - x0, y1 - y0, sz))

def stairs(grp, matkeys, x0, x1, ya, yb, z0, z1, n, base=None, thin=False):
    """y 방향 직선 계단: ya(아래) 에서 yb(위) 로 n 단. 기본은 디딤판에서 base(=z0) 까지 꽉 찬 상자(옆이 막힌 계단).
    thin 이면 디딤판·챌판만 두고 아래를 비운다 (아래에 다른 계단이 지나가는 2층→3층 계단)."""
    base = z0 if base is None else base
    for k in range(n):
        t0, t1 = k / n, (k + 1) / n
        yy0, yy1 = ya + (yb - ya) * t0, ya + (yb - ya) * t1
        top = z0 + (z1 - z0) * t1
        if thin:
            rise = (z1 - z0) / n
            box(grp, matkeys[k % len(matkeys)], ((x0 + x1) / 2, (yy0 + yy1) / 2, top - 0.03), (x1 - x0, abs(yy1 - yy0) + 0.004, 0.06))   # 디딤판
            box(grp, 'wood2', ((x0 + x1) / 2, yy0 + 0.02, top - rise / 2), (x1 - x0, 0.04, rise))                                   # 챌판
        else:
            box(grp, matkeys[k % len(matkeys)], ((x0 + x1) / 2, (yy0 + yy1) / 2, (base + top) / 2), (x1 - x0, abs(yy1 - yy0) + 0.004, top - base))
    if thin:   # 양옆 옆판(계단 옆 널)
        L = math.hypot(yb - ya, z1 - z0)
        for xx in (x0 + 0.03, x1 - 0.03):
            box(grp, 'wood2', (xx, (ya + yb) / 2, (z0 + z1) / 2 - 0.12), (0.05, L, 0.3), rot=(-math.atan2(z1 - z0, yb - ya), 0, 0))

def _rot(r):
    if r is None:
        return Matrix()
    return (Matrix.Rotation(r[2], 4, 'Z') @ Matrix.Rotation(r[1], 4, 'Y') @ Matrix.Rotation(r[0], 4, 'X'))

ANCHORS = []
def anchor(name, loc):
    e = bpy.data.objects.new('anchor_' + name, None)
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    ANCHORS.append(e)

# ---------------------------------------------------------------- 치수
W, D = 6.0, 5.0              # 가로 · 깊이
T = 0.26                     # 벽 두께 (통나무 지름)
H1 = 2.64                    # 1층 (통나무 11단)
BAND = 0.26                  # 층 사이 띠보
Z2 = H1 + BAND               # 2층 바닥 2.90
H2 = 2.5
Z3 = Z2 + H2 + 0.2           # 3층(다락·루프탑) 바닥 5.60
XA, XB = -0.6, W / 2         # 다락(박공지붕)이 덮는 가로 구간, 그 왼쪽은 루프탑
KNEE = 0.5                   # 다락 무릎벽
RIDGE = 2.2                  # 무릎벽 위 지붕 높이
XR = (XA + XB) / 2           # 용마루 x

# 벽 지역 좌표 (u: 벽을 따라, v: 위로, n: 바깥쪽 +) → 세계 좌표
def wpos(side, u, v, n):
    c = T / 2
    if side == 'S': return (u, -D / 2 + c - n, v)
    if side == 'N': return (u, D / 2 - c + n, v)
    if side == 'E': return (W / 2 - c + n, u, v)
    if side == 'W': return (-W / 2 + c - n, u, v)

def wsize(side, lu, lv, ln):
    return (lu, ln, lv) if side in 'SN' else (ln, lu, lv)

def wbox(grp, matkey, side, u, v, n, lu, lv, ln):
    return box(grp, matkey, wpos(side, u, v, n), wsize(side, lu, lv, ln))

def wlen(side):
    return W if side in 'SN' else D

def subtract(span, holes):
    """1차원 구간 span 에서 holes 를 뺀 조각들."""
    segs = [span]
    for h0, h1 in holes:
        out = []
        for s0, s1 in segs:
            if h1 <= s0 or h0 >= s1:
                out.append((s0, s1)); continue
            if h0 > s0: out.append((s0, h0))
            if h1 < s1: out.append((h1, s1))
        segs = out
    return [s for s in segs if s[1] - s[0] > 0.04]

def rect_minus(grp, matkey, side, u_span, v_span, n, ln, openings):
    """벽면 사각형에서 창·문 구멍을 뺀 판 (안쪽 회벽 등)."""
    cuts = sorted({u_span[0], u_span[1], *[o[0] for o in openings], *[o[1] for o in openings]})
    cuts = [c for c in cuts if u_span[0] <= c <= u_span[1]]
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        holes = [(o[2], o[3]) for o in openings if o[0] < mid < o[1]]
        for v0, v1 in subtract(v_span, holes):
            wbox(grp, matkey, side, mid, (v0 + v1) / 2, n, b - a, v1 - v0, ln)

def window(grp, side, u0, u1, v0, v1, cross=True, n=0.0, glow='glow'):
    fw, fd = 0.09, T + 0.08
    wbox(grp, 'wood2', side, (u0 + u1) / 2, v0 - fw / 2, n, u1 - u0 + 2 * fw, fw, fd + 0.04)   # 창턱
    wbox(grp, 'wood2', side, (u0 + u1) / 2, v1 + fw / 2, n, u1 - u0 + 2 * fw, fw, fd)
    wbox(grp, 'wood2', side, u0 - fw / 2, (v0 + v1) / 2, n, fw, v1 - v0, fd)
    wbox(grp, 'wood2', side, u1 + fw / 2, (v0 + v1) / 2, n, fw, v1 - v0, fd)
    wbox(grp, glow, side, (u0 + u1) / 2, (v0 + v1) / 2, n - 0.02, u1 - u0, v1 - v0, 0.03)
    if cross:
        wbox(grp, 'wood2', side, (u0 + u1) / 2, (v0 + v1) / 2, n + 0.01, 0.05, v1 - v0, 0.06)
        nrow = 2 if v1 - v0 > 0.9 else 1
        for k in range(1, nrow + 1):
            wbox(grp, 'wood2', side, (u0 + u1) / 2, v0 + (v1 - v0) * k / (nrow + 1), n + 0.01, u1 - u0, 0.05, 0.06)

# ---------------------------------------------------------------- 1층: 통나무 벽
OPEN1 = {
    'S': [(-2.3, -0.5, 0.75, 1.95, 'win'), (0.35, 1.25, 0.0, 2.1, 'door')],
    'N': [(-0.8, 0.0, 1.0, 1.8, 'win')],
    'E': [(-1.4, -0.6, 1.0, 1.8, 'win'), (0.7, 1.5, 1.0, 1.8, 'win')],
    'W': [(-0.4, 0.4, 1.0, 1.8, 'win')],
}
for side in 'SNEW':
    g = group(f'f1_wall_{side}', 1, side)
    L = wlen(side)
    ops = OPEN1[side]
    rows = 11
    for k in range(rows):
        v = 0.12 + k * 0.24
        holes = [(o[0], o[1]) for o in ops if o[2] - 0.1 < v < o[3] + 0.1]
        ext = 0.18 if (k % 2 == (0 if side in 'SN' else 1)) else 0.02    # 모서리에서 엇갈려 튀어나온 통나무 끝
        for s0, s1 in subtract((-L / 2 - ext, L / 2 + ext), holes):
            c = wpos(side, (s0 + s1) / 2, v, 0)
            cyl(g, 'log' if k % 3 else 'log2', c, 0.128, s1 - s0, axis='X' if side in 'SN' else 'Y', seg=8)
    rect_minus(g, 'plaster', side, (-L / 2 + T, L / 2 - T), (0.06, H1), -T / 2 - 0.02, 0.04, ops)
    for o in ops:
        if o[4] == 'win':
            window(g, side, o[0], o[1], o[2], o[3])
        else:   # 문
            u0, u1, v0, v1 = o[:4]
            # 문짝은 따로 둔다('door' 노드): 1인칭으로 다가가면 사이트가 경첩(u1 쪽 모서리)을 축으로 안쪽으로 연다
            gDoor = group('door', 1)
            DOOR_HINGE = wpos(side, u1, 0.0, 0.0)
            wbox(gDoor, 'door', side, (u0 + u1) / 2, (v0 + v1) / 2, 0.0, u1 - u0, v1 - v0, 0.1)
            for uu in (u0 - 0.05, u1 + 0.05):
                wbox(g, 'wood2', side, uu, (v0 + v1) / 2, 0.02, 0.1, v1 - v0, T + 0.1)
            wbox(g, 'wood2', side, (u0 + u1) / 2, v1 + 0.05, 0.02, u1 - u0 + 0.2, 0.1, T + 0.1)
            wbox(gDoor, 'paper', side, (u0 + u1) / 2, 1.55, 0.1, 0.42, 0.2, 0.03)   # 문패 — 문짝 노드에 붙여 문과 함께 돈다 (벽에 두면 문이 열릴 때 공중에 남는다)
            cyl(gDoor, 'brass', wpos(side, u0 + 0.16, 1.0, 0.09), 0.04, 0.08, axis='Y' if side in 'SN' else 'X', seg=8)

# 띠보 (층 사이) — 앞뒤 면에 붙여 같이 걷힌다
for side in 'SNEW':
    g = f'f1_wall_{side}'
    wbox(g, 'beam', side, 0, H1 + BAND / 2, 0.04, wlen(side) + 0.3, BAND, T + 0.08)

# 모서리 기둥 (앞·뒤 벽에 속함)
for sx in (-1, 1):
    for sy, side in ((-1, 'S'), (1, 'N')):
        x, y = sx * (W / 2 - 0.06), sy * (D / 2 - 0.06)
        cyl(f'f1_wall_{side}', 'log2', (x, y, (H1 + BAND) / 2), 0.17, H1 + BAND, seg=10)
        cyl(group(f'f2_wall_{side}', 2, side), 'log2', (x, y, Z2 + H2 / 2 + 0.1), 0.15, H2 + 0.2, seg=10)

# ---------------------------------------------------------------- 2층: 세로 널빤지 벽
OPEN2 = {
    'S': [(-2.25, -1.45, 0.55, 1.95, 'win'), (-0.95, 0.35, 0.55, 2.05, 'win'), (0.85, 1.65, 0.55, 1.95, 'win')],
    'N': [(1.2, 2.0, 0.7, 1.8, 'win')],
    'E': [(-1.6, -0.8, 0.55, 1.95, 'win'), (0.2, 1.0, 0.55, 1.95, 'win'), (1.4, 2.0, 0.7, 1.7, 'win')],
    'W': [(-0.5, 0.5, 0.7, 1.8, 'win')],
}
for side in 'SNEW':
    g = group(f'f2_wall_{side}', 2, side)
    L = wlen(side)
    ops = [(a, b, Z2 + c, Z2 + d, k) for a, b, c, d, k in OPEN2[side]]
    pw = 0.3
    n_pl = int(L / pw)
    for i in range(n_pl):
        u0 = -L / 2 + i * pw
        u1 = u0 + pw - 0.015
        mid = (u0 + u1) / 2
        holes = [(o[2], o[3]) for o in ops if o[0] - 0.02 < mid < o[1] + 0.02]
        for v0, v1 in subtract((Z2, Z2 + H2 + 0.2), holes):
            wbox(g, 'plank' if i % 3 else 'plank2', side, mid, (v0 + v1) / 2, 0.03, u1 - u0, v1 - v0, 0.07)
    rect_minus(g, 'plaster', side, (-L / 2 + T, L / 2 - T), (Z2, Z2 + H2 + 0.2), -T / 2 - 0.02, 0.04, ops)
    for o in ops:
        window(g, side, o[0], o[1], o[2], o[3])
    wbox(g, 'beam', side, 0, Z3 - 0.1, 0.06, L + 0.3, 0.2, T + 0.1)       # 처마 띠보

# 베이크 전용 가림막(라이트맵, 2026-11-24): 8각 통나무·널빤지 틈으로 Cycles 빛이 새어 안쪽 벽에 줄무늬가 생기므로 벽 두께를 채우는 판을 두고,
# 굽고 나면 내보내기 전에 지운다(glb 에 안 들어간다). 창·문 구멍은 그대로 둔다.
gBake = group('bake_occluder', 1)
for side in 'SNEW':
    L = wlen(side)
    rect_minus(gBake, 'plaster', side, (-L / 2, L / 2), (0.0, H1), 0.0, T * 0.8, OPEN1[side])
    ops2 = [(a, b, Z2 + c, Z2 + d, k) for a, b, c, d, k in OPEN2[side]]
    rect_minus(gBake, 'plaster', side, (-L / 2, L / 2), (Z2, Z2 + H2 + 0.2), 0.0, T * 0.8, ops2)

# ---------------------------------------------------------------- 바닥판
gf1 = group('f1_floor', 1)
box(gf1, 'floor', (0, 0, 0.04), (W - 0.1, D - 0.1, 0.08))
# 계단(1인칭 걷기용, 2026-11-23): 서쪽 벽을 따라 남→북으로 오르는 직선 계단 둘. 1층→2층은 찻집 왼쪽 벽, 2층→3층은 그 바로 위, 루프탑 데크로 나온다.
# 위층 바닥에는 계단 머리 위 구멍(STAIR_HOLE). building.js 의 발높이(surfaces)·충돌 수치가 이 좌표와 같아야 한다.
SX0, SX1 = -2.85, -2.0                 # 계단 폭 (x)
ST12 = (-0.6, 2.28, 0.08, Z2, 12)      # (아래 y, 위 y, 아래 z, 위 z, 단 수)
ST23 = (-0.6, 2.1, Z2, Z3, 12)
HOLE12 = (SX0 - 0.05, SX1 + 0.05, 0.25, ST12[1])   # 2층 바닥 구멍 (1층 계단 머리 위)
HOLE23 = (SX0 - 0.05, SX1 + 0.05, 0.3, ST23[1])    # 3층 바닥 구멍
gf2 = group('f2_floor', 2)
slab(gf2, 'beam', (0, 0, H1 + BAND / 2), (W - 0.2, D - 0.2, BAND - 0.02), [HOLE12])
slab(gf2, 'floor', (0, 0, Z2 - 0.02), (W - 0.3, D - 0.3, 0.04), [HOLE12])
gf3 = group('f3_floor', 3)
slab(gf3, 'beam', (0, 0, Z3 - 0.12), (W - 0.2, D - 0.2, 0.2), [HOLE23])
slab(gf3, 'floor', (0, 0, Z3 - 0.02), (W - 0.3, D - 0.3, 0.04), [HOLE23])
for i in range(int((XA + W / 2) / 0.3)):        # 루프탑 데크 널 (계단 구멍 자리는 비운다)
    x = -W / 2 + 0.15 + i * 0.3
    slab(gf3, 'plank' if i % 2 else 'plank2', (x, 0, Z3 + 0.015), (0.27, D - 0.3, 0.03), [HOLE23])
gS1 = group('f1_stairs', 1)
stairs(gS1, ['plank', 'plank2'], SX0, SX1, *ST12)
gS2 = group('f2_stairs', 2)
stairs(gS2, ['plank', 'plank2'], SX0, SX1, *ST23, thin=True)   # 아래로 1층 계단이 지나가 머리 공간을 비운다
# 난간: 계단 안쪽(x = SX1) 에 기둥 셋 + 비스듬한 손잡이
for g, (ya, yb, za, zb, n) in ((gS1, ST12), (gS2, ST23)):
    for t in (0.08, 0.5, 0.92):
        y = ya + (yb - ya) * t; z = za + (zb - za) * t
        box(g, 'wood2', (SX1 + 0.04, y, z + 0.45), (0.06, 0.06, 0.9))
    L = math.hypot(yb - ya, zb - za)
    box(g, 'beam', (SX1 + 0.04, (ya + yb) / 2, (za + zb) / 2 + 0.9), (0.07, L * 0.9, 0.07), rot=(-math.atan2(zb - za, yb - ya), 0, 0))
# 2층 계단 구멍 동쪽 난간 (1층 계단 머리 둘레)
for t in (0.0, 0.5, 1.0):
    y = HOLE12[2] + (1.6 - HOLE12[2]) * t
    box(gS2, 'wood2', (SX1 + 0.1, y, Z2 + 0.42), (0.06, 0.06, 0.84))
box(gS2, 'beam', (SX1 + 0.1, (HOLE12[2] + 1.6) / 2, Z2 + 0.84), (0.08, 1.6 - HOLE12[2] + 0.1, 0.07))
box(gS2, 'beam', (SX1 + 0.1, (HOLE12[2] + 1.6) / 2, Z2 + 0.4), (0.05, 1.6 - HOLE12[2], 0.05))
# 루프탑 계단 머리 난간 (데크 위, 구멍 둘레 ㄷ자)
RAIL_LATER = [((SX1 + 0.12, HOLE23[2]), (SX1 + 0.12, 1.6)), ((SX0, HOLE23[2] - 0.02), (SX1 + 0.12, HOLE23[2] - 0.02))]   # 계단 머리 난간: 동쪽은 위쪽 끝을 터 둔다(그리로 나온다)

# ---------------------------------------------------------------- 땅
# 집 둘레의 동네 터 — 게임의 한 장면처럼 보이게 (두호 2026-11-18: 심즈·남코뮤지엄 느낌의 배경).
# 넓은 잔디, 문에서 터 끝까지 가는 돌길, 말뚝 울타리, 나무, 가로등, 우편함, 뒤편 언덕. 전부 floor 0 (전체·1층 보기에서만).
LOT_W, LOT_D = 18.0, 15.0
g0 = group('ground', 0)
# 지하실(2026-11-23): 집 발자국 아래 돌방. 바깥 서쪽 벽 옆 돌계단 구덩이(TRENCH)로 내려가 서쪽 벽 문으로 든다 (찻집 안을 비우지 않아도 된다).
BZ = -4.2                                   # 지하실 바닥 z (2026-11-25 두호 '지하실 높이를 높이고' — 2.6 → 4.2 m 높이 돌방, 블랙홀이 꽉 차게)
HOLE_HOUSE = (-W / 2 - 0.06, W / 2 + 0.06, -D / 2 - 0.06, D / 2 + 0.06)
TRX0, TRX1 = -3.95, -W / 2 - 0.06           # 구덩이 x (집 벽 바로 바깥)
TRY0, TRY1 = -2.6, 2.5                      # 구덩이 y: 북쪽 끝(2.5, 땅높이)에서 남쪽으로 내려간다 (4.2 m 를 18단, 약 46°)
CELLAR_DOOR = (-2.3, -1.5)                  # 서쪽 벽 문 (y)
slab(g0, 'grass', (0, 0, -0.1), (LOT_W, LOT_D, 0.2), [HOLE_HOUSE, (TRX0, TRX1, TRY0, TRY1)])
gB = group('basement', -1)
BIX, BIY = W / 2 - 0.3, D / 2 - 0.3         # 안쪽 반 치수
box(gB, 'stone2', (0, 0, BZ - 0.05), (W + 0.12, D + 0.12, 0.1))                                  # 바닥
for sgn in (-1, 1):                                                                              # 남·북 벽
    box(gB, 'stone', (0, sgn * (BIY + 0.18), (BZ - 0.03) / 2), (W + 0.12, 0.36, -BZ - 0.03))
box(gB, 'stone', (BIX + 0.18, 0, (BZ - 0.03) / 2), (0.36, D + 0.12, -BZ - 0.03))                 # 동벽
for y0, y1 in subtract((-D / 2 - 0.06, D / 2 + 0.06), [CELLAR_DOOR]):                           # 서벽 (문 구멍)
    box(gB, 'stone', (-BIX - 0.18, (y0 + y1) / 2, (BZ - 0.03) / 2), (0.36, y1 - y0, -BZ - 0.03))
box(gB, 'stone', (-BIX - 0.18, sum(CELLAR_DOOR) / 2, (BZ + 2.2 - 0.05) / 2), (0.36, CELLAR_DOOR[1] - CELLAR_DOOR[0], -0.05 - (BZ + 2.2)))   # 문 위 벽(문 높이 2.2 m)
box(gB, 'plank2', (2.0, -1.5, BZ + 0.25), (0.6, 0.6, 0.5))                                       # 상자 하나
# 블랙홀멍(두호 2026-11-23): 방 한가운데 캠프파이어처럼 블랙홀이 뜬다 — 사이트가 셰이더로 그린다(blackhole.js). 방을 거의 채우는 크기(원반 반지름 1.9 m, 2026-11-25)라
# 기둥·등은 없고, 긴 의자 둘은 남·북 벽에 붙여 가운데를 본다. 자리는 building.js OBST.B 와 같다.
for yb in (-1.95, 1.95):
    box(gB, 'plank2', (0, yb, BZ + 0.42), (1.8, 0.42, 0.06))
    for x in (-0.78, 0.78):
        box(gB, 'beam', (x, yb, BZ + 0.2), (0.08, 0.36, 0.4))
anchor('cellar', (0.0, 1.2, BZ + 1.4))
# 구덩이: 돌계단(북→남으로 내려감) + 바닥 + 서쪽·남쪽 옹벽(땅 위 0.5 m 난간)
gC0 = group('cellar_stairs', 0)
stairs(gC0, ['stone', 'stone2'], TRX0 + 0.08, TRX1, TRY1, CELLAR_DOOR[1] + 0.0, 0.0, BZ, 18, base=BZ - 0.1)   # 역방향: 북(땅)→남(바닥)
box(gC0, 'stone2', ((TRX0 + 0.08 + TRX1) / 2, (TRY0 + CELLAR_DOOR[1]) / 2, BZ - 0.05), (TRX1 - TRX0 - 0.08, CELLAR_DOOR[1] - TRY0, 0.1))
box(gC0, 'stone', (TRX0 - 0.06, (TRY0 + TRY1) / 2, (BZ - 0.1 + 0.5) / 2), (0.2, TRY1 - TRY0 + 0.3, 0.6 - BZ))
box(gC0, 'stone', ((TRX0 + TRX1) / 2 - 0.06, TRY0 - 0.08, (BZ - 0.1 + 0.5) / 2), (TRX1 - TRX0 + 0.3, 0.2, 0.6 - BZ))
box(g0, 'grass2', (0, -D / 2 - 0.9, -0.005), (1.2, 1.4, 0.02))           # 문 앞 흙길 자국
box(g0, 'stone2', (0, 0, 0.0), (W + 0.12, D + 0.12, 0.06))                # 주춧돌 띠
# 돌길: 문(x≈0.8) 앞에서 남쪽 터 끝까지, 납작한 돌을 엇갈려
_rng = random.Random(3)
for i in range(16):
    yy = -D / 2 - 1.0 - i * 0.42
    if yy < -LOT_D / 2 + 0.3:
        break
    for j, xx in enumerate((0.55, 1.05)):
        box(g0, 'stone' if (i + j) % 2 else 'stone2', (xx + _rng.uniform(-0.05, 0.05), yy, 0.01), (0.42, 0.34, 0.04), rot=(0, 0, _rng.uniform(-0.15, 0.15)))
# 뒤편 언덕 (북쪽, 멀리): 납작한 반구 셋
for (hx, hy, hs, hz) in [(-5.0, LOT_D / 2 + 5.5, 7.0, 1.6), (4.5, LOT_D / 2 + 6.5, 8.0, 2.0), (11.0, LOT_D / 2 + 3.0, 5.0, 1.2)]:
    sphere(g0, 'grass2', (hx, hy, -0.1), hs, seg=16, scale=(1, 0.55, hz / hs), half=True)

# ---------------------------------------------------------------- 3층: 다락(박공지붕) + 루프탑 + 돔
AW = XB - XA
ZK = Z3 + KNEE
def roof_z(x):
    return ZK + RIDGE * (1 - abs(x - XR) / (AW / 2))

# 무릎벽 (동·서) — 동쪽은 바깥벽 위, 서쪽은 루프탑과의 경계
gE = group('f3_roof_E', 3, 'E')
gW = group('f3_roof_W', 3, 'W')
# 다락 출입구(2026-11-24, 집 리모델링): 데크에서 서쪽 지붕면에 낸 셰드 도머(평지붕 돌출부) 로 걸어 들어간다.
# y 구간 YD0..YD1, x 는 데크 가장자리(XA) 에서 XD 까지. 그 안쪽은 지붕이 높아(용마루 2.7 m) 그냥 선다. building.js 의 3층 걷기 범위와 같아야 한다.
YD0, YD1, XD, HD = -1.05, 0.05, 0.72, Z3 + 2.1          # 도머 y 구간, 안쪽 끝 x, 도머 천장 높이
for i in range(int(D / 0.3)):
    y = -D / 2 + 0.15 + i * 0.3
    box(gE, 'plank' if i % 3 else 'plank2', (XB - 0.1, y, Z3 + KNEE / 2), (0.07, 0.28, KNEE))
    if not (YD0 < y < YD1):
        box(gW, 'plank' if i % 3 else 'plank2', (XA + 0.1, y, Z3 + KNEE / 2), (0.07, 0.28, KNEE))
box(gE, 'plaster', (XB - 0.17, 0, Z3 + KNEE / 2), (0.04, D - 0.3, KNEE))
for y0_, y1_ in ((-D / 2 + 0.15, YD0), (YD1, D / 2 - 0.15)):
    box(gW, 'plaster', (XA + 0.17, (y0_ + y1_) / 2, Z3 + KNEE / 2), (0.04, y1_ - y0_, KNEE))

# 지붕 경사판 + 지붕널
ang = math.atan2(RIDGE, AW / 2)
slope_len = math.hypot(RIDGE, AW / 2) + 0.45
def slope_box(g, mk, sgn, cx, cz, t0, t1, y0, y1, lift, thick, pad=0.0):
    """경사면 위의 판 한 조각: 경사 방향 구간 t0..t1(-0.5..0.5, 경사 길이 비율), y 구간, 면에서 lift 만큼 띄움"""
    tm = (t0 + t1) / 2
    off = Vector((sgn * math.cos(ang), 0, -math.sin(ang))) * (tm * slope_len)
    up = Vector((sgn * math.sin(ang), 0, math.cos(ang))) * lift
    p = Vector((cx, (y0 + y1) / 2, cz)) + off + up
    box(g, mk, tuple(p), ((t1 - t0) * slope_len + pad, y1 - y0, thick), rot=(0, sgn * ang, 0))

for side, g, sgn in (('E', gE, 1), ('W', gW, -1)):
    cx = XR + sgn * (AW / 4) + sgn * 0.12
    cz = ZK + RIDGE / 2 - 0.08
    # 서쪽 경사면에서 도머가 차지하는 경사 구간: x < XD 인 부분 (t>0 이 처마 쪽)
    t_cut = (cx - XD) / (math.cos(ang) * slope_len) if side == 'W' else None      # 이 t 보다 처마 쪽은 도머 y 구간에서 비운다
    ybands = [(-D / 2 - 0.3, D / 2 + 0.3)] if side == 'E' else [(-D / 2 - 0.3, YD0), (YD1, D / 2 + 0.3)]
    # 경사판
    if side == 'E':
        slope_box(g, 'plank', sgn, cx, cz, -0.5, 0.5, -D / 2 - 0.3, D / 2 + 0.3, 0.0, 0.1)
    else:
        for y0_, y1_ in ybands:
            slope_box(g, 'plank', sgn, cx, cz, -0.5, 0.5, y0_, y1_, 0.0, 0.1)
        slope_box(g, 'plank', sgn, cx, cz, -0.5, t_cut, YD0, YD1, 0.0, 0.1)                 # 도머 위쪽(용마루 쪽)은 지붕 그대로
    rows = 10
    for k in range(rows):
        t0, t1 = k / rows - 0.5, (k + 1) / rows - 0.5
        mk = 'shingle' if k % 2 else 'shingle2'
        if side == 'E' or t1 <= t_cut:
            slope_box(g, mk, sgn, cx, cz, t0, t1, -D / 2 - 0.32, D / 2 + 0.32, 0.07, 0.05, pad=0.04)
        else:
            for y0_, y1_ in ybands:
                slope_box(g, mk, sgn, cx, cz, t0, t1, y0_ - 0.02, y1_ + 0.02, 0.07, 0.05, pad=0.04)
            if t0 < t_cut:
                slope_box(g, mk, sgn, cx, cz, t0, t_cut, YD0, YD1, 0.07, 0.05, pad=0.04)
    # 처마 밑 서까래 끝 (동쪽 처마는 바깥에서 보인다)
    if side == 'E':
        ex = cx + math.cos(ang) * slope_len * 0.5 - 0.25
        for i in range(int(D / 0.6) + 1):
            y = -D / 2 - 0.1 + i * 0.6
            box(g, 'wood2', (ex, y, cz - math.tan(ang) * (ex - cx) - 0.13), (0.5, 0.08, 0.12), rot=(0, ang, 0))   # 경사판 바로 밑
# 도머: 옆벽 둘(오각형), 평지붕 + 지붕널, 문틀 (문짝 없이 열린 입구)
gDm = group('f3_dormer', 3)
for yw in (YD0 - 0.04, YD1 + 0.04):
    prism(gDm, 'plank2', [(XA - 0.15, Z3), (XA - 0.15, HD), (XD, HD), (XD, roof_z(XD) - 0.1), (XA - 0.15, ZK - 0.08)], yw - 0.04, yw + 0.04)
    prism(gDm, 'plaster', [(XA - 0.1, Z3), (XA - 0.1, HD - 0.02), (XD - 0.02, HD - 0.02), (XD - 0.02, roof_z(XD) - 0.12), (XA - 0.1, ZK - 0.08)],
          yw - 0.04 + (0.06 if yw < 0 else -0.06), yw + 0.04 + (0.06 if yw < 0 else -0.06))
box(gDm, 'plank', ((XA - 0.3 + XD + 0.05) / 2, (YD0 + YD1) / 2, HD + 0.06), (XD + 0.05 - (XA - 0.3), YD1 - YD0 + 0.3, 0.12))
box(gDm, 'shingle', ((XA - 0.3 + XD + 0.05) / 2, (YD0 + YD1) / 2, HD + 0.15), (XD + 0.05 - (XA - 0.3) + 0.04, YD1 - YD0 + 0.34, 0.06))
box(gDm, 'wood2', (XA - 0.3, (YD0 + YD1) / 2, HD + 0.08), (0.06, YD1 - YD0 + 0.34, 0.2))        # 앞 테두리 판
for yp in (YD0 + 0.05, YD1 - 0.05):
    box(gDm, 'wood2', (XA - 0.08, yp, (Z3 + HD - 0.1) / 2), (0.1, 0.1, HD - 0.1 - Z3))              # 문설주
box(gDm, 'wood2', (XA - 0.08, (YD0 + YD1) / 2, HD - 0.15), (0.1, YD1 - YD0, 0.1))                 # 문미
box(gDm, 'beam', (XA - 0.08, (YD0 + YD1) / 2, Z3 + 0.02), (0.14, YD1 - YD0, 0.04))                 # 문턱
# 용마루
box(gW, 'dark', (XR, 0, ZK + RIDGE + 0.05), (0.26, D + 0.7, 0.22))

# 박공벽 (정면 S · 뒷면 N): 세로 널을 삼각형으로 자른다
for side, y in (('S', -D / 2 + 0.1), ('N', D / 2 - 0.1)):
    g = group(f'f3_gable_{side}', 3, side)
    win = (XR - 0.4, XR + 0.4, ZK + 0.5, ZK + 1.35) if side == 'S' else (XR - 0.3, XR + 0.3, ZK + 0.6, ZK + 1.2)
    pw = 0.3
    for i in range(int(AW / pw)):
        x0 = XA + i * pw
        x1 = x0 + pw - 0.015
        mid = (x0 + x1) / 2
        top = roof_z(mid) - 0.05
        holes = [(win[2], win[3])] if win[0] - 0.02 < mid < win[1] + 0.02 else []
        for v0, v1 in subtract((Z3, top), holes):
            box(g, 'plank' if i % 3 else 'plank2', (mid, y, (v0 + v1) / 2), (x1 - x0, 0.08, v1 - v0))
    prism(gBake, 'plaster', [(XA + 0.05, Z3), (XB - 0.05, Z3), (XB - 0.05, roof_z(XB - 0.05) - 0.08), (XR, ZK + RIDGE - 0.12), (XA + 0.05, roof_z(XA + 0.05) - 0.08)], y - 0.03, y + 0.03)   # 베이크 가림막
    # 안쪽 회벽 (오각형: 무릎벽 + 삼각형)
    yi = y + (0.06 if side == 'S' else -0.06)
    prism(g, 'plaster', [(XA + 0.2, Z3), (XB - 0.2, Z3), (XB - 0.2, roof_z(XB - 0.2) - 0.08),
                         (XR, ZK + RIDGE - 0.12), (XA + 0.2, roof_z(XA + 0.2) - 0.08)], yi - 0.02, yi + 0.02)
    sg = 'S' if side == 'S' else 'N'
    ww = (win[0], win[1], win[2], win[3])
    # 창틀 (박공은 y 고정이라 직접)
    fw = 0.09
    for (cx_, cz_, sx_, sz_) in (((ww[0] + ww[1]) / 2, ww[2] - fw / 2, ww[1] - ww[0] + 2 * fw, fw),
                                ((ww[0] + ww[1]) / 2, ww[3] + fw / 2, ww[1] - ww[0] + 2 * fw, fw),
                                (ww[0] - fw / 2, (ww[2] + ww[3]) / 2, fw, ww[3] - ww[2]),
                                (ww[1] + fw / 2, (ww[2] + ww[3]) / 2, fw, ww[3] - ww[2]),
                                ((ww[0] + ww[1]) / 2, (ww[2] + ww[3]) / 2, 0.05, ww[3] - ww[2]),
                                ((ww[0] + ww[1]) / 2, (ww[2] + ww[3]) / 2, ww[1] - ww[0], 0.05)):
        box(g, 'wood2', (cx_, y, cz_), (sx_, 0.18, sz_))
    box(g, 'glow', (XR, y, (ww[2] + ww[3]) / 2), (ww[1] - ww[0], 0.04, ww[3] - ww[2]))
    # 박공 테두리 판 (바지랑대)
    for sgn in (-1, 1):
        ex = XR + sgn * AW / 4
        box(g, 'wood2', (ex, y + (-0.1 if side == 'S' else 0.1), ZK + RIDGE / 2 + 0.02),
            (math.hypot(RIDGE, AW / 2) + 0.4, 0.08, 0.16), rot=(0, sgn * ang, 0))

# 루프탑 난간 (S·W·N 가장자리)
gT = group('f3_terrace', 3)
def rail(p0, p1, h=0.8):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    n = max(2, int(d.length / 0.45) + 1)
    for i in range(n):
        p = p0 + d * (i / (n - 1))
        box(gT, 'wood2', (p.x, p.y, Z3 + h / 2), (0.08, 0.08, h))
    mid = (p0 + p1) / 2
    ax = 0 if abs(d.x) > abs(d.y) else math.pi / 2
    box(gT, 'beam', (mid.x, mid.y, Z3 + h), (d.length + 0.1, 0.12, 0.08), rot=(0, 0, ax))
    box(gT, 'beam', (mid.x, mid.y, Z3 + h * 0.45), (d.length, 0.05, 0.05), rot=(0, 0, ax))
e = 0.08
rail((-W / 2 + e, -D / 2 + e), (XA, -D / 2 + e))
rail((-W / 2 + e, -D / 2 + e), (-W / 2 + e, D / 2 - e))
rail((-W / 2 + e, D / 2 - e), (XA, D / 2 - e))
for p0, p1 in RAIL_LATER:          # 계단 머리 둘레
    rail(p0, p1, h=0.85)

def chair(g, x, y, z, face=0.0, col='plank'):
    R = Matrix.Rotation(face, 4, 'Z')
    def P(dx, dy, dz):
        v = R @ Vector((dx, dy, dz))
        return (x + v.x, y + v.y, z + v.z)
    box(g, col, P(0, 0, 0.42), (0.46, 0.46, 0.06), rot=(0, 0, face))
    for dx in (-0.19, 0.19):
        for dy in (-0.19, 0.19):
            box(g, 'wood2', P(dx, dy, 0.21), (0.05, 0.05, 0.42), rot=(0, 0, face))
    box(g, col, P(0, 0.21, 0.72), (0.46, 0.05, 0.58), rot=(0.12, 0, face))

chair(gT, -2.2, 1.1, Z3, math.pi * 0.15)
chair(gT, -1.2, 1.4, Z3, -math.pi * 0.1)
box(gT, 'blanket', (-2.15, 1.25, Z3 + 0.62), (0.5, 0.12, 0.42), rot=(0.25, 0, math.pi * 0.15))
cyl(gT, 'pot', (-2.6, -1.9, Z3 + 0.2), 0.2, 0.4, r2=0.16, seg=10)
sphere(gT, 'leaf', (-2.6, -1.9, Z3 + 0.6), 0.32, scale=(1, 1, 1.2))
box(gT, 'plank2', (-1.7, -1.2, Z3 + 0.25), (0.5, 0.5, 0.05))                # 작은 탁자
cyl(gT, 'cream', (-1.65, -1.15, Z3 + 0.32), 0.06, 0.1, seg=10)
# 줄 전구
for i in range(9):
    t = i / 8
    x = -W / 2 + 0.1 + t * (XA + W / 2 - 0.2)
    sphere(gT, 'glowbulb', (x, -D / 2 + 0.08, Z3 + 0.95 - 0.12 * math.sin(t * math.pi)), 0.045, seg=8)

# 굴뚝 (용마루 뒤쪽, 걷히지 않음)
gC = group('f3_chimney', 3)
cxh, cyh = XB - 0.9, D / 2 - 0.9
box(gC, 'stone', (cxh, cyh, (Z3 + ZK + RIDGE + 1.0) / 2 + 0.3), (0.6, 0.6, ZK + RIDGE + 0.4 - Z3))
for k in range(6):
    box(gC, 'stone2', (cxh, cyh, Z3 + 0.6 + k * 0.42), (0.62, 0.62, 0.05))
box(gC, 'stone2', (cxh, cyh, ZK + RIDGE + 0.75), (0.74, 0.74, 0.12))
box(gC, 'dark', (cxh, cyh, ZK + RIDGE + 0.8), (0.34, 0.34, 0.06))

# 돔 천문대 (동쪽 경사면 위, 걷히지 않음 — 집의 상징)
gD = group('f3_dome', 3)
dx, dy = XR + 0.95, -0.1
dz = roof_z(dx)
cyl(gD, 'plank', (dx, dy, dz - 0.05), 0.72, 0.9, seg=16)
for k in range(3):
    cyl(gD, 'beam', (dx, dy, dz - 0.35 + k * 0.3), 0.735, 0.04, seg=16)
cyl(gD, 'paper', (dx, dy, dz + 0.42), 0.8, 0.08, seg=16)
sphere(gD, 'cream', (dx, dy, dz + 0.45), 0.76, seg=16, half=True)
for k in range(-2, 3):          # 돔 판 이음선
    a = k * 0.5
    box(gD, 'rule', (dx, dy, dz + 0.45 + 0.38), (0.03, 1.52, 0.03), rot=(0, 0, a))
box(gD, 'night', (dx + 0.25, dy - 0.2, dz + 0.85), (0.5, 0.36, 0.5), rot=(0, 0.6, -0.6))   # 열린 틈
# 데포르메 망원경: 굵고 짧게, 오른쪽 앞 하늘로
tel_dir = Vector((0.75, -0.45, 0.62)).normalized()
base = Vector((dx + 0.05, dy - 0.05, dz + 0.55))
q = Vector((0, 0, 1)).rotation_difference(tel_dir)
Rt = q.to_euler()
L_t = 1.85
cyl(gD, 'sage', tuple(base + tel_dir * (L_t / 2)), 0.25, L_t, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (L_t - 0.05)), 0.32, 0.3, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (L_t * 0.45)), 0.275, 0.1, rot=Rt, seg=14)
cyl(gD, 'night', tuple(base + tel_dir * (L_t + 0.11)), 0.26, 0.02, rot=Rt, seg=14)
cyl(gD, 'brass', tuple(base + tel_dir * (0.1)), 0.13, 0.3, rot=Rt, seg=12)

# ---------------------------------------------------------------- 1층 찻집 소품
g1 = group('f1_props', 1)
Zf = 0.08
box(g1, 'rug', (-1.3, -0.5, Zf + 0.01), (2.3, 1.7, 0.02))
for k, x in enumerate([-2.2, -1.75, -1.3, -0.85, -0.4]):
    box(g1, 'rule', (x, -0.5, Zf + 0.022), (0.04, 1.6, 0.005))
# 카운터 (ㄱ자)
box(g1, 'beam', (1.75, 1.05, Zf + 0.5), (1.7, 0.6, 1.0))
box(g1, 'plank', (1.75, 1.05, Zf + 1.03), (1.8, 0.7, 0.06))
box(g1, 'beam', (2.35, 0.2, Zf + 0.5), (0.6, 1.2, 1.0))
box(g1, 'plank', (2.35, 0.2, Zf + 1.03), (0.7, 1.3, 0.06))
for i in range(6):
    box(g1, 'plank2', (0.95 + i * 0.32, 0.74, Zf + 0.5), (0.04, 0.02, 0.9))
# 카운터 위: 드립 주전자, 드리퍼, 원두 병
cyl(g1, 'dark', (1.3, 1.05, Zf + 1.17), 0.11, 0.22, r2=0.07, seg=12)
cyl(g1, 'dark', (1.15, 1.05, Zf + 1.2), 0.012, 0.25, rot=(0, -1.1, 0), seg=6)
cyl(g1, 'cream', (1.75, 1.0, Zf + 1.14), 0.08, 0.16, r2=0.04, seg=12)
cyl(g1, 'jar', (1.75, 1.0, Zf + 1.06), 0.07, 0.1, seg=12)
for i, x in enumerate([2.15, 2.35]):
    cyl(g1, 'jar', (x, 0.0, Zf + 1.16), 0.07, 0.2, seg=10)
    cyl(g1, 'coffee', (x, 0.0, Zf + 1.11), 0.065, 0.1, seg=10)
# 뒷벽 선반 + 병·머그
for k, z in enumerate([1.35, 1.75, 2.15]):
    box(g1, 'plank2', (-1.0, D / 2 - T - 0.15, z), (1.6, 0.26, 0.05))
    for i in range(5):
        x = -1.65 + i * 0.32
        if (i + k) % 2:
            cyl(g1, 'jar', (x, D / 2 - T - 0.15, z + 0.12), 0.07, 0.2, seg=10)
            cyl(g1, 'coffee', (x, D / 2 - T - 0.15, z + 0.08), 0.066, 0.1, seg=10)
        else:
            cyl(g1, 'cream' if i % 3 else 'green', (x, D / 2 - T - 0.15, z + 0.08), 0.06, 0.12, seg=10)
# 칠판 메뉴판
box(g1, 'wood2', (1.45, D / 2 - T - 0.05, 1.95), (1.4, 0.04, 0.9))
box(g1, 'night', (1.45, D / 2 - T - 0.075, 1.95), (1.28, 0.03, 0.78))
for i in range(4):
    box(g1, 'paper', (1.3, D / 2 - T - 0.095, 2.2 - i * 0.16), (0.7 - 0.12 * (i % 2), 0.01, 0.025))
# 둥근 탁자 + 의자 + 잔
def table(g, x, y, z, r=0.36):
    cyl(g, 'plank', (x, y, z + 0.74), r, 0.05, seg=16)
    cyl(g, 'beam', (x, y, z + 0.37), 0.05, 0.72, seg=8)
    cyl(g, 'beam', (x, y, z + 0.03), 0.22, 0.05, seg=10)
for (x, y, ns) in [(-1.5, -1.3, True), (-0.6, -0.2, False), (-1.0, 1.2, False)]:   # 서쪽 벽은 계단 자리: 탁자를 안쪽으로, 첫 탁자 의자는 앞뒤로
    table(g1, x, y, Zf)
    if ns:
        chair(g1, x, y - 0.6, Zf, 0.0, 'plank2')
        chair(g1, x, y + 0.6, Zf, math.pi, 'plank2')
    else:
        chair(g1, x - 0.6, y, Zf, math.pi / 2, 'plank2')
        chair(g1, x + 0.6, y, Zf, -math.pi / 2, 'plank2')
    cyl(g1, 'cream', (x + 0.12, y, Zf + 0.81), 0.06, 0.09, seg=10)
    cyl(g1, 'coffee', (x + 0.12, y, Zf + 0.853), 0.05, 0.005, seg=10)
# 펜던트 등
for x in (1.2, 2.0):
    cyl(g1, 'dark', (x, 0.95, H1 - 0.3), 0.01, 0.6, seg=4)
    cyl(g1, 'wood2', (x, 0.95, H1 - 0.62), 0.04, 0.12, r2=0.16, seg=10)
    sphere(g1, 'glowbulb', (x, 0.95, H1 - 0.72), 0.07, seg=8)
# 난로 (오른쪽 앞 구석)
box(g1, 'dark', (2.4, -1.8, Zf + 0.4), (0.6, 0.5, 0.8))
box(g1, 'glow', (2.4, -2.06, Zf + 0.35), (0.3, 0.02, 0.22))
cyl(g1, 'dark', (2.4, -1.8, (Zf + 0.8 + H1) / 2), 0.08, H1 - 0.8 - Zf, seg=8)
cyl(g1, 'brass', (2.35, -1.75, Zf + 0.9), 0.1, 0.16, r2=0.06, seg=10)
anchor('cafe', (-1.3, -0.4, 1.2))
anchor('counter', (1.9, 0.6, 1.5))
anchor('board', (1.45, D / 2 - 0.4, 2.2))

# 바깥 (땅 위): 벤치, 화분, 장작
gx = group('outside', 0)
box(gx, 'dark', (-1.4, -D / 2 - 0.55, 0.42), (1.3, 0.36, 0.06))
for dxx in (-0.55, 0.55):
    box(gx, 'dark', (-1.4 + dxx, -D / 2 - 0.55, 0.2), (0.06, 0.3, 0.4))
for (x, y, s) in [(-W / 2 - 0.45, -D / 2 - 0.35, 1.0), (-W / 2 - 0.2, -D / 2 - 0.8, 0.75),
                  (W / 2 + 0.45, -D / 2 - 0.35, 0.9), (W / 2 + 0.4, D / 2 + 0.3, 1.0),
                  (0.0, -D / 2 - 0.4, 0.6), (-W / 2 - 0.4, D / 2 + 0.2, 0.8)]:
    cyl(gx, 'pot', (x, y, 0.18 * s), 0.18 * s, 0.36 * s, r2=0.14 * s, seg=10)
    sphere(gx, 'leaf', (x, y, 0.5 * s), 0.26 * s, seg=10, scale=(1, 1, 1.25))
for row in range(3):
    for i in range(5 - row):
        y = -D / 2 + 0.4 + i * 0.27 + row * 0.135
        cyl(gx, 'log' if (i + row) % 2 else 'log2', (W / 2 + 0.38, y, 0.13 + row * 0.23), 0.13, 0.6, axis='X', seg=8)

# ---- 동네 터 소품 (floor 0) ----
# 말뚝 울타리: 터 가장자리 안쪽 0.6 m, 남쪽 길 자리는 비운다
FX, FY = LOT_W / 2 - 0.6, LOT_D / 2 - 0.6
def fence(p0, p1, gap=0.6):
    n = max(1, int(round(math.dist(p0, p1) / gap)))
    for i in range(n + 1):
        t = i / n
        x, y = p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t
        box(gx, 'rule', (x, y, 0.38), (0.08, 0.08, 0.76))
    mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
    along = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    for z in (0.25, 0.55):
        box(gx, 'rule', (mx, my, z), (math.dist(p0, p1), 0.05, 0.07), rot=(0, 0, along))
fence((-FX, -FY), (-0.2, -FY)); fence((1.8, -FY), (FX, -FY))      # 남쪽 (길 자리 비움)
fence((-FX, FY), (FX, FY))                                          # 북쪽
fence((-FX, -FY), (-FX, FY)); fence((FX, -FY), (FX, FY))            # 동·서
# 나무: 둥근 잎 + 기둥, 울타리 안팎에
for (x, y, s) in [(-6.5, -4.5, 1.6), (-7.0, 3.5, 1.9), (6.8, 4.5, 1.7), (7.2, -3.8, 1.4), (-3.5, 6.0, 1.5), (4.0, 6.3, 1.8),
                  (-8.3, -0.5, 1.3), (8.4, 0.8, 1.5), (-5.5, -6.5, 1.2), (5.8, -6.4, 1.6)]:
    cyl(gx, 'wood2', (x, y, 0.45 * s), 0.11 * s, 0.9 * s, seg=8)
    sphere(gx, 'leaf', (x, y, 1.25 * s), 0.62 * s, seg=12, scale=(1, 1, 1.15))
    sphere(gx, 'sage', (x + 0.25 * s, y - 0.2 * s, 1.5 * s), 0.38 * s, seg=10)
# 현관 포치 지붕 (2026-11-24): 기둥 둘 + 바깥으로 기운 작은 지붕. building.js OBST[1] 의 기둥 자리와 같아야 한다
PX0, PX1, PY = 0.1, 1.5, -D / 2 - 1.0
for px in (PX0, PX1):
    cyl(gx, 'beam', (px, PY, 1.15), 0.06, 2.3, seg=8)
    box(gx, 'stone2', (px, PY, 0.08), (0.3, 0.3, 0.16))
    box(gx, 'wood2', (px, PY + 0.3, 2.2), (0.08, 0.7, 0.08), rot=(0.7, 0, 0))                       # 버팀대
pang = 0.32
box(gx, 'plank', ((PX0 + PX1) / 2, PY + 0.05, 2.58), (PX1 - PX0 + 0.5, 1.45, 0.08), rot=(pang, 0, 0))
for k in range(4):
    yy = PY - 0.5 + (k + 0.5) * 0.36
    zz = 2.58 + 0.07 + (yy - PY - 0.05) * math.tan(pang)
    box(gx, 'shingle' if k % 2 else 'shingle2', ((PX0 + PX1) / 2, yy, zz), (PX1 - PX0 + 0.54, 0.4, 0.05), rot=(pang, 0, 0))
box(gx, 'wood2', ((PX0 + PX1) / 2, PY - 0.68, 2.58 - 0.73 * math.tan(pang)), (PX1 - PX0 + 0.54, 0.06, 0.16), rot=(pang, 0, 0))   # 앞 테두리 판
sphere(gx, 'glowbulb', ((PX0 + PX1) / 2, PY + 0.4, 2.25), 0.07, seg=8)                               # 현관 등
# 가로등 (길 옆) 과 우편함 (울타리 문 옆)
cyl(gx, 'dark', (1.7, -D / 2 - 2.6, 1.2), 0.05, 2.4, seg=6)
box(gx, 'dark', (1.7, -D / 2 - 2.6, 2.45), (0.3, 0.3, 0.3))
box(gx, 'glow', (1.7, -D / 2 - 2.6, 2.42), (0.22, 0.22, 0.22))
cyl(gx, 'wood2', (2.1, -FY + 0.25, 0.45), 0.04, 0.9, seg=6)
box(gx, 'red', (2.1, -FY + 0.25, 1.0), (0.22, 0.4, 0.24))
# 작은 연못 (서쪽 뒤) 과 돌 테두리
box(g0, 'night', (-5.2, 2.0, -0.03), (2.6, 1.8, 0.04))
for k in range(14):
    a = k / 14 * 2 * math.pi
    box(gx, 'stone', (-5.2 + 1.45 * math.cos(a), 2.0 + 1.05 * math.sin(a), 0.07), (0.3, 0.22, 0.14), rot=(0, 0, a))

# ---------------------------------------------------------------- 2층 갤러리 소품 (화실 왼쪽 · 공방 오른쪽)
g2 = group('f2_props', 2)
Zf2 = Z2
# 칸막이 (뒤쪽 절반, 문 하나)
box(g2, 'plaster', (0.3, 1.35, Zf2 + H2 / 2), (0.1, 2.3, H2))
box(g2, 'beam', (0.3, 0.15, Zf2 + H2 / 2), (0.16, 0.16, H2))
# 화실: 이젤 + 그림, 의자, 보조탁자, 기댄 캔버스, 왼쪽 벽 긴 두루마리(연표)
ex, ey = -1.5, -0.4
for a in (-0.25, 0.25):
    box(g2, 'plank', (ex + a, ey, Zf2 + 0.8), (0.05, 0.05, 1.6), rot=(0.12, a * 0.3, 0))
box(g2, 'plank', (ex, ey + 0.2, Zf2 + 0.75), (0.05, 0.05, 1.5), rot=(-0.3, 0, 0))
box(g2, 'cream', (ex, ey - 0.06, Zf2 + 1.25), (0.8, 0.04, 0.6), rot=(0.12, 0, 0))
box(g2, 'sage', (ex - 0.1, ey - 0.085, Zf2 + 1.2), (0.45, 0.01, 0.25), rot=(0.12, 0, 0))
box(g2, 'plank', (ex, ey - 0.04, Zf2 + 0.92), (0.9, 0.12, 0.04))
cyl(g2, 'plank2', (ex + 0.1, ey - 0.8, Zf2 + 0.3), 0.18, 0.04, seg=12)
cyl(g2, 'beam', (ex + 0.1, ey - 0.8, Zf2 + 0.15), 0.04, 0.3, seg=6)
box(g2, 'plank2', (-0.6, -1.3, Zf2 + 0.35), (0.6, 0.45, 0.04))
for i in range(4):
    box(g2, 'wood2', (-0.6 + (i - 1.5) * 0.12, -1.3, Zf2 + 0.18), (0.03, 0.4, 0.34))
for i, c in enumerate(['jar', 'night', 'jar']):
    cyl(g2, c, (-0.75 + i * 0.13, -1.3, Zf2 + 0.43), 0.045, 0.12, seg=8)
cyl(g2, 'jar', (-0.45, -1.2, Zf2 + 0.45), 0.06, 0.16, seg=8)
for i in range(3):   # 기댄 캔버스 — 남쪽 벽 (서쪽 벽은 계단 자리)
    box(g2, 'cream' if i % 2 else 'paper', (-1.2, -D / 2 + T + 0.12 + i * 0.12, Zf2 + 0.45), (0.6 - i * 0.08, 0.04, 0.8 - i * 0.12), rot=(0.15, 0, 0))
# 긴 두루마리 연표 (화실 뒷벽 안쪽 — 서쪽 벽은 계단 자리)
yw = D / 2 - T - 0.06
box(g2, 'paper', (-1.3, yw, Zf2 + 1.55), (2.6, 0.02, 0.62))
for i in range(7):
    box(g2, 'rule' if i % 2 else 'sage', (-2.35 + i * 0.35, yw - 0.01, Zf2 + 1.55), (0.22, 0.01, 0.05 + 0.04 * (i % 3)))
for z in (Zf2 + 1.87, Zf2 + 1.23):
    cyl(g2, 'beam', (-1.3, yw - 0.02, z), 0.03, 2.75, axis='X', seg=6)
# 공방: 작업대 + 서랍, 타공판 + 공구, 스탠드, 상자
bx, by = 1.75, D / 2 - T - 0.45
box(g2, 'plank', (bx, by, Zf2 + 0.9), (1.9, 0.75, 0.08))
box(g2, 'beam', (bx + 0.55, by, Zf2 + 0.45), (0.7, 0.68, 0.86))
for k in range(3):
    box(g2, 'plank2', (bx + 0.55, by - 0.35, Zf2 + 0.2 + k * 0.27), (0.6, 0.02, 0.2))
for dxx in (-0.85,):
    for dyy in (-0.3, 0.3):
        box(g2, 'beam', (bx + dxx, by + dyy, Zf2 + 0.45), (0.08, 0.08, 0.86))
box(g2, 'rule', (bx, D / 2 - T - 0.05, Zf2 + 1.7), (1.7, 0.03, 0.9))
for i in range(7):
    box(g2, 'dark', (bx - 0.7 + i * 0.23, D / 2 - T - 0.08, Zf2 + 1.72 + 0.1 * (i % 2)), (0.04, 0.02, 0.35 + 0.1 * (i % 3)))
cyl(g2, 'dark', (bx - 0.6, by + 0.15, Zf2 + 1.15), 0.015, 0.45, rot=(0.4, 0, 0), seg=6)
cyl(g2, 'sage', (bx - 0.6, by - 0.05, Zf2 + 1.35), 0.06, 0.14, r2=0.13, rot=(2.4, 0, 0), seg=10)
box(g2, 'paper', (bx - 0.1, by - 0.1, Zf2 + 0.95), (0.5, 0.35, 0.02), rot=(0, 0, 0.1))
box(g2, 'plank2', (2.4, -0.2, Zf2 + 0.2), (0.5, 0.4, 0.4))
# 작업 노트 책상 (가운데 앞)
box(g2, 'plank', (1.4, -1.1, Zf2 + 0.74), (1.1, 0.6, 0.06))
for dxx in (-0.48, 0.48):
    for dyy in (-0.24, 0.24):
        box(g2, 'beam', (1.4 + dxx, -1.1 + dyy, Zf2 + 0.36), (0.06, 0.06, 0.72))
box(g2, 'cream', (1.35, -1.1, Zf2 + 0.785), (0.5, 0.34, 0.03))
box(g2, 'rule', (1.35, -1.1, Zf2 + 0.802), (0.01, 0.34, 0.005))
cyl(g2, 'plank2', (1.4, -1.65, Zf2 + 0.45), 0.17, 0.04, seg=12)
cyl(g2, 'beam', (1.4, -1.65, Zf2 + 0.22), 0.04, 0.44, seg=6)
anchor('atelier', (-1.3, D / 2 - 0.5, Zf2 + 1.6))
anchor('shop', (1.8, 1.4, Zf2 + 1.5))
anchor('desk', (1.4, -1.1, Zf2 + 1.2))

# ---------------------------------------------------------------- 3층 소품 (놀이방 · 천문대)
g3 = group('f3_props', 3)
Zf3 = Z3
# 체크 카펫
rx, ry, n_x, n_y, tsz = XR - 0.2, -1.0, 6, 5, 0.28
for i in range(n_x):
    for j in range(n_y):
        box(g3, 'red' if (i + j) % 2 else 'cream', (rx + (i - n_x / 2 + 0.5) * tsz, ry + (j - n_y / 2 + 0.5) * tsz, Zf3 + 0.01), (tsz, tsz, 0.02))
# 장난감 로켓
rkx, rky = rx - 0.2, ry + 0.1
cyl(g3, 'cream', (rkx, rky, Zf3 + 0.38), 0.13, 0.5, seg=12)
cyl(g3, 'red', (rkx, rky, Zf3 + 0.75), 0.13, 0.24, r2=0.0, seg=12)
for a in range(3):
    ang_ = a * 2 * math.pi / 3
    box(g3, 'red', (rkx + 0.14 * math.cos(ang_), rky + 0.14 * math.sin(ang_), Zf3 + 0.2), (0.16, 0.03, 0.26), rot=(0, 0, ang_))
cyl(g3, 'night', (rkx, rky - 0.125, Zf3 + 0.45), 0.05, 0.02, axis='Y', seg=10)
# 블록
for (bx_, by_, bz_, c) in [(0.25, -0.2, 0, 'sage'), (0.45, -0.25, 0, 'cream'), (0.35, -0.22, 0.2, 'red'), (0.7, 0.05, 0, 'night')]:
    box(g3, c, (rx + bx_, ry + by_, Zf3 + 0.1 + bz_), (0.18, 0.18, 0.18), rot=(0, 0, bx_))
# 텐트
bm = bmesh.new()
bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.5, radius2=0.0, depth=1.0)
bm.transform(Matrix.Translation((XB - 0.75, -1.7, Zf3 + 0.5)) @ Matrix.Rotation(math.pi / 4, 4, 'Z'))
_obj_from_bm(bm, 'tent', 'paper', g3)
cyl(g3, 'beam', (XB - 0.75, -1.7, Zf3 + 1.05), 0.02, 0.3, seg=4)
# 낮은 책장 (동쪽 무릎벽 앞)
box(g3, 'beam', (XB - 0.35, 0.0, Zf3 + 0.35), (0.3, 0.9, 0.7))
for k in range(2):
    for i in range(6):
        box(g3, ['red', 'sage', 'night', 'cream', 'rug', 'green'][(i + k) % 6], (XB - 0.38, -0.33 + i * 0.13, Zf3 + 0.2 + k * 0.32), (0.2, 0.09, 0.24 - 0.03 * (i % 2)))
# 천문대 쪽: 삼각대, 지구본, 별지도
for a in range(3):
    ang_ = a * 2 * math.pi / 3
    box(g3, 'beam', (dx - 0.1 + 0.25 * math.cos(ang_), dy + 0.25 * math.sin(ang_), Zf3 + 0.55), (0.04, 0.04, 1.15),
        rot=(0.22 * math.sin(ang_), -0.22 * math.cos(ang_), 0))
box(g3, 'plank2', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.4), (0.5, 0.4, 0.04))
cyl(g3, 'beam', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.2), 0.04, 0.4, seg=6)
cyl(g3, 'brass', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.47), 0.06, 0.1, seg=8)
sphere(g3, 'sage', (XR - 0.5, D / 2 - 0.7, Zf3 + 0.68), 0.17, seg=12)
for i, (x, z) in enumerate([(XR - 0.7, ZK + 0.6), (XR + 0.3, ZK + 0.9)]):
    box(g3, 'night', (x, D / 2 - 0.2, z), (0.55, 0.02, 0.42))
    for s in range(5):
        box(g3, 'paper', (x - 0.18 + s * 0.09, D / 2 - 0.215, z - 0.1 + 0.07 * ((s * 7 + i) % 4)), (0.03, 0.01, 0.03))
# 다락 펜던트 등
cyl(g3, 'dark', (XR, -0.6, ZK + RIDGE - 0.5), 0.01, 0.9, seg=4)
sphere(g3, 'glowbulb', (XR, -0.6, ZK + RIDGE - 0.98), 0.08, seg=8)
anchor('dome', (dx + 0.2, dy, dz + 1.3))
anchor('play', (rx, ry, Zf3 + 0.9))
anchor('roof', (-1.8, 0.6, Zf3 + 1.1))

# ---------------------------------------------------------------- 합치기 + 내보내기
root = bpy.data.objects.new('house', None)
bpy.context.scene.collection.objects.link(root)
for name, g in GROUPS.items():
    objs = g['objs']
    if not objs:
        continue
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
            bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name
    for k, v in g['props'].items():
        ob[k] = v
    if name == 'door':                 # 원점을 경첩으로 옮겨 사이트가 rotation 만으로 열 수 있게
        ob.data.transform(Matrix.Translation(-Vector(DOOR_HINGE)))
        ob.location = DOOR_HINGE
    ob.parent = root
for a in ANCHORS:
    a.parent = root


# ---------------------------------------------------------------- 구석 그늘(AO) 굽기 → 정점색 COLOR_0
# 콘솔 게임이 조명을 미리 구워 두듯, 구석이 어두워지는 정도를 정점마다 계산해 glb 에 넣는다.
# 사이트(building.js)는 이 색을 재질 색에 곱하기만 하므로 런타임 비용이 없다. Cycles 없이 BVH 광선만 쓴다.
# 큰 면은 정점이 모서리에만 있어 그늘이 밋밋하므로 먼저 AO_EDGE 길이로 잘게 나눈다(삼각형 수가 몇 배 는다).
from mathutils.bvhtree import BVHTree

AO_EDGE = 0.45        # 이 길이보다 긴 변은 나눈다 (m)
AO_RAYS = 40          # 정점당 광선 수
AO_DIST = 1.3         # 이 거리 안의 물체만 그늘을 만든다 (m)
AO_FLOOR = 0.7        # 가장 어두운 구석의 밝기 (0=검정). 라이트맵이 구석 그늘을 맡으므로 약하게(0.5→0.7, 2026-11-24)
AO_TINT = (0.82, 0.70, 0.60)   # 그늘 색 (따뜻한 갈색; 회색 그늘은 '3D 렌더' 느낌)

def _subdivide_long(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    for _ in range(4):                     # 한 번에 1/2 씩, 최대 4번
        long_edges = [e for e in bm.edges if e.calc_length() > AO_EDGE * 1.5]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1, use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()

def bake_ao(objs):
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        _subdivide_long(o.data)
    # 모든 메시를 세계 좌표의 한 BVH 로
    verts, polys = [], []
    for o in meshes:
        base = len(verts)
        M = o.matrix_world
        verts.extend([M @ v.co for v in o.data.vertices])
        polys.extend([[base + i for i in p.vertices] for p in o.data.polygons])
    tree = BVHTree.FromPolygons(verts, polys)
    rng = random.Random(7)
    # 반구 안의 고정 방향 묶음 (코사인 가중)
    dirs = []
    for _ in range(AO_RAYS):
        u, v = rng.random(), rng.random()
        r = math.sqrt(u); phi = 2 * math.pi * v
        dirs.append(Vector((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1 - u)))))
    for o in meshes:
        me = o.data
        glow = all(m.name.startswith('glow') for m in me.materials if m)
        col = me.color_attributes.new('ao', 'BYTE_COLOR', 'CORNER')   # 바이트면 glb 가 1/4
        me.color_attributes.active_color = col
        M = o.matrix_world
        cache = {}
        for p in me.polygons:
            pc = M @ p.center
            for li in p.loop_indices:
                vi = me.loops[li].vertex_index
                # 평평한 면은 면 법선, 둥근 면(smooth)은 정점 법선 — 그래야 둥근 면의 꼭짓점 색이 면마다 같아
                # 정점이 공유되고, 사이트가 계산한 법선도 매끈해진다
                n = (M.to_3x3() @ (me.vertices[vi].normal if p.use_smooth else p.normal)).normalized()
                key = (vi, round(n.x, 2), round(n.y, 2), round(n.z, 2))
                if key not in cache:
                    a = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
                    t = n.cross(a).normalized(); b = n.cross(t)
                    if glow:
                        cache[key] = 1.0
                    else:
                        wp = M @ me.vertices[vi].co
                        origin = wp + (pc - wp) * 0.08 + n * 0.015    # 모서리에서 살짝 안쪽·위쪽
                        occ = 0.0
                        for d in dirs:
                            wd = t * d.x + b * d.y + n * d.z
                            hit = tree.ray_cast(origin, wd, AO_DIST)
                            if hit[0] is not None:
                                occ += 1.0 - hit[3] / AO_DIST
                        cache[key] = 1.0 - occ / AO_RAYS
                ao = cache[key]
                # 밝은 곳은 흰색(원래 색 그대로), 가장 어두운 구석은 AO_TINT * AO_FLOOR
                col.data[li].color_srgb = tuple(c * AO_FLOOR + (1 - c * AO_FLOOR) * ao for c in AO_TINT) + (1.0,)

bake_ao([o for o in bpy.data.objects if o.type == 'MESH'])

# ---------------------------------------------------------------- 텍스처 + UV (상자 투영)
# textures.py 가 나뭇결·지붕널·회벽·돌·풀을 그린다. UV 는 세계 좌표를 면의 주 법선 축으로 투영(1 타일 = 1 m × 타일/m).
import os
import tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import textures

TEX_DIR = tempfile.mkdtemp(prefix='house_tex_')
ASSET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')   # 손그림·사진 텍스처가 있으면 생성 대신 쓴다 (building/assets/README.md)
TEX = textures.make_all({k: COL[k] for k in textures.RECIPES if k in COL}, TEX_DIR, ASSET_DIR)

IMG_CACHE = {}
def _image(path, name, srgb=True):
    if path not in IMG_CACHE:
        img = bpy.data.images.load(path)
        img.name = name
        if not srgb:
            img.colorspace_settings.name = 'Non-Color'
        img.pack()
        IMG_CACHE[path] = img
    return IMG_CACHE[path]

def texture_materials():
    """색 + 법선 + 거칠기(ORM) 를 Principled BSDF 에 잇는다. glTF 내보내기가 normalTexture·metallicRoughnessTexture 로 만든다.
    법선·ORM 이미지는 변형끼리(textures.FAMILY) 같은 것을 써서 glb 에 한 번만 들어간다."""
    for key, (path, tiles, swap, npath, opath) in TEX.items():
        m = MATS.get(key)
        if m is None:
            continue
        nt = m.node_tree
        bsdf = nt.nodes.get('Principled BSDF')
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = _image(path, key)
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if npath:
            ntex = nt.nodes.new('ShaderNodeTexImage'); ntex.image = _image(npath, os.path.basename(npath)[:-4], srgb=False)
            nmap = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(ntex.outputs['Color'], nmap.inputs['Color'])
            nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
        if opath:
            otex = nt.nodes.new('ShaderNodeTexImage'); otex.image = _image(opath, os.path.basename(opath)[:-4], srgb=False)
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(otex.outputs['Color'], sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
            nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    # 텍스처 없는 재질의 거칠기·금속성 (실사 PBR)
    for key, m in MATS.items():
        if key in TEX:
            continue
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        rough, metal = ROUGH.get(key, (0.8, 0.0))
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal

ROUGH = {'brass': (0.35, 1.0), 'dark': (0.45, 0.8), 'door': (0.55, 0.0), 'jar': (0.3, 0.0), 'coffee': (0.4, 0.0),
         'paper': (0.9, 0.0), 'rule': (0.9, 0.0), 'ink': (0.7, 0.0), 'night': (0.5, 0.0), 'rug': (0.95, 0.0), 'blanket': (0.95, 0.0),
         'pot': (0.7, 0.0), 'leaf': (0.6, 0.0), 'green': (0.7, 0.0), 'sage': (0.7, 0.0), 'red': (0.6, 0.0)}

def project_uvs(objs):
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        uv = me.uv_layers.new(name='UVMap')
        M = o.matrix_world
        for p in me.polygons:
            key = me.materials[p.material_index].name if me.materials and me.materials[p.material_index] else ''
            if key not in TEX:                 # 텍스처 없는 재질은 UV 0 — 정점이 안 갈라져 둥근 면이 매끈하고 파일도 작다
                for li in p.loop_indices:
                    uv.data[li].uv = (0.0, 0.0)
                continue
            tiles, swap = TEX[key][1], TEX[key][2]
            n = (M.to_3x3() @ p.normal)
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in p.loop_indices:
                w = M @ me.vertices[me.loops[li].vertex_index].co
                if ax == 2:        # 위·아래 면: x,y
                    u, v = w.x, w.y
                elif ax == 0:      # 동·서 면: y,z
                    u, v = w.y, w.z
                else:              # 남·북 면: x,z
                    u, v = w.x, w.z
                if swap and ax != 2:
                    u, v = v, u
                uv.data[li].uv = (u * tiles, v * tiles)

texture_materials()
project_uvs([o for o in bpy.data.objects if o.type == 'MESH'])

out = sys.argv[-1] if sys.argv[-1].endswith('.glb') else 'house.glb'

# ---------------------------------------------------------------- 라이트맵 굽기 (Cycles, 2026-11-24 리모델링 2)
# 콘솔 게임처럼 조명을 미리 굽는다: 해가 벽에서 튕긴 따뜻한 반사광 + 하늘빛(직접+반사) 을 두 번째 UV('LM') 의 아틀라스 한 장에.
# 해의 직접광·그림자는 사이트가 실시간으로 그린다(문이 움직이고, 밤에는 달로 바뀐다). 그래서 베이크 1 = 해만 켜고 반사광(INDIRECT)만,
# 베이크 2 = 하늘만 켜고 직접+반사. 둘을 더해 <glb 이름>.lightmap.webp(sRGB, 값/LM_SCALE) 로 쓴다. 사이트는 lightMapIntensity=LM_SCALE.
# 소품·나무·문은 아틀라스가 아까워 빼고(정점 AO 만), 큰 면(벽·바닥·지붕·땅·지하·데크·계단)만 넣는다. HOUSE_LM=0 이면 건너뛴다(빠른 확인용).
LM_SIZE = int(os.environ.get('HOUSE_LM', '1024'))      # 2048 은 CPU 베이크가 몇 시간 걸린다
LM_SAMPLES = int(os.environ.get('HOUSE_LM_SAMPLES', '20'))
LM_SCALE = 2.0
LM_SKIP = ('_props', 'f3_dome', 'outside', 'door', 'cellar_stairs', 'bake_occluder')

def bake_lightmap(out_glb):
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and not any(k in o.name for k in LM_SKIP)]
    # 1) 두 번째 UV: 객체마다 각도로 펼친 뒤(smart project) 전부 한 아틀라스에 채운다
    for o in objs:
        uv = o.data.uv_layers.new(name='LM')
        o.data.uv_layers.active = uv
    for o in bpy.data.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()                                    # 객체마다 0~1 로 맞춰진 섬을 실제 크기 비율로 (큰 벽이 큰 섬)
    bpy.ops.uv.pack_islands(rotate=True, margin_method='ADD', margin=0.003, shape_method='AABB')   # 섬이 수천 개라 비율 여백은 아틀라스를 다 먹는다 → 절대 여백(베이크 여백보다 넓게, 섬끼리 번지지 않게)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 2) 모든 재질에 아틀라스 이미지 노드를 활성으로 두면 Cycles 가 거기에 굽는다
    img_sun = bpy.data.images.new('LM_sun', LM_SIZE, LM_SIZE, float_buffer=True)
    img_sky = bpy.data.images.new('LM_sky', LM_SIZE, LM_SIZE, float_buffer=True)
    nodes_ = []
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.name = 'LM_BAKE'
        uvn = m.node_tree.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'LM'
        m.node_tree.links.new(uvn.outputs['UV'], n.inputs['Vector'])
        m.node_tree.nodes.active = n
        nodes_.append(n)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = LM_SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 4; sc.cycles.diffuse_bounces = 4
    sc.render.bake.use_selected_to_active = False
    sc.render.bake.margin = max(2, LM_SIZE // 512)   # 섬 간격(0.003×크기)의 절반 이하
    sc.render.bake.use_clear = True
    sc.render.bake.use_pass_color = False
    # 해 (building.js 의 sun.position (-6, 14, 9) → 모델 좌표 (-6, -9, 14))
    sun_data = bpy.data.lights.new('LM_SUN', 'SUN'); sun_data.energy = 3.0; sun_data.angle = math.radians(8.0)   # 각지름을 키워 창으로 든 해 그림자를 부드럽게(실내 벽의 날카로운 얼룩 방지)
    sun_data.color = (1.0, 0.94, 0.85)
    sun_ob = bpy.data.objects.new('LM_SUN', sun_data); sc.collection.objects.link(sun_ob)
    sun_ob.rotation_euler = (-Vector((-6, -9, 14))).normalized().to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new('LM_WORLD') if sc.world is None else sc.world
    sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.72, 0.76, 0.86, 1)
    for o in bpy.data.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    # 베이크 1: 해만, 반사광만
    bg.inputs['Strength'].default_value = 0.0; sun_ob.hide_render = False
    for n in nodes_: n.image = img_sun
    sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = True
    bpy.ops.object.bake(type='DIFFUSE')
    # 베이크 2: 하늘만, 직접+반사
    bg.inputs['Strength'].default_value = 0.85; sun_ob.hide_render = True
    for n in nodes_: n.image = img_sky
    sc.render.bake.use_pass_direct = True; sc.render.bake.use_pass_indirect = True
    bpy.ops.object.bake(type='DIFFUSE')
    # 3) 더해서 8비트 sRGB WebP 로
    import numpy as np
    a = np.array(img_sun.pixels[:], dtype=np.float32).reshape(LM_SIZE, LM_SIZE, 4)
    b = np.array(img_sky.pixels[:], dtype=np.float32).reshape(LM_SIZE, LM_SIZE, 4)
    L = (a[..., :3] * 1.0 + b[..., :3] * 1.0) / LM_SCALE
    cov = np.maximum(a[..., 3:4], b[..., 3:4])
    L = np.where(cov > 0, L, 0.5)                                   # 섬 밖은 중간값
    L = np.clip(L, 0, 1) ** (1 / 2.2)
    from PIL import Image as _I, ImageFilter as _F
    im = _I.fromarray((L * 255).astype(np.uint8)).transpose(_I.FLIP_TOP_BOTTOM)   # Blender 는 아래가 0 행, glTF/three 는 위가 0 행
    im = im.filter(_F.GaussianBlur(0.8))                            # 베이크 노이즈를 살짝 누른다
    lm_path = out_glb[:-4] + '.lightmap.webp'
    im.save(lm_path, quality=88, method=6)
    # 베이크용 노드·이미지는 내보내기 전에 지운다 (glb 에 들어가면 안 된다)
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for n in list(m.node_tree.nodes):
            if n.name.startswith('LM_BAKE') or (n.type == 'UVMAP' and n.uv_map == 'LM'):
                m.node_tree.nodes.remove(n)
    bpy.data.objects.remove(sun_ob); bpy.data.images.remove(img_sun); bpy.data.images.remove(img_sky)
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers['UVMap']
    print('LIGHTMAP', lm_path, LM_SIZE, 'objects', len(objs), 'samples', LM_SAMPLES)

if LM_SIZE > 0:
    bake_lightmap(out)
occ = bpy.data.objects.get('bake_occluder')          # 가림막은 베이크에만 쓰고 내보내지 않는다
if occ:
    bpy.data.objects.remove(occ)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_extras=True, export_apply=True,
                          export_yup=True, export_materials='EXPORT', export_normals=False,   # 면이 평평해 법선은 GLTFLoader 가 계산해도 같다 (glb 25% 절약)
                          use_selection=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                          export_image_format='WEBP', export_image_quality=80)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('EXPORTED', out, 'groups', len(GROUPS), 'faces', tris)
