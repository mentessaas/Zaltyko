"""Apparatus scenes at real scale (85 px = 1 m). Anchors are named contact points."""
import math
from engine2 import PX_PER_M as M
from volumen import APP_D, APP_L, NAVY, metal

W = 360
VIEW_RULES = {
    'rings': {'lateral_arms': 'front', 'longitudinal_swing': 'side'},
}
def _floor(y, w=W): return f'<line x1="14" y1="{y}" x2="{w-14}" y2="{y}" stroke="{APP_L}" stroke-width="2" stroke-linecap="round"/>'

class Scene:
    def __init__(self, kind, h, floor_y, anchors, bars=(), draw=None, w=W, solids=(), surfaces=(), x_offset=0):
        self.kind, self.h, self.floor_y, self.bars, self.w = kind, h, floor_y, list(bars), w
        self.x_offset = x_offset
        self.view_rules = VIEW_RULES.get(kind, {})
        self.anchors = {name: (point[0] + x_offset, point[1]) for name, point in anchors.items()}
        self._draw = draw
        self.solids = [(x0 + x_offset, y0, x1 + x_offset, y1) for x0, y0, x1, y1 in solids]
        # accepts() predicates are written in unshifted scene coordinates; shift the point back before testing
        self.surfaces = [dict(surface, x0=surface['x0'] + x_offset, x1=surface['x1'] + x_offset,
                              accepts=(lambda p, test=surface['accepts']: test((p[0] - x_offset, p[1]))))
                         for surface in surfaces]
    def at(self, name):
        if not isinstance(name, str):   # raw [x, y] from a spec, in unshifted scene coordinates
            return (float(name[0]) + self.x_offset, float(name[1]))
        if '@' in name:
            base, x = name.split('@'); return (float(x) + self.x_offset, self.anchors[base][1])
        return self.anchors[name]
    def draw(self, uid):
        drawing = self._draw(uid)
        return f'<g transform="translate({self.x_offset},0)">{drawing}</g>' if self.x_offset else drawing

