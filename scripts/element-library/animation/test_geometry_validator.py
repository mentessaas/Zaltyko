"""Regression coverage for apparatus contact and drawing bounds."""
import math
import unittest
from types import SimpleNamespace

from engine2 import Timeline, validate
from figure import Pose
from run_spec import V, build, frame_svg, overlay
from scenes import rings as rings_scene


def frame(joints, *, torso=0, **meta):
    pose = SimpleNamespace(front=True, yaw=0, torso=torso, arch=0)
    pose.joints = lambda _pelvis: joints
    timeline = Timeline()
    timeline.add(pose, (0, 0), **meta)
    return timeline


def joints(**updates):
    points = {name: (180, 80) for name in (
        'pelvis', 'mid', 'neck', 'head', 'shn', 'shf', 'eln', 'elf', 'han', 'haf',
        'hipn', 'hipf', 'knn', 'knf', 'ann', 'anf', 'ton', 'tof')}
    points.update(updates)
    return points


class GeometryValidatorTests(unittest.TestCase):
    def test_support_leg_below_beam_top_fails(self):
        beam = {'name': 'beam', 'x0': 16, 'x1': 344, 'top': 100,
                'accepts': lambda point: 16 <= point[0] <= 344 and abs(point[1]-100) <= 4}
        tl = frame(joints(han=(180, 100), ton=(180, 120)), contact=('han', (180, 100)))
        problems = validate(tl, surfaces=[beam], solids=[(16, 100, 344, 109)])
        self.assertTrue(any('ton below apparatus top' in problem for problem in problems))

    def test_explicit_under_bar_phase_allows_hanging_body(self):
        bar = {'name': 'bar', 'x0': 173, 'x1': 187, 'top': 100,
               'accepts': lambda point: abs(point[0]-180) <= 5 and abs(point[1]-100) <= 5}
        tl = frame(joints(han=(180, 100), ton=(180, 180)),
                   contact=('han', (180, 100)), underBar=True)
        problems = validate(tl, surfaces=[bar])
        self.assertFalse(any('below apparatus top' in problem for problem in problems))

    def test_contact_must_match_real_apparatus_surface(self):
        beam = {'name': 'beam', 'x0': 16, 'x1': 344, 'top': 100,
                'accepts': lambda point: 16 <= point[0] <= 344 and abs(point[1]-100) <= 4}
        tl = frame(joints(han=(180, 90)), contact=('han', (180, 90)))
        problems = validate(tl, surfaces=[beam])
        self.assertTrue(any('not on an apparatus surface' in problem for problem in problems))

    def test_both_hands_must_reach_ring_grip_points(self):
        ring = {'name': 'rings', 'x0': 155, 'x1': 205, 'top': 100,
                'accepts': lambda point: abs(point[0]-180) <= 25 and abs(point[1]-100) <= 5}
        tl = frame(joints(han=(180, 100), haf=(180, 120)), contact=('han', (180, 100)))
        problems = validate(tl, surfaces=[ring], rings=[(180, 100), (180, 100)])
        self.assertTrue(any('haf is not at a ring grip point' in problem for problem in problems))

    def test_rendered_ring_straps_terminate_at_the_hand_grips(self):
        points = joints(han=(180, 100), haf=(180, 100))
        pose = SimpleNamespace(front=False)
        pose.joints = lambda _pelvis: points
        markup = overlay(rings_scene(), pose, (0, 0), {})
        self.assertIn('x2="180.0" y2="91.0"', markup)

    def test_near_ring_and_strap_are_layered_in_front_of_the_body(self):
        scene = rings_scene()
        pose = Pose(torso=0, arm_n=(90, 90), arm_f=(270, 270), leg_n=(180, 180), leg_f=(180, 180))
        pose.facing = 1; pose.yaw = 0; pose.yaw_pivot = 'han'; pose.arch = 0
        pelvis = (180, 150)
        timeline = Timeline()
        timeline.add(pose, pelvis)
        markup = frame_svg(scene, timeline, 0, trails=False)
        body = V.fig('a', pose, pelvis)
        near_ring = overlay(scene, pose, pelvis, {}, ring_layer='near')
        self.assertLess(markup.find(body), markup.find(near_ring))

    def test_body_point_outside_canvas_fails(self):
        tl = frame(joints(ton=(361, 80)))
        problems = validate(tl, canvas=(360, 340))
        self.assertTrue(any('ton outside canvas' in problem for problem in problems))

    def test_first_frame_body_point_outside_canvas_fails(self):
        tl = frame(joints(ton=(-1, 80)))
        problems = validate(tl, canvas=(360, 340))
        self.assertTrue(any('frame 0: ton outside canvas' in problem for problem in problems))

    def test_ring_hand_hidden_by_torso_fails(self):
        points = joints(pelvis=(180, 80), neck=(180, 80), han=(180, 80), haf=(180, 80))
        tl = frame(points, contact=('han', (180, 80)))
        problems = validate(tl, rings=[(180, 80), (180, 80)])
        self.assertTrue(any('han is covered' in problem for problem in problems))

    def test_declared_rings_phase_uses_front_view(self):
        pose = {
            'torso': 0, 'arm_n': [90, 90], 'arm_f': [270, 270],
            'leg_n': [180, 180], 'leg_f': [180, 180],
        }
        spec = {'scene': 'rings', 'timeline': [{
            'contact': {'joint': 'han', 'at': 'rings', 'view': 'front', 'keys': [
                {'dt': 0, 'pose': pose}, {'dt': 0.1, 'pose': pose},
            ]},
        }]}
        _, timeline, _ = build(spec)
        self.assertTrue(all(p.front for p, _, _ in timeline.frames))

    def test_ring_surface_accepts_side_grip_and_split_front_grips(self):
        scene = rings_scene()
        ring_surface = next(surface for surface in scene.surfaces if surface['name'] == 'rings')
        self.assertTrue(ring_surface['accepts'](scene.at('rings')))
        self.assertTrue(ring_surface['accepts'](scene.at('ring_near')))
        self.assertTrue(ring_surface['accepts'](scene.at('ring_far')))

    def test_ring_swing_can_transition_from_side_to_front(self):
        pose = {
            'torso': 0, 'arm_n': [90, 90], 'arm_f': [270, 270],
            'leg_n': [180, 180], 'leg_f': [180, 180],
        }
        spec = {'scene': 'rings', 'timeline': [
            {'contact': {'joint': 'han', 'at': 'rings', 'view': 'side', 'keys': [
                {'dt': 0, 'pose': pose}, {'dt': 0.2, 'pose': pose},
            ]}},
            {'contact': {'joint': 'han', 'at': 'ring_near', 'view': 'front', 'cameraTransitionS': 0.2,
                         'keys': [{'dt': 0, 'pose': pose}, {'dt': 0.2, 'pose': pose}]}},
        ]}
        _, timeline, _ = build(spec)
        camera_values = [float(p.front) for p, _, _ in timeline.frames]
        self.assertTrue(any(0 < value < 1 for value in camera_values))
        self.assertEqual(camera_values[-1], 1)
        hand_x = [p.joints(pel)['han'][0] for p, pel, _ in timeline.frames]
        self.assertTrue(any(180 < x < 201 for x in hand_x))
        self.assertEqual(hand_x[-1], 201)

    def test_vault_runway_starts_inside_canvas_with_margin(self):
        from scenes import vault
        scene = vault()
        self.assertGreaterEqual(scene.at('floor@70')[0], 40)
        self.assertGreater(scene.w, 640)

    def test_vault_offset_shifts_surfaces_and_raw_points_together(self):
        from scenes import vault
        scene = vault()
        board = next(s for s in scene.surfaces if s['name'] == 'board')
        table = next(s for s in scene.surfaces if s['name'] == 'table')
        self.assertTrue(board['accepts'](scene.at('board@280')))
        self.assertTrue(table['accepts'](scene.at('table@420')))
        self.assertFalse(board['accepts']((250, scene.at('board')[1])))   # 250 drawn = 210 unshifted: before the board
        self.assertEqual(scene.at([300, 316]), scene.at('board@300')[:1] + (316.0,))

    def test_ring_grip_rules_skip_foot_landings(self):
        points = joints(pelvis=(180, 80), neck=(180, 80), han=(180, 80), haf=(180, 80), ton=(300, 330))
        tl = frame(points, contact=('ton', (300, 330)))
        problems = validate(tl, rings=[(180, 0), (180, 0)])
        self.assertFalse(any('ring grip' in problem for problem in problems))

    def test_torso_cover_is_checked_only_in_full_front_view(self):
        points = joints(pelvis=(180, 80), neck=(180, 80), han=(180, 80), haf=(180, 80))
        tl = frame(points, contact=('han', (180, 80)))
        tl.frames[0][0].front = 0.5
        problems = validate(tl, rings=[(180, 80), (180, 80)])
        self.assertFalse(any('is covered' in problem for problem in problems))

    def test_declared_parallel_bars_handstand_rejects_leaned_support(self):
        tl = frame(joints(pelvis=(180, 100), neck=(205, 75), han=(180, 100)), torso=60,
                   contact=('han', (180, 100)), contact_phase=0, verticalSupport=True)
        problems = validate(tl, vertical_support=True)
        self.assertTrue(any('vertical support trunk leans' in problem for problem in problems))

    def test_flight_catch_frame_inherits_declared_under_bar(self):
        straight = {'torso': 0, 'arm_n': [180, 180], 'arm_f': [180, 180], 'leg_n': [180, 180], 'leg_f': [180, 180]}
        spec = {'scene': 'parallel_bars', 'timeline': [
            {'contact': {'joint': 'han', 'at': [180, 153], 'underBar': True,
                         'keys': [{'dt': 0, 'pose': straight}, {'dt': 0.3, 'pose': dict(straight, torso=30)}]}},
            {'flight': {'rotation': 0, 'durationS': 0.4, 'land': {'joint': 'han', 'at': [190, 153], 'underBar': True},
                        'shapes': [{'u': 1.0, 'pose': straight}]}},
            {'contact': {'joint': 'han', 'at': [190, 153], 'underBar': True,
                         'keys': [{'dt': 0, 'pose': dict(straight, torso=30)}, {'dt': 0.3, 'pose': straight}]}},
        ]}
        _, timeline, _ = build(spec)
        catch = [meta for _, _, meta in timeline.frames if meta.get('contact') and 'contact_phase' not in meta]
        self.assertTrue(catch)
        self.assertTrue(all(meta.get('underBar') for meta in catch))

    def test_spread_arms_are_foreshortened_and_skip_the_sagittal_shoulder_limit(self):
        from engine2 import Timeline as TL
        pose = Pose(torso=90, arm_n=(0, 0), arm_f=(0, 0), leg_n=(270, 270), leg_f=(270, 270))
        pose.facing = 1; pose.yaw = 0; pose.yaw_pivot = 'han'; pose.arch = 0; pose.front = 0
        full = math.dist(pose.joints((0, 0))['shn'], pose.joints((0, 0))['han'])
        pose.spread = 1.0
        short = math.dist(pose.joints((0, 0))['shn'], pose.joints((0, 0))['han'])
        self.assertLess(short, 0.2 * full)
        timeline = TL(); timeline.add(pose, (180, 200))
        self.assertFalse(any('shoulder' in problem for problem in validate(timeline)))
        pose.spread = 0.0
        timeline = TL(); timeline.add(pose, (180, 200))
        self.assertTrue(any('shoulder' in problem for problem in validate(timeline)))


if __name__ == '__main__':
    unittest.main()
