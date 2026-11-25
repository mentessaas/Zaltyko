"""Turn an element animation spec (JSON) into frames, validate them, and render.

usage: python3 run_spec.py <spec.json>... [--render] [--out DIR]
Outputs per spec in DIR (default ./out): <key>.mp4 (preview), <key>.svg (static pictogram),
<key>-sheet.png (contact sheet for review), <key>-report.json (physics + validation).
"""
import json, math, os, subprocess, sys
from figure import Pose
from engine2 import Shape, Timeline, contact, contact_frame_counts, flight, validate, com, pin, FPS, PX_PER_M, joint_angles, momentum_warnings
from scenes import SCENES
import volumen as V

def pose_of(d):
    p = Pose(torso=d['torso'], arm_n=tuple(d['arm_n']), arm_f=tuple(d.get('arm_f', d['arm_n'])),
             leg_n=tuple(d['leg_n']), leg_f=tuple(d.get('leg_f', d['leg_n'])), head=d.get('head', 0), front=d.get('front', False))
    p.facing = d.get('facing', 1); p.yaw = d.get('yaw', 0); p.yaw_pivot = d.get('yawPivot', 'han')
    p.arch = d.get('arch', 0); return p

def shape_of(d):
    p = pose_of(d); return Shape.of(p, p.facing)

def validate_timeline(spec, sc, tl):
    has_phase_views = any('view' in phase.get('contact', {}) for phase in spec.get('timeline', []))
    front = spec.get('view') == 'front' and not has_phase_views
    shift = headroom(tl)
    rings = None
    if sc.kind == 'rings':
        center = sc.at('rings')
        def rings(p):
            amount = max(0.0, min(1.0, float(p.front)))
            return [(center[0] - 21 * amount, center[1]), (center[0] + 21 * amount, center[1])]
    return validate(tl, floor_y=sc.floor_y, bars=sc.bars, front=front,
                    solids=getattr(sc, 'solids', ()), surfaces=getattr(sc, 'surfaces', ()),
                    canvas=(sc.w, sc.h + shift), canvas_shift=shift, rings=rings,
                    vertical_support=(sc.kind == 'parallel_bars' and spec.get('definingPosition') in ('handstand', 'vertical')))

def _camera_value(view):
    if view not in ('side', 'front'):
        raise ValueError(f"unsupported phase view {view!r}; use 'side' or 'front'")
    return float(view == 'front')

def _apply_camera_transition(tl, start, source, target, frames, joint, source_point, target_point):
    if frames <= 0:
        return
    for index in range(start, min(len(tl.frames), start + frames)):
        pose, _, meta = tl.frames[index]
        progress = (index - start + 1) / frames
        pose.front = source + (target - source) * min(progress, 1.0)
        amount = min(progress, 1.0)
        point = (source_point[0] + (target_point[0] - source_point[0]) * amount,
                 source_point[1] + (target_point[1] - source_point[1]) * amount)
        meta['contact'] = (joint, point)
        tl.frames[index] = (pose, pin(pose, joint, point), meta)

def planned_flight_velocity(p0, pel0, phase, sc):
    """Return the exact ballistic launch velocity implied by this flight's landing/apex."""
    f = phase['flight']; land = f['land']
    point = sc.at(land['at']) if isinstance(land['at'], str) else tuple(land['at'])
    end_pose = f['shapes'][-1]['pose']
    end_shape = shape_of(end_pose)
    end_pose = end_shape.pose(p0.torso + f['rotation'])
    pel1 = pin(end_pose, land['joint'], point)
    c0 = (pel0[0] + com(p0)[0], pel0[1] + com(p0)[1])
    c1 = (pel1[0] + com(end_pose)[0], pel1[1] + com(end_pose)[1])
    apex = c0[1] - f['riseM'] * PX_PER_M if 'riseM' in f else None
    if 'apexAbove' in f:
        apex = sc.at(f['apexAbove']['at'])[1] - f['apexAbove']['m'] * PX_PER_M
    if apex is None:
        duration = f.get('durationS')
    else:
        h0, h1 = c0[1] - apex, c1[1] - apex
        assert h0 >= 0 and h1 >= 0, 'apex must be above both ends'
        duration = math.sqrt(2 * h0 / (9.81 * PX_PER_M)) + math.sqrt(2 * h1 / (9.81 * PX_PER_M))
    vx = (c1[0] - c0[0]) / duration
    vy = (c1[1] - c0[1] - 0.5 * 9.81 * PX_PER_M * duration * duration) / duration
    return vx, vy