def floor():
    fy = 268
    return Scene('floor', 300, fy, {'floor': (0, fy)}, draw=lambda u: _floor(fy), surfaces=[
        {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def floor_pass():
    """Tumbling pass: 8.5 m wide so run, hurdle, round-off/flic-flac and the salto fit at real speed."""
    fy, w = 268, 720
    return Scene('floor', 300, fy, {'floor': (0, fy)}, draw=lambda u: _floor(fy, w), w=w, surfaces=[
        {'name': 'floor', 'x0': 0, 'x1': w, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= w and abs(p[1]-fy) <= 4}])

def beam():
    fy, top = 330, 330 - round(1.25 * M)
    def d(u):
        return (_floor(fy) + f'<rect x="96" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/><rect x="258" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="16" y="{top}" width="328" height="9" rx="3" fill="{metal(u)}"/>')
    # the real floor is below; the beam is a solid box (legs may hang beside it, nothing passes through it)
    return Scene('beam', 340, fy, {'beam': (0, top), 'floor': (0, fy)}, draw=d,
                 solids=[(16, top, 344, top + 9)], surfaces=[
                     {'name': 'beam', 'x0': 16, 'x1': 344, 'top': top,
                      'accepts': lambda p: 16 <= p[0] <= 344 and abs(p[1] - top) <= 4},
                     {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
                      'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def beam_mount():
    """Beam mounts: 9.4 m wide, 3 m of run-up, springboard in front of the left end of a 5 m beam."""
    fy, top, w = 330, 330 - round(1.25 * M), 800
    x0, x1 = 330, 330 + round(5.0 * M)
    board = (262, fy - 10)
    def d(u):
        return (_floor(fy, w) + f'<polygon points="{board[0]-34},{fy} {board[0]+24},{fy} {board[0]+24},{fy-14}" fill="{metal(u)}"/>'
                f'<rect x="{x0+70}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/><rect x="{x1-76}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="{x0}" y="{top}" width="{x1-x0}" height="9" rx="3" fill="{metal(u)}"/>')
    return Scene('beam_mount', 340, fy, {'beam': (0, top), 'floor': (0, fy), 'board': board}, draw=d, w=w,
                 solids=[(x0, top, x1, top + 9)], surfaces=[
                     {'name': 'beam', 'x0': x0, 'x1': x1, 'top': top,
                      'accepts': lambda p: x0 <= p[0] <= x1 and abs(p[1] - top) <= 4},
                     {'name': 'board', 'x0': board[0]-34, 'x1': board[0]+24, 'top': None,
                      'accepts': lambda p: abs(p[0]-board[0]) <= 30 and abs(p[1]-board[1]) <= 8},
                     {'name': 'floor', 'x0': 0, 'x1': w, 'top': None,
                      'accepts': lambda p: 0 <= p[0] <= w and abs(p[1]-fy) <= 4}])

def beam_side_dismount():
    """Side-on dismount view: compact beam platform and a separate landing mat beside it."""
    fy, top, w = 330, 330 - round(1.25 * M), 420
    beam_left, beam_right = 145, 215
    mat_left, mat_right = 265, 405
    def d(u):
        return (_floor(fy, w) +
                f'<rect x="{beam_left}" y="{top}" width="{beam_right-beam_left}" height="9" rx="3" fill="{metal(u)}"/>'
                f'<rect x="{beam_left+8}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="{beam_right-14}" y="{top+9}" width="6" height="{fy-top-9}" fill="{APP_L}"/>'
                f'<rect x="{mat_left}" y="{fy-8}" width="{mat_right-mat_left}" height="8" rx="3" fill="{APP_L}"/>')
    return Scene('beam_side_dismount', 340, fy, {'beam': (0, top), 'floor': (0, fy)}, draw=d, w=w,
                 solids=[(beam_left, top, beam_right, top + 9)], surfaces=[
                     {'name': 'beam', 'x0': beam_left, 'x1': beam_right, 'top': top,
                      'accepts': lambda p: beam_left <= p[0] <= beam_right and abs(p[1]-top) <= 4},
                     {'name': 'floor', 'x0': 0, 'x1': w, 'top': None,
                      'accepts': lambda p: 0 <= p[0] <= w and abs(p[1]-fy) <= 4},
                     {'name': 'mat', 'x0': mat_left, 'x1': mat_right, 'top': None,
                      'accepts': lambda p: mat_left <= p[0] <= mat_right and abs(p[1]-(fy-8)) <= 4}])

def high_bar():
    fy = 340; bar = (180, fy - round(2.8 * M))
    def d(u):
        return (_floor(fy) + f'<rect x="{bar[0]-2}" y="{bar[1]}" width="4" height="{fy-bar[1]}" fill="{APP_L}"/>'
                f'<circle cx="{bar[0]}" cy="{bar[1]}" r="5" fill="{metal(u)}"/>')
    return Scene('high_bar', 350, fy, {'bar': bar}, bars=[bar], draw=d, surfaces=[
        {'name': 'bar', 'x0': bar[0]-7, 'x1': bar[0]+7, 'top': bar[1],
         'accepts': lambda p: math.dist(p, bar) <= 5},
        {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def uneven():
    """9 m wide: run-up and springboard in front of the low bar, bars 1.5 m apart, a second board
    (`board_hb`) outside the high bar for mounts taken from that side, room for swings outside."""
    fy, w = 340, 760
    lb = (390, fy - round(1.70 * M)); hb = (520, fy - round(2.50 * M))
    board = (262, fy - 10); board_hb = (650, fy - 10)
    def d(u):
        o = _floor(fy, w)
        o += f'<polygon points="{board[0]-28},{fy} {board[0]+30},{fy} {board[0]+30},{fy-14}" fill="{metal(u)}"/>'
        o += f'<polygon points="{board_hb[0]+28},{fy} {board_hb[0]-30},{fy} {board_hb[0]-30},{fy-14}" fill="{metal(u)}"/>'
        for bb in (lb, hb):
            o += f'<rect x="{bb[0]-2}" y="{bb[1]}" width="4" height="{fy-bb[1]}" fill="{APP_L}"/><circle cx="{bb[0]}" cy="{bb[1]}" r="4.5" fill="{metal(u)}"/>'
        return o
    return Scene('uneven_bars', 350, fy, {'lb': lb, 'hb': hb, 'board': board, 'board_hb': board_hb, 'floor': (0, fy)},
                 bars=[lb, hb], draw=d, w=w, surfaces=[
                     *({'name': name, 'x0': point[0]-7, 'x1': point[0]+7, 'top': point[1],
                        'accepts': lambda p, point=point: math.dist(p, point) <= 5}
                       for name, point in (('lb', lb), ('hb', hb))),
                     {'name': 'board', 'x0': board[0]-28, 'x1': board[0]+30, 'top': None,
                      'accepts': lambda p: abs(p[0]-board[0]) <= 30 and abs(p[1]-board[1]) <= 8},
                     {'name': 'board_hb', 'x0': board_hb[0]-30, 'x1': board_hb[0]+28, 'top': None,
                      'accepts': lambda p: abs(p[0]-board_hb[0]) <= 30 and abs(p[1]-board_hb[1]) <= 8},
                     {'name': 'floor', 'x0': 0, 'x1': w, 'top': None,
                      'accepts': lambda p: 0 <= p[0] <= w and abs(p[1]-fy) <= 4}])

def rings():
    fy = 352; ring = (180, fy - round(2.75 * M))
    def d(u, hands=None):
        return _floor(fy)
    return Scene('rings', 362, fy, {
        'rings': ring, 'ring_far': (ring[0]-21, ring[1]), 'ring_near': (ring[0]+21, ring[1]),
    }, draw=d, surfaces=[
        {'name': 'rings', 'x0': ring[0]-25, 'x1': ring[0]+25, 'top': ring[1],
         'accepts': lambda p: ring[0]-25 <= p[0] <= ring[0]+25 and abs(p[1]-ring[1]) <= 5},
        {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def pbars():
    fy = 330; ry = fy - round(2.0 * M)
    def d(u):
        return (_floor(fy) + f'<line x1="40" y1="{ry-7}" x2="330" y2="{ry-7}" stroke="{APP_L}" stroke-width="5" stroke-linecap="round"/>'
                f'<rect x="70" y="{ry}" width="5" height="{fy-ry}" fill="{APP_L}"/><rect x="286" y="{ry}" width="5" height="{fy-ry}" fill="{APP_L}"/>'
                f'<rect x="30" y="{ry-3.5}" width="300" height="7" rx="3.5" fill="{metal(u)}"/>')
    return Scene('parallel_bars', 340, fy, {'rail': (0, ry)}, draw=d, surfaces=[
        {'name': 'rail', 'x0': 40, 'x1': 330, 'top': ry-7,
         'accepts': lambda p: 40 <= p[0] <= 330 and abs(p[1]-ry) <= 8},
        {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def pommel():
    fy = 300; top = fy - round(1.05 * M); grip = fy - round(1.17 * M)
    pl, pr = (161, grip), (199, grip)
    def d(u):
        o = _floor(fy) + f'<rect x="132" y="{top+26}" width="8" height="{fy-top-26}" fill="{APP_L}"/><rect x="220" y="{top+26}" width="8" height="{fy-top-26}" fill="{APP_L}"/>'
        o += f'<rect x="108" y="{top}" width="144" height="28" rx="14" fill="{metal(u)}"/>'
        for x in (pl[0], pr[0]):
            o += f'<path d="M{x-11} {top+1} v-9 a3 3 0 0 1 3 -3 h16 a3 3 0 0 1 3 3 v9" fill="none" stroke="{APP_D}" stroke-width="5"/>'
        return o
    return Scene('pommel_horse', 310, fy, {'pommel_l': pl, 'pommel_r': pr, 'horse': (0, top)}, draw=d, surfaces=[
        {'name': 'pommel_l', 'x0': pl[0]-5, 'x1': pl[0]+5, 'top': grip,
         'accepts': lambda p: math.dist(p, pl) <= 4},
        {'name': 'pommel_r', 'x0': pr[0]-5, 'x1': pr[0]+5, 'top': grip,
         'accepts': lambda p: math.dist(p, pr) <= 4},
        {'name': 'floor', 'x0': 0, 'x1': W, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= W and abs(p[1]-fy) <= 4}])

def vault():
    """Wide scene with a left safety margin before the runway, board, table, and landing mat."""
    fy = 330; top = fy - round(1.25 * M); w = 680; x_offset = 40
    def d(u):
        return (_floor(fy, w - x_offset) + f'<polygon points="236,{fy} 300,{fy} 300,{fy-14}" fill="{metal(u)}"/>'
                f'<path d="M406 {fy} l5 -{fy-top-12} h10 l5 {fy-top-12} z" fill="{APP_L}"/><rect x="370" y="{top}" width="92" height="14" rx="7" fill="{metal(u)}"/>'
                f'<rect x="478" y="{fy-8}" width="150" height="8" rx="3" fill="{APP_L}"/>')
    board = (280, fy-10); mat = (0, fy-8)
    return Scene('vault', 340, fy, {'board': board, 'table': (0, top), 'floor': (0, fy), 'mat': mat}, draw=d, w=w, x_offset=x_offset, surfaces=[
        {'name': 'board', 'x0': 236, 'x1': 300, 'top': None,
         'accepts': lambda p: 236 <= p[0] <= 300 and abs(p[1]-board[1]) <= 8},
        {'name': 'table', 'x0': 370, 'x1': 462, 'top': top,
         'accepts': lambda p: 370 <= p[0] <= 462 and abs(p[1]-top) <= 4},
        {'name': 'floor', 'x0': 0, 'x1': w, 'top': None,
         'accepts': lambda p: 0 <= p[0] <= w and abs(p[1]-fy) <= 4},
        {'name': 'mat', 'x0': 478, 'x1': 628, 'top': None,
         'accepts': lambda p: 478 <= p[0] <= 628 and abs(p[1]-mat[1]) <= 4}])

SCENES = {'floor': floor, 'floor_pass': floor_pass, 'beam': beam, 'beam_mount': beam_mount, 'beam_side_dismount': beam_side_dismount, 'high_bar': high_bar, 'uneven_bars': uneven, 'rings': rings,
          'parallel_bars': pbars, 'pommel_horse': pommel, 'vault': vault}
