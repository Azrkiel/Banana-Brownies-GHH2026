"""NMM twin: explicit eight XYZ face points or tracker brow/headYaw; never XY174 slices."""
import math


def _point(p):
    return [p[k] for k in ('x', 'y', 'z')]


def face_ratios(face):
    if face is None or len(face) != 8 or any(p.get('visibility', 1) < .5 or not all(math.isfinite(v) for v in _point(p)) for p in face):
        return None
    pts = [_point(p) for p in face]
    dist = math.dist
    width = dist(pts[1], pts[2])
    if width < .001:
        return None
    mid = [(a+b)/2 for a,b in zip(pts[1], pts[2])]
    return dict(raise_ratio=(dist(pts[6],pts[1])+dist(pts[7],pts[2]))/(2*width),
        furrow=(dist(pts[6],pts[0])+dist(pts[7],pts[0])+dist(pts[6],pts[7]))/width,
        yaw=sum((a-b)*(r-l) for a,b,l,r in zip(pts[0],mid,pts[1],pts[2]))/(width*width), width=width)


def headshake_score(values):
    if len(values) < 12:
        return 0
    signs = [1 if v > .03 else -1 for v in values if abs(v) > .03]
    crossings = sum(a != b for a,b in zip(signs,signs[1:]))
    return crossings if crossings >= 2 and max(values)-min(values) > .12 else 0


class NMMDetector:
    def __init__(self):
        self.reset()

    def reset(self):
        self.source, self.neutral, self.last_t = '', 0, None
        self.mean, self.variance = [0.,0.], [0.,0.]
        self.tail, self.yaw, self.widths = [], [], []

    def push(self, sample):
        t = sample['t']
        if not math.isfinite(t) or (self.last_t is not None and t <= self.last_t):
            self.reset()
            return []
        dt = 1000/30 if self.last_t is None else min(t-self.last_t,5000)
        if dt > 250:
            self.tail, self.yaw, self.widths = [], [], []
        self.last_t = t
        f, b = face_ratios(sample.get('face')), sample.get('brow')
        values = [f['raise_ratio'], f['furrow']] if f else [b['raise'],1-b['furrow']] if b and all(math.isfinite(b[k]) for k in ('raise','furrow')) else None
        source = 'face' if f else 'blendshape' if values else ''
        if source and source != self.source:
            self.source, self.neutral, self.tail, self.widths = source, 0, [], []
        self.widths = (self.widths+[f['width']])[-10:] if f else []
        mean = sum(self.widths)/max(len(self.widths),1)
        stable = not f or math.sqrt(sum((v-mean)**2 for v in self.widths)/len(self.widths)) < .015
        if sample['rest']:
            self.tail, self.yaw = [], []
            if values and stable:
                alpha = 1-math.exp(-dt/5000)
                if not self.neutral:
                    self.mean, self.variance = values[:], [0.,0.]
                else:
                    for i,v in enumerate(values):
                        d = v-self.mean[i]
                        self.mean[i] += alpha*d
                        self.variance[i] = (1-alpha)*(self.variance[i]+alpha*d*d)
                self.neutral += 1
            return []
        self.tail = (self.tail+[values])[-10:] if values and stable and self.neutral >= 30 else []
        yaw = f['yaw'] if f else sample.get('headYaw')
        self.yaw = (self.yaw+[yaw])[-24:] if yaw is not None and math.isfinite(yaw) else []
        tags = []
        if len(self.tail) == 10:
            raised = all(v[0] > self.mean[0]+2*max(math.sqrt(self.variance[0]),.02) for v in self.tail)
            furrowed = all(v[1] < self.mean[1]-1.8*max(math.sqrt(self.variance[1]),.02) for v in self.tail)
            if furrowed:
                tags.append('Q-WH')
            elif raised:
                tags.append('Q-YN')
        if headshake_score(self.yaw):
            tags.append('NEG')
        return tags
