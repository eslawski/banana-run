import * as THREE from 'three';
import { SEGMENT_COUNT, SEGMENT_LENGTH, curveX, curveSlope } from './constants';
import { themeAt, mulberry32, PATH_RIBBON_HALF, type ThemeDef } from './environment';

// The endless track is a ring of segments. Each segment owns a path ribbon,
// a wide ground "apron", and themed props. As the player passes a segment it
// is rebuilt at the far end of the ring — themed for whatever biome lives at
// that distance, which is how the world transforms ahead of the player.

interface Segment {
  group: THREE.Group;
  ribbon: THREE.Mesh | null;
  apron: THREE.Mesh | null;
  index: number;
}

const pathMats = new Map<ThemeDef, THREE.MeshToonMaterial>();
const apronMats = new Map<ThemeDef, THREE.MeshToonMaterial>();

function pathMat(theme: ThemeDef): THREE.MeshToonMaterial {
  let m = pathMats.get(theme);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: theme.pathColor, vertexColors: true });
    pathMats.set(theme, m);
  }
  return m;
}

function apronMat(theme: ThemeDef): THREE.MeshToonMaterial {
  let m = apronMats.get(theme);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: theme.apronColor });
    apronMats.set(theme, m);
  }
  return m;
}

/** Build a ribbon following the curve from d0 to d0+len at half-width w. */
function ribbonGeometry(d0: number, len: number, w: number, y: number, striped: boolean): THREE.BufferGeometry {
  const step = 3;
  const rows = Math.ceil(len / step) + 1;
  const positions = new Float32Array(rows * 2 * 3);
  const colors = new Float32Array(rows * 2 * 3);
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    const d = d0 + Math.min(r * step, len);
    const slope = curveSlope(d);
    const inv = 1 / Math.hypot(1, slope);
    const cx = curveX(d);
    // Right vector (1, 0, slope)/|.| in world where forward is -Z.
    const rx = inv;
    const rz = slope * inv;
    positions[(r * 2) * 3] = cx - w * rx;
    positions[(r * 2) * 3 + 1] = y;
    positions[(r * 2) * 3 + 2] = -d - w * rz;
    positions[(r * 2 + 1) * 3] = cx + w * rx;
    positions[(r * 2 + 1) * 3 + 1] = y;
    positions[(r * 2 + 1) * 3 + 2] = -d + w * rz;
    // Subtle alternating stripes across the path read as motion.
    const bright = striped && Math.floor(d / 6) % 2 === 0 ? 1 : 0.88;
    for (const v of [r * 2, r * 2 + 1]) {
      colors[v * 3] = bright;
      colors[v * 3 + 1] = bright;
      colors[v * 3 + 2] = bright;
    }
    if (r > 0) {
      const a = (r - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export class Track {
  readonly group = new THREE.Group();
  private segments: Segment[] = [];
  private nextIndex = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.reset();
  }

  reset(): void {
    for (const seg of this.segments) {
      this.disposeSegment(seg);
      this.group.remove(seg.group);
    }
    this.segments = [];
    this.nextIndex = 0;
    // Start one segment behind the player so the ground extends backwards.
    for (let i = -1; i < SEGMENT_COUNT - 1; i++) {
      const seg: Segment = { group: new THREE.Group(), ribbon: null, apron: null, index: i };
      this.group.add(seg.group);
      this.buildSegment(seg, i);
      this.segments.push(seg);
    }
    this.nextIndex = SEGMENT_COUNT - 1;
  }

  private disposeSegment(seg: Segment): void {
    seg.ribbon?.geometry.dispose();
    seg.apron?.geometry.dispose();
    seg.group.clear();
    seg.ribbon = null;
    seg.apron = null;
  }

  private buildSegment(seg: Segment, index: number): void {
    this.disposeSegment(seg);
    seg.index = index;
    const d0 = index * SEGMENT_LENGTH;
    const theme = themeAt(Math.max(0, d0 + SEGMENT_LENGTH / 2));
    const rng = mulberry32(index * 7919 + 13);

    const ribbon = new THREE.Mesh(
      ribbonGeometry(d0, SEGMENT_LENGTH, PATH_RIBBON_HALF, 0, true),
      pathMat(theme)
    );
    ribbon.receiveShadow = true;
    seg.ribbon = ribbon;
    seg.group.add(ribbon);

    const apron = new THREE.Mesh(
      ribbonGeometry(d0, SEGMENT_LENGTH, 55, -0.09, false),
      apronMat(theme)
    );
    apron.receiveShadow = true;
    seg.apron = apron;
    seg.group.add(apron);

    theme.decorate(seg.group, d0, SEGMENT_LENGTH, rng);
  }

  /** Recycle segments the player has passed to the front of the ring. */
  update(playerD: number): void {
    for (const seg of this.segments) {
      const end = (seg.index + 1) * SEGMENT_LENGTH;
      if (end < playerD - SEGMENT_LENGTH * 1.5) {
        this.buildSegment(seg, this.nextIndex++);
      }
    }
  }
}