def build(spec):
    sc = SCENES[spec['scene']](); tl = Timeline(); flights = []
    for phase_index, ph in enumerate(spec['timeline']):
        if 'contact' in ph:
            c = ph['contact']; pt = sc.at(c['at']) if isinstance(c['at'], str) else tuple(c['at'])
            keys = [(k.get('dt', 0), k['pose']['torso'], shape_of(k['pose'])) for k in c['keys']]
            declared_view = c.get('view', 'front' if spec.get('view') == 'front' else None)
            if declared_view is not None:
                camera_target = _camera_value(declared_view)
                camera_source = _camera_value(c['cameraFrom']) if 'cameraFrom' in c else (
                    float(getattr(tl.frames[-1][0], 'front', camera_target)) if tl.frames else camera_target)
                previous_contact = tl.frames[-1][2].get('contact') if tl.frames else None
                if previous_contact:
                    camera_source_point = previous_contact[1]
                elif sc.kind == 'rings' and camera_source < 0.5:
                    camera_source_point = sc.at('rings')
                else:
                    camera_source_point = pt
                for _, _, shape in keys:
                    shape.front = camera_target
                transition_frames = round(c.get('cameraTransitionS', 0) * FPS)
                if c.get('cameraTransitionS', 0) < 0:
                    raise ValueError('cameraTransitionS must be non-negative')
            else:
                camera_source = camera_target = transition_frames = camera_source_point = None
            if tl.frames and keys[0][0] == 0 and len(keys) > 1 and c.get('continue', True):
                pass
            start = len(tl.frames)
            next_phase = spec['timeline'][phase_index + 1] if phase_index + 1 < len(spec['timeline']) else None
            launch_velocity = None
            if next_phase and 'flight' in next_phase and len(keys) > 1:
                last_pose = keys[-1][2].pose(keys[-1][1])
                last_pelvis = pin(last_pose, c['joint'], pt)
                launch_velocity = planned_flight_velocity(last_pose, last_pelvis, next_phase, sc)
            contact_at = c['at']
            contact_duration = sum(contact_frame_counts(keys, launch_velocity)) / FPS
            elastic_accel = None
            if isinstance(contact_at, str) and contact_at.startswith('board'):
                # Greenwood & Newton measured a 10.6 BW peak; net COM acceleration is (GRF/BW - 1)g.
                # https://ojs.ub.uni-konstanz.de/cpa/article/view/2729
                elastic_accel = (10.6 - 1.0) * 9.81
            elif isinstance(contact_at, str) and contact_at.startswith('table@'):
                # Penitente & Sands' measured table-force range reaches 1.81 BW per hand; sum both hands.
                # https://doi.org/10.1515/hukin-2015-0034
                elastic_accel = (2 * 1.81 - 1.0) * 9.81
            elif (isinstance(contact_at, str) and contact_at.startswith('floor@') and contact_duration <= 0.15
                  and phase_index > 0 and phase_index + 1 < len(spec['timeline'])
                  and 'flight' in spec['timeline'][phase_index - 1] and 'flight' in spec['timeline'][phase_index + 1]):
                # Burt et al. report up to 8.46 BW at the ankles in floor round-offs; use as a linked-acro envelope.
                # https://www.fsp.uni-lj.si/mma/SCGYM_2_3_2010_article1/2010093009140391/?m=1285830843
                elastic_accel = (8.46 - 1.0) * 9.81
            existing = set(validate_timeline(spec, sc, tl))
            existing_momentum = len(momentum_warnings(tl))
            contact(tl, keys, c['joint'], pt, surface=sc.floor_y, end_velocity=launch_velocity,
                    phase_id=phase_index, elastic_accel=elastic_accel)   # front view is set per pose
            for _, _, meta in tl.frames[start:]:
                meta['verticalSupport'] = bool(c.get('verticalSupport'))
            if camera_target is not None:
                _apply_camera_transition(tl, start, camera_source, camera_target, transition_frames,
                                         c['joint'], camera_source_point, pt)
            for _, _, meta in tl.frames[start:]:
                meta['underBar'] = bool(c.get('underBar'))
            if launch_velocity is not None:
                candidate_problems = validate_timeline(spec, sc, tl)
                if set(candidate_problems) - existing:
                    # Reduce the launch tangent only as much as needed to preserve every validator rule.
                    low, high, best = 0.0, 1.0, None
                    for _ in range(8):
                        scale = (low + high) / 2
                        tl.frames = tl.frames[:start]
                        contact(tl, keys, c['joint'], pt, surface=sc.floor_y, end_velocity=launch_velocity,
                                phase_id=phase_index, elastic_accel=elastic_accel, tangent_scale=scale)
                        for _, _, meta in tl.frames[start:]:
                            meta['verticalSupport'] = bool(c.get('verticalSupport'))
                        if camera_target is not None:
                            _apply_camera_transition(tl, start, camera_source, camera_target, transition_frames,
                                                     c['joint'], camera_source_point, pt)
                        for _, _, meta in tl.frames[start:]:
                            meta['underBar'] = bool(c.get('underBar'))
                        revised = validate_timeline(spec, sc, tl)
                        if set(revised) - existing or len(momentum_warnings(tl)) > existing_momentum:
                            high = scale
                        else:
                            low, best = scale, list(tl.frames)
                    if best is None:
                        tl.frames = tl.frames[:start]
                        contact(tl, keys, c['joint'], pt, surface=sc.floor_y, phase_id=phase_index,
                                elastic_accel=elastic_accel)
                        for _, _, meta in tl.frames[start:]:
                            meta['verticalSupport'] = bool(c.get('verticalSupport'))
                        if camera_target is not None:
                            _apply_camera_transition(tl, start, camera_source, camera_target, transition_frames,
                                                     c['joint'], camera_source_point, pt)
                        for _, _, meta in tl.frames[start:]:
                            meta['underBar'] = bool(c.get('underBar'))
                    else:
                        tl.frames = best
            if c.get('twist'):
                # long-axis turn while in support (spindles): draw the twist ring + count. Display only:
                # unlike flight twists, the joint-limit check still applies to these frames.
                for i in range(start, len(tl.frames)):
                    tl.frames[i][2]['twistShow'] = True; tl.frames[i][2]['twistTotal'] = abs(c['twist']['total'])
        else:
            f = ph['flight']; land = f['land']; pt = sc.at(land['at']) if isinstance(land['at'], str) else tuple(land['at'])
            p0, pel0, _ = tl.last; c0y = pel0[1] + com(p0)[1]
            apex = c0y - f['riseM'] * PX_PER_M if 'riseM' in f else None
            if 'apexAbove' in f:   # e.g. {"at": "bar", "m": 0.8}: COM peak this high above an anchor
                apex = sc.at(f['apexAbove']['at'])[1] - f['apexAbove']['m'] * PX_PER_M
            shapes = [(0.0, Shape.of(p0, getattr(p0, 'facing', 1)))] + [(s['u'], shape_of(s['pose'])) for s in f['shapes']]
            start = len(tl.frames)
            info = flight(tl, f.get('durationS'), shapes, f['rotation'], land['joint'], pt, p0.torso + f['rotation'],
                          surface=sc.floor_y, apex_y=apex)
            twist = f.get('twist', 0)
            if twist:
                w0, w1 = f.get('twistWindow', [0.15, 0.85]); n = len(tl.frames) - start
                for i in range(start, len(tl.frames)):
                    u = (i - start + 1) / n
                    done = max(0.0, min(1.0, (u - w0) / (w1 - w0))) * abs(twist)
                    tl.frames[i][2]['twist'] = 0 < done < abs(twist)
                    if 0 < done < abs(twist): tl.frames[i][2]['twistTotal'] = abs(twist)
                    if round(done / 180) % 2 == 1:
                        p = tl.frames[i][0]; p.facing = -getattr(p, 'facing', 1)
            info['twist'] = twist; flights.append(info)
    return sc, tl, flights

