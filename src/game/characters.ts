import * as THREE from 'three';

// The five playable animals, built entirely from Three.js primitives with
// toon materials. Each build() returns a rig whose limb groups pivot at the
// shoulder/hip so the player controller can swing them while running.

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  tail?: THREE.Group;
  /** Wings flap instead of swinging like arms. */
  winged?: boolean;
}

export interface CharacterTraits {
  speed: number;
  jumpVel: number;
  gravity: number;
  collectRadius: number;
}

export interface CharacterDef {
  name: string;
  species: string;
  tagline: string;
  traitChip: string;
  accent: string; // UI accent color
  traits: CharacterTraits;
  build(): Rig;
}

const matCache = new Map<string, THREE.MeshToonMaterial>();

function mat(color: string, emissiveIntensity = 0): THREE.MeshToonMaterial {
  const key = `${color}:${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color });
    if (emissiveIntensity > 0) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = emissiveIntensity;
    }
    matCache.set(key, m);
  }
  return m;
}

function mesh(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function sphere(r: number, color: string, x = 0, y = 0, z = 0, wSeg = 20, hSeg = 14): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat(color), x, y, z);
}

/** A limb group pivoting at the top, with a rounded foot/hand at the end. */
function limb(length: number, radius: number, color: string, tipColor?: string): THREE.Group {
  const g = new THREE.Group();
  const bone = mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), mat(color), 0, -length / 2, 0);
  g.add(bone);
  g.add(sphere(radius * 1.35, tipColor ?? color, 0, -length, 0.02));
  return g;
}

function addEyes(head: THREE.Group, spread: number, y: number, z: number, size: number): void {
  for (const side of [-1, 1]) {
    const white = sphere(size, '#ffffff', side * spread, y, z);
    const pupil = sphere(size * 0.5, '#222222', side * spread, y, z + size * 0.62);
    head.add(white, pupil);
  }
}

function curvedTube(points: THREE.Vector3[], radius: number, color: string): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 16, radius, 8, false);
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = true;
  return m;
}

// ------------------------------------------------------------- characters

function buildMonkey(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const fur = '#8a5a33';
  const skin = '#e8bd8f';

  body.add(mesh(new THREE.CapsuleGeometry(0.36, 0.4, 8, 16), mat(fur), 0, 1.05, 0));
  const belly = sphere(0.3, skin, 0, 0.98, 0.18);
  belly.scale.set(1, 1.15, 0.65);
  body.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  body.add(head);
  head.add(sphere(0.42, fur));
  const face = sphere(0.34, skin, 0, -0.04, 0.2);
  face.scale.set(1, 0.92, 0.72);
  head.add(face);
  head.add(sphere(0.1, skin, 0, -0.12, 0.42)); // muzzle
  addEyes(head, 0.15, 0.1, 0.34, 0.09);
  for (const side of [-1, 1]) {
    head.add(sphere(0.15, fur, side * 0.42, 0.08, 0));
    head.add(sphere(0.09, skin, side * 0.46, 0.08, 0.04));
  }
  // Jaunty red cap
  const cap = mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mat('#e0413c'), 0, 0.26, 0);
  head.add(cap);
  head.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.05, 10), mat('#ffd028'), 0, 0.42, 0));

  const armL = limb(0.5, 0.09, fur, skin);
  armL.position.set(-0.4, 1.32, 0);
  const armR = limb(0.5, 0.09, fur, skin);
  armR.position.set(0.4, 1.32, 0);
  const legL = limb(0.55, 0.11, fur, skin);
  legL.position.set(-0.18, 0.62, 0);
  const legR = limb(0.55, 0.11, fur, skin);
  legR.position.set(0.18, 0.62, 0);
  body.add(armL, armR, legL, legR);

  const tail = new THREE.Group();
  tail.position.set(0, 0.85, -0.3);
  tail.add(
    curvedTube(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.1, -0.35),
        new THREE.Vector3(0, 0.25, -0.6),
        new THREE.Vector3(0, 0.6, -0.5),
      ],
      0.055,
      fur
    )
  );
  body.add(tail);

  return { root, body, head, armL, armR, legL, legR, tail };
}

function buildToucan(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const feathers = '#2b2b34';

  const torso = sphere(0.42, feathers, 0, 1.05, 0);
  torso.scale.set(0.9, 1.15, 1);
  body.add(torso);
  const chest = sphere(0.34, '#fff4d6', 0, 0.95, 0.2);
  chest.scale.set(0.85, 1, 0.6);
  body.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 1.66, 0.05);
  body.add(head);
  head.add(sphere(0.34, feathers));
  const cheek = sphere(0.28, '#ffd94f', 0, 0, 0.14);
  cheek.scale.set(0.95, 0.85, 0.7);
  head.add(cheek);
  addEyes(head, 0.14, 0.12, 0.24, 0.08);
  // The famous beak: two stacked cones pointing forward.
  const beakTop = mesh(new THREE.ConeGeometry(0.16, 0.75, 12), mat('#ff8c1a'), 0, 0.02, 0.6);
  beakTop.rotation.x = Math.PI / 2;
  beakTop.scale.set(1, 1, 0.75);
  head.add(beakTop);
  const beakTip = sphere(0.09, '#e0413c', 0, 0.02, 0.94);
  head.add(beakTip);
  const beakBottom = mesh(new THREE.ConeGeometry(0.11, 0.5, 12), mat('#ffb01a'), 0, -0.1, 0.5);
  beakBottom.rotation.x = Math.PI / 2;
  head.add(beakBottom);

  // Wings pivot at the shoulder and flap.
  const armL = new THREE.Group();
  armL.position.set(-0.36, 1.25, 0);
  const wingL = sphere(0.3, feathers, -0.18, -0.12, -0.05);
  wingL.scale.set(0.9, 1.5, 0.35);
  wingL.rotation.z = 0.35;
  armL.add(wingL);
  const armR = new THREE.Group();
  armR.position.set(0.36, 1.25, 0);
  const wingR = sphere(0.3, feathers, 0.18, -0.12, -0.05);
  wingR.scale.set(0.9, 1.5, 0.35);
  wingR.rotation.z = -0.35;
  armR.add(wingR);

  const legL = limb(0.45, 0.07, '#ff8c1a');
  legL.position.set(-0.15, 0.62, 0);
  const legR = limb(0.45, 0.07, '#ff8c1a');
  legR.position.set(0.15, 0.62, 0);
  body.add(armL, armR, legL, legR);

  const tail = new THREE.Group();
  tail.position.set(0, 0.9, -0.38);
  const tf = mesh(new THREE.BoxGeometry(0.3, 0.08, 0.5), mat(feathers), 0, 0, -0.2);
  tf.rotation.x = -0.5;
  tail.add(tf);
  const tf2 = mesh(new THREE.BoxGeometry(0.16, 0.06, 0.4), mat('#3f6ce0'), 0, 0.05, -0.28);
  tf2.rotation.x = -0.5;
  tail.add(tf2);
  body.add(tail);

  return { root, body, head, armL, armR, legL, legR, tail, winged: true };
}

function buildTiger(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const orange = '#f2892b';
  const cream = '#ffe9c4';

  body.add(mesh(new THREE.CapsuleGeometry(0.38, 0.38, 8, 16), mat(orange), 0, 1.05, 0));
  const belly = sphere(0.3, cream, 0, 0.98, 0.26);
  belly.scale.set(0.9, 1.05, 0.55);
  body.add(belly);
  // Back stripes
  for (let i = 0; i < 3; i++) {
    const stripe = mesh(new THREE.BoxGeometry(0.5, 0.09, 0.1), mat('#3a2a1a'), 0, 1.28 - i * 0.2, -0.3);
    stripe.rotation.x = 0.25;
    body.add(stripe);
  }
  // Side stripes so he reads as a tiger from the front too.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const stripe = mesh(new THREE.BoxGeometry(0.06, 0.22, 0.09), mat('#3a2a1a'), side * 0.36, 1.2 - i * 0.24, 0.08);
      stripe.rotation.z = side * -0.35;
      body.add(stripe);
    }
  }

  const head = new THREE.Group();
  head.position.set(0, 1.74, 0.02);
  body.add(head);
  head.add(sphere(0.44, orange));
  const muzzle = sphere(0.2, cream, 0, -0.14, 0.34);
  muzzle.scale.set(1.25, 0.8, 0.8);
  head.add(muzzle);
  head.add(sphere(0.055, '#d4386a', 0, -0.02, 0.5)); // little pink nose
  addEyes(head, 0.17, 0.1, 0.36, 0.09);
  // Forehead stripes — the classic tiger brow.
  for (let i = 0; i < 3; i++) {
    const brow = mesh(
      new THREE.BoxGeometry(i === 1 ? 0.07 : 0.06, 0.16 - (i === 1 ? 0 : 0.04), 0.05),
      mat('#3a2a1a'),
      (i - 1) * 0.13,
      0.31,
      0.3
    );
    brow.rotation.x = -0.5;
    head.add(brow);
  }
  for (const side of [-1, 1]) {
    head.add(sphere(0.14, orange, side * 0.3, 0.35, 0));
    head.add(sphere(0.08, '#ffb9c8', side * 0.32, 0.37, 0.06));
    // Whisker stripes on each cheek.
    for (let i = 0; i < 2; i++) {
      const cs = mesh(new THREE.BoxGeometry(0.13, 0.035, 0.04), mat('#3a2a1a'), side * 0.36, -0.02 - i * 0.08, 0.3);
      cs.rotation.z = side * (-0.25 - i * 0.15);
      head.add(cs);
    }
  }

  const armL = limb(0.5, 0.1, orange, cream);
  armL.position.set(-0.42, 1.3, 0);
  const armR = limb(0.5, 0.1, orange, cream);
  armR.position.set(0.42, 1.3, 0);
  const legL = limb(0.55, 0.12, orange, cream);
  legL.position.set(-0.19, 0.62, 0);
  const legR = limb(0.55, 0.12, orange, cream);
  legR.position.set(0.19, 0.62, 0);
  body.add(armL, armR, legL, legR);

  const tail = new THREE.Group();
  tail.position.set(0, 0.82, -0.32);
  tail.add(
    curvedTube(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -0.05, -0.4),
        new THREE.Vector3(0, 0.3, -0.65),
      ],
      0.06,
      orange
    )
  );
  tail.add(sphere(0.08, '#3a2a1a', 0, 0.32, -0.66));
  body.add(tail);

  return { root, body, head, armL, armR, legL, legR, tail };
}

function buildFrog(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const green = '#58c24f';
  const pale = '#d8f0a8';

  // Frogs are one big friendly blob: head merges into body.
  const blob = sphere(0.52, green, 0, 1.1, 0);
  blob.scale.set(1.05, 0.95, 0.9);
  body.add(blob);
  const bellyF = sphere(0.4, pale, 0, 0.95, 0.22);
  bellyF.scale.set(0.95, 0.85, 0.6);
  body.add(bellyF);

  const head = new THREE.Group();
  head.position.set(0, 1.42, 0.1);
  body.add(head);
  // Eye bumps on top
  for (const side of [-1, 1]) {
    head.add(sphere(0.17, green, side * 0.24, 0.16, 0));
    head.add(sphere(0.12, '#ffffff', side * 0.24, 0.18, 0.08));
    head.add(sphere(0.06, '#222222', side * 0.24, 0.19, 0.17));
  }
  // Wide smile
  const smile = mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 20, Math.PI * 0.9), mat('#2c6e2a'), 0, -0.1, 0.38);
  smile.rotation.set(0.25, 0, Math.PI + Math.PI * 0.05);
  head.add(smile);
  for (const side of [-1, 1]) {
    head.add(sphere(0.05, '#ff9db5', side * 0.3, -0.06, 0.34)); // blush
  }

  const armL = limb(0.4, 0.08, green, pale);
  armL.position.set(-0.44, 1.05, 0.1);
  const armR = limb(0.4, 0.08, green, pale);
  armR.position.set(0.44, 1.05, 0.1);
  // Big springy legs
  const legL = limb(0.6, 0.12, green, pale);
  legL.position.set(-0.24, 0.66, 0);
  const legR = limb(0.6, 0.12, green, pale);
  legR.position.set(0.24, 0.66, 0);
  body.add(armL, armR, legL, legR);

  return { root, body, head, armL, armR, legL, legR };
}

function buildElephant(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const gray = '#94a7c9';
  const pale = '#c8d4ea';

  body.add(mesh(new THREE.CapsuleGeometry(0.42, 0.4, 8, 16), mat(gray), 0, 1.05, 0));
  const bellyE = sphere(0.34, pale, 0, 0.95, 0.2);
  bellyE.scale.set(0.95, 1.05, 0.6);
  body.add(bellyE);

  const head = new THREE.Group();
  head.position.set(0, 1.76, 0.04);
  body.add(head);
  head.add(sphere(0.44, gray));
  addEyes(head, 0.17, 0.12, 0.36, 0.08);
  // Big floppy ears
  for (const side of [-1, 1]) {
    const ear = sphere(0.3, gray, side * 0.44, 0.06, -0.06);
    ear.scale.set(0.5, 1.15, 0.85);
    ear.rotation.z = side * -0.25;
    head.add(ear);
    const inner = sphere(0.22, '#e8b8c8', side * 0.5, 0.06, -0.02);
    inner.scale.set(0.32, 1, 0.72);
    inner.rotation.z = side * -0.25;
    head.add(inner);
  }
  // Trunk curving down and out — Ellie's banana-grabbing superpower.
  head.add(
    curvedTube(
      [
        new THREE.Vector3(0, -0.05, 0.36),
        new THREE.Vector3(0, -0.3, 0.5),
        new THREE.Vector3(0, -0.5, 0.42),
        new THREE.Vector3(0, -0.58, 0.58),
      ],
      0.09,
      gray
    )
  );
  for (const side of [-1, 1]) {
    const tusk = mesh(new THREE.ConeGeometry(0.05, 0.22, 8), mat('#fff8e8'), side * 0.18, -0.24, 0.34);
    tusk.rotation.x = 0.9;
    head.add(tusk);
  }

  const armL = limb(0.48, 0.12, gray, pale);
  armL.position.set(-0.46, 1.28, 0);
  const armR = limb(0.48, 0.12, gray, pale);
  armR.position.set(0.46, 1.28, 0);
  const legL = limb(0.52, 0.15, gray, pale);
  legL.position.set(-0.22, 0.6, 0);
  const legR = limb(0.52, 0.15, gray, pale);
  legR.position.set(0.22, 0.6, 0);
  body.add(armL, armR, legL, legR);

  const tail = new THREE.Group();
  tail.position.set(0, 0.9, -0.4);
  tail.add(curvedTube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.3, -0.12)], 0.035, gray));
  tail.add(sphere(0.06, '#6a7a9a', 0, -0.32, -0.13));
  body.add(tail);

  return { root, body, head, armL, armR, legL, legR, tail };
}

export const CHARACTERS: CharacterDef[] = [
  {
    name: 'Miko',
    species: 'the Monkey',
    tagline: 'Bananas are basically his whole personality.',
    traitChip: '⭐ All-Around Awesome',
    accent: '#e0413c',
    traits: { speed: 1, jumpVel: 1, gravity: 1, collectRadius: 1 },
    build: buildMonkey,
  },
  {
    name: 'Pip',
    species: 'the Toucan',
    tagline: 'Flaps those wings for slow, floaty jumps.',
    traitChip: '🪶 Floaty Jumps',
    accent: '#ff8c1a',
    traits: { speed: 1, jumpVel: 0.94, gravity: 0.7, collectRadius: 1 },
    build: buildToucan,
  },
  {
    name: 'Raja',
    species: 'the Tiger Cub',
    tagline: 'Zoom zoom! The fastest paws in the jungle.',
    traitChip: '⚡ Super Speedy',
    accent: '#f2892b',
    traits: { speed: 1.09, jumpVel: 1, gravity: 1, collectRadius: 1 },
    build: buildTiger,
  },
  {
    name: 'Bounce',
    species: 'the Frog',
    tagline: 'Boing! Jumps higher than anyone else.',
    traitChip: '🚀 Mega Jumper',
    accent: '#58c24f',
    traits: { speed: 1, jumpVel: 1.18, gravity: 1, collectRadius: 1 },
    build: buildFrog,
  },
  {
    name: 'Ellie',
    species: 'the Elephant',
    tagline: 'That trunk scoops up bananas from far away.',
    traitChip: '🌟 Trunk Grabber',
    accent: '#94a7c9',
    traits: { speed: 0.97, jumpVel: 1, gravity: 1, collectRadius: 1.35 },
    build: buildElephant,
  },
];