def validate_spec(spec, sc, tl):
    return validate_timeline(spec, sc, tl)

def turns_label(deg):
    """720 -> '2', 540 -> '1½', 180 -> '½', 270 -> '¾'."""
    q = round(deg / 90); whole, rest = divmod(q, 4)
    frac = {0: '', 1: '¼', 2: '½', 3: '¾'}[rest]
    return (str(whole) if whole else '') + frac or '0'

def overlay(sc, p, pel, meta, label=True, ring_layer='all'):
    o = ''
    if sc.kind == 'rings':
        j = p.joints(pel)
        front_amount = max(0.0, min(1.0, float(getattr(p, 'front', False))))
        center = sc.at('rings')[0]
        grips = [('far', (center - 21 * front_amount, 6), j['haf']),
                 ('near', (center + 21 * front_amount, 6), j['han'])]
        for layer, (tx, ty), hand in grips:
            if ring_layer not in ('all', layer):
                continue
            h = hand
            o += f'<line x1="{tx}" y1="{ty}" x2="{h[0]:.1f}" y2="{h[1]-9:.1f}" stroke="{V.APP_D}" stroke-width="2"/>'
            o += f'<circle cx="{h[0]:.1f}" cy="{h[1]:.1f}" r="8.5" fill="none" stroke="#7d8aab" stroke-width="4"/>'
    if ring_layer != 'far' and (meta.get('twist') or meta.get('twistShow')):
        j = p.joints(pel); c = ((j['pelvis'][0] + j['neck'][0]) / 2, (j['pelvis'][1] + j['neck'][1]) / 2)
        o += f'<ellipse cx="{c[0]:.1f}" cy="{c[1]:.1f}" rx="26" ry="8" transform="rotate({p.torso:.1f} {c[0]:.1f} {c[1]:.1f})" fill="none" stroke="{V.BLUE}" stroke-width="3" opacity=".8"/>'
        if meta.get('twistTotal') and label:
            # the ring alone does not say how much the gymnast twists: label the total (½, 1, 1½, ...),
            # placed at the end of the ring's long axis that is higher on screen (clear of floor/apparatus)
            dx, dy = math.cos(math.radians(p.torso)), math.sin(math.radians(p.torso))
            if dy > 0 or (abs(dy) < 1e-6 and dx < 0): dx, dy = -dx, -dy
            if abs(dy) < 0.5: dx, dy = dx * 0.6, dy * 0.6 - 0.8   # trunk nearly vertical: lift the label above
            lx, ly = c[0] + 40 * dx, c[1] + 40 * dy
            o += (f'<g transform="translate({lx:.1f},{ly:.1f})"><rect x="-17" y="-11" width="34" height="22" rx="11" fill="{V.BLUE}" opacity=".9"/>'
                  f'<text y="5" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#fff">{turns_label(meta["twistTotal"])}</text></g>')
    return o

def floor_band(sc, tl):
    """With a raised camera (yaw-turned frames) the floor is a plane, not a line: draw it as a soft band."""
    if not any(getattr(p, 'yaw', 0) for p, _, _ in tl.frames) or sc.kind not in ('floor', 'pommel_horse'):
        return ''
    y = sc.floor_y
    return (f'<rect x="10" y="{y - 22}" width="{sc.w - 20}" height="70" rx="35" fill="#dfe6f5" opacity=".55"/>')

def headroom(tl, margin=22):
    """Pixels to shift the scene down so the highest point of any frame stays inside the canvas."""
    if not tl.frames:
        return 0
    top = min(min(y for k, (x, y) in p.joints(pel).items()) - 12 for p, pel, _ in tl.frames)
    return max(0, round(margin - top))

def shifted(body, dy): return f'<g transform="translate(0,{dy})">{body}</g>' if dy else body

def frame_svg(sc, tl, i, trails=True, uid='a'):
    p, pel, meta = tl.frames[min(i, len(tl.frames) - 1)]
    import math as _m
    behind = _m.sin(_m.radians(getattr(p, 'yaw', 0))) < -0.05
    band = floor_band(sc, tl)
    # on the floor scene the band IS the floor (a plane seen from a raised camera): no floor line
    scene_drawing = '' if (band and sc.kind == 'floor') else sc.draw(uid)
    body = band + ('' if behind else scene_drawing)
    if trails and i < len(tl.frames):
        for lag, op in ((6, .06), (4, .09), (2, .13)):
            k = i - lag
            if k >= 0: q, qp, _ = tl.frames[k]; body += V.fig(uid, q, qp, False, op)
    body += overlay(sc, p, pel, meta, ring_layer='far') + V.fig(uid, p, pel) + overlay(sc, p, pel, meta, ring_layer='near')
    if behind and scene_drawing: body += scene_drawing
    dy = headroom(tl)
    return V.frame(uid, shifted(body, dy), sc.h + dy, w=sc.w)

def poster_svg(spec, sc, tl, uid):
    """Static pictogram: main frame solid, chosen ghost frames translucent."""
    n = len(tl.frames)
    ps = spec.get('poster', {})
    main = ps.get('main', n // 2); ghosts = ps.get('ghosts', [])
    body = sc.draw(uid)
    for g in ghosts:
        q, qp, qm = tl.frames[g]
        # ghosts keep their own overlays (rings straps, twist ring); the count only when the ghost is in a
        # different twist than the main frame (e.g. the first-flight turn of a vault), so labels never pile up
        tw = lambda k: tl.frames[k][2].get('twist') or tl.frames[k][2].get('twistShow')
        lab = not all(tw(k) for k in range(min(g, main), max(g, main) + 1))
        body += f'<g opacity=".55">{overlay(sc, q, qp, qm, label=lab, ring_layer="far")}</g>'
        body += V.fig(uid, q, qp, False, .16)
        body += f'<g opacity=".55">{overlay(sc, q, qp, qm, label=lab, ring_layer="near")}</g>'
    p, pel, meta = tl.frames[main]
    body += overlay(sc, p, pel, meta, ring_layer='far') + V.fig(uid, p, pel) + overlay(sc, p, pel, meta, ring_layer='near')
    dy = headroom(tl)
    return V.frame(uid, shifted(body, dy), sc.h + dy, w=sc.w)

def render(spec, sc, tl, out):
    key = spec['elementKey']; d = os.path.join(out, key + '_frames'); os.makedirs(d, exist_ok=True)
    hold = int(spec.get('holdS', 0.5) * FPS); n = len(tl.frames) + hold
    for i in range(n):
        open(f'{d}/f.svg', 'w').write(frame_svg(sc, tl, i, trails=i < len(tl.frames), uid='a'))
        subprocess.run(['rsvg-convert', '-w', '720', f'{d}/f.svg', '-o', f'{d}/f{i:03d}.png'], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{d}/f%03d.png', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', os.path.join(out, key + '.mp4')], check=True)
    picks = [round(k * (len(tl.frames) - 1) / 9) for k in range(10)]
    subprocess.run(['magick'] + [f'{d}/f{k:03d}.png' for k in picks] + ['-resize', '240x', '+append', os.path.join(out, key + '-sheet.png')], check=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    os.rmdir(d)
    open(os.path.join(out, key + '.svg'), 'w').write(poster_svg(spec, sc, tl, key[:10]))

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'out'
    if '--out' in sys.argv: args.remove(out)
    os.makedirs(out, exist_ok=True); bad = 0
    for path in args:
        spec = json.load(open(path))
        sc, tl, flights = build(spec)
        probs = validate_spec(spec, sc, tl)
        mom = momentum_warnings(tl)
        rep = dict(elementKey=spec['elementKey'], frames=len(tl.frames), seconds=round(len(tl.frames) / FPS, 2), flights=flights, problems=probs, momentum=mom)
        json.dump(rep, open(os.path.join(out, spec['elementKey'] + '-report.json'), 'w'), indent=1, ensure_ascii=False)
        print(f"{spec['elementKey']}: {len(tl.frames)} frames, flights={flights}, problems={len(probs)}, momentum={len(mom)}")
        for w in mom[:4]: print('    momentum:', w)
        for pr in probs[:8]: print('   ', pr)
        bad += bool(probs)
        if '--render' in sys.argv: render(spec, sc, tl, out)
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
