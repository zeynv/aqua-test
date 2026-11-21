import * as THREE from 'three';
import { ObstacleSphere, WATER_TOP_Y } from '../types/aquarium';
import type { ProceduralTextureSet } from './proceduralTextures';
import { applyCausticsToMaterial, CausticsUniforms, groundHeightAt } from './substrate';

export interface PlantUniforms {
  uTime: { value: number };
  uFlowStrength: { value: number };
}

export interface AquascapeBuildResult {
  group: THREE.Group;
  obstacles: ObstacleSphere[];
  update: (elapsed: number, flowStrength: number) => void;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Injects smooth current-driven underwater plant sway into MeshStandardMaterial via onBeforeCompile.
 * Leaves bend more toward their tips (vUv.y near 1) and lean gently with the Lily Pipe current (-X).
 */
function applyPlantSway(
  material: THREE.MeshStandardMaterial,
  plantUniforms: PlantUniforms,
  swayAmp = 0.24,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = plantUniforms.uTime;
    shader.uniforms.uFlowStrength = plantUniforms.uFlowStrength;
    shader.uniforms.uSwayAmp = { value: swayAmp };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uFlowStrength;
        uniform float uSwayAmp;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float bendFactor = pow(clamp(uv.y, 0.0, 1.0), 1.65);
        vec4 swayLocal = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          swayLocal = instanceMatrix * swayLocal;
        #endif
        vec4 wPos = modelMatrix * swayLocal;
        float phase = wPos.x * 0.95 + wPos.z * 1.25;
        float wave1 = sin(uTime * (1.25 + uFlowStrength * 1.6) + phase);
        float wave2 = cos(uTime * (1.9 + uFlowStrength * 1.4) + phase * 1.4);
        float currentLean = -0.18 * uFlowStrength;
        transformed.x += (wave1 * uSwayAmp * (0.45 + uFlowStrength * 0.85) + currentLean) * bendFactor;
        transformed.z += wave2 * uSwayAmp * 0.55 * (0.45 + uFlowStrength * 0.85) * bendFactor;`,
      );
  };
  material.customProgramCacheKey = () => `aqua-plant-sway-${swayAmp.toFixed(2)}`;
}

/**
 * Creates a faceted, striated Seiryu / Dragon Stone geometry by displacing an icosahedron
 * with deterministic multi-frequency ridged strata.
 */
function createSeiryuRockGeometry(
  rx: number,
  ry: number,
  rz: number,
  seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const strata = Math.sin(v.y * 5.8 + v.x * 2.4 + seed) * 0.12;
    const crag =
      Math.sin(v.x * 3.7 + seed * 1.7) *
      Math.cos(v.z * 3.2 - seed * 0.9) *
      0.16;
    const ridge = Math.abs(Math.sin(v.x * 2.5 - v.y * 3.1 + seed)) * 0.11;
    const scale = 1.0 + strata + crag + ridge;

    // Slightly flatten bottom so rock anchors solidly into substrate
    const yScale = v.y < -0.35 ? 0.65 : 1.0;
    pos.setXYZ(i, v.x * rx * scale, v.y * ry * scale * yScale, v.z * rz * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a graceful tapered curved aquatic leaf blade geometry with bottom pivot at y = 0.
 */
function createLeafBladeGeometry(
  length: number,
  maxWidth: number,
  arch: number,
  segsY = 12,
): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(maxWidth, length, 2, segsY);
  // Shift so base is at y = 0 and tip is at y = length
  geo.translate(0, length / 2, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp(y / length, 0, 1);

    // Taper width organically: narrow stem at base, broad mid-blade, pointed tip
    const widthProfile = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const nx = x * Math.max(0.06, widthProfile);

    // Subtle cupped cross-section and graceful arch backward
    const cupZ = (1 - Math.abs(x / (maxWidth * 0.5))) * 0.03 * widthProfile;
    const archZ = Math.pow(t, 1.8) * arch;

    pos.setXYZ(i, nx, y, archZ + cupZ);
    uv.setY(i, t);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildAquascape(
  textures: ProceduralTextureSet,
  causticsUniforms: CausticsUniforms,
): AquascapeBuildResult {
  const group = new THREE.Group();
  group.name = 'Aquascape';

  const obstacles: ObstacleSphere[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  const trackMat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    return m;
  };

  const plantUniforms: PlantUniforms = {
    uTime: { value: 0 },
    uFlowStrength: { value: 0.72 },
  };

  // =========================================================
  // 1. SEIRYU / DRAGON STONE HARDSCAPE FORMATIONS (Golden Ratio)
  // =========================================================
  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.rockColor,
      bumpMap: textures.rockBump,
      bumpScale: 0.065,
      roughness: 0.76,
      metalness: 0.08,
    }),
  );
  applyCausticsToMaterial(rockMat, causticsUniforms, 0.95);

  const rockSpecs: Array<{
    x: number;
    z: number;
    rx: number;
    ry: number;
    rz: number;
    rotY: number;
    tiltZ: number;
    seed: number;
  }> = [
    // Left Hero Mountain Peak (Oyaishi)
    { x: -2.65, z: -0.75, rx: 1.05, ry: 1.48, rz: 0.85, rotY: 0.4, tiltZ: -0.18, seed: 1.1 },
    // Left Secondary Companion Stone (Fukuishi)
    { x: -1.55, z: -0.35, rx: 0.72, ry: 0.82, rz: 0.62, rotY: 1.2, tiltZ: -0.25, seed: 2.3 },
    // Left Foreground Accent Stone (Soeishi)
    { x: -3.65, z: 0.25, rx: 0.66, ry: 0.54, rz: 0.52, rotY: 2.1, tiltZ: 0.14, seed: 3.7 },
    // Mid-left base rock
    { x: -2.15, z: 0.65, rx: 0.52, ry: 0.36, rz: 0.45, rotY: 0.8, tiltZ: 0.08, seed: 4.5 },
    // Right Terrace Main Stone
    { x: 2.75, z: -0.88, rx: 0.92, ry: 1.18, rz: 0.74, rotY: -0.5, tiltZ: 0.22, seed: 5.9 },
    // Right Front Supporting Stone
    { x: 1.85, z: -0.18, rx: 0.58, ry: 0.64, rz: 0.54, rotY: 1.7, tiltZ: 0.16, seed: 7.2 },
    // Right Far Accent
    { x: 3.72, z: -0.12, rx: 0.55, ry: 0.48, rz: 0.48, rotY: -1.1, tiltZ: -0.12, seed: 8.4 },
    // Subtle sand-path border rock
    { x: 0.95, z: 0.78, rx: 0.42, ry: 0.26, rz: 0.36, rotY: 0.5, tiltZ: 0.05, seed: 9.8 },
  ];

  for (const spec of rockSpecs) {
    const geo = trackGeo(createSeiryuRockGeometry(spec.rx, spec.ry, spec.rz, spec.seed));
    const mesh = new THREE.Mesh(geo, rockMat);
    const gy = groundHeightAt(spec.x, spec.z);
    const centerY = gy + spec.ry * 0.48;
    mesh.position.set(spec.x, centerY, spec.z);
    mesh.rotation.set(0.06, spec.rotY, spec.tiltZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    obstacles.push({
      x: spec.x,
      y: centerY,
      z: spec.z,
      r: Math.max(spec.rx, spec.ry * 0.85, spec.rz) + 0.28,
    });
  }

  // =========================================================
  // 2. SCULPTED SPIDERWOOD DRIFTWOOD ROOT SYSTEM
  // =========================================================
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.woodColor,
      bumpMap: textures.woodBump,
      bumpScale: 0.05,
      roughness: 0.82,
      metalness: 0.03,
    }),
  );
  applyCausticsToMaterial(woodMat, causticsUniforms, 1.15);

  const buildBranch = (
    points: THREE.Vector3[],
    radiusStart: number,
    radiusEnd: number,
    tubularSegs = 28,
  ): void => {
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = trackGeo(new THREE.TubeGeometry(curve, tubularSegs, 1, 10, false));
    // Taper tube smoothly from radiusStart to radiusEnd
    const pos = tubeGeo.attributes.position as THREE.BufferAttribute;
    const center = new THREE.Vector3();
    const vert = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const ringIndex = Math.floor(i / 11);
      const t = THREE.MathUtils.clamp(ringIndex / tubularSegs, 0, 1);
      curve.getPointAt(t, center);
      vert.fromBufferAttribute(pos, i);
      const r = THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(t, 0.85));
      vert.sub(center).multiplyScalar(r).add(center);
      pos.setXYZ(i, vert.x, vert.y, vert.z);
    }
    tubeGeo.computeVertexNormals();
    const mesh = new THREE.Mesh(tubeGeo, woodMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Add mid-branch collision spheres for fish avoidance
    const mid = curve.getPointAt(0.45);
    obstacles.push({ x: mid.x, y: mid.y, z: mid.z, r: Math.max(0.32, radiusStart * 1.45) });
  };

  const woodBaseY = groundHeightAt(-2.2, -0.5);
  // Primary sweeping trunk curving from left mountain across center-mid water
  buildBranch(
    [
      new THREE.Vector3(-2.6, woodBaseY - 0.1, -0.55),
      new THREE.Vector3(-1.7, woodBaseY + 0.65, -0.35),
      new THREE.Vector3(-0.65, woodBaseY + 1.25, -0.15),
      new THREE.Vector3(0.45, woodBaseY + 1.68, -0.32),
      new THREE.Vector3(1.55, woodBaseY + 1.95, -0.52),
    ],
    0.26,
    0.04,
    34,
  );
  // Upper reaching arch branch
  buildBranch(
    [
      new THREE.Vector3(-1.4, woodBaseY + 0.82, -0.3),
      new THREE.Vector3(-0.85, woodBaseY + 1.55, 0.12),
      new THREE.Vector3(-0.15, woodBaseY + 2.25, 0.25),
      new THREE.Vector3(0.55, woodBaseY + 2.68, 0.15),
    ],
    0.16,
    0.025,
    24,
  );
  // Lower arching root dipping toward foreground sand
  buildBranch(
    [
      new THREE.Vector3(-1.8, woodBaseY + 0.58, -0.25),
      new THREE.Vector3(-1.1, woodBaseY + 0.55, 0.45),
      new THREE.Vector3(-0.45, groundHeightAt(-0.45, 0.92) + 0.14, 0.92),
      new THREE.Vector3(0.12, groundHeightAt(0.12, 1.15) + 0.05, 1.15),
    ],
    0.15,
    0.032,
    24,
  );
  // Rear gnarled spider-finger twig
  buildBranch(
    [
      new THREE.Vector3(-0.45, woodBaseY + 1.32, -0.18),
      new THREE.Vector3(0.18, woodBaseY + 1.52, -0.82),
      new THREE.Vector3(0.88, woodBaseY + 1.98, -1.2),
    ],
    0.1,
    0.022,
    20,
  );
  // Left anchor root gripping the mountain rock
  buildBranch(
    [
      new THREE.Vector3(-2.35, woodBaseY + 0.22, -0.45),
      new THREE.Vector3(-2.85, woodBaseY + 0.12, 0.15),
      new THREE.Vector3(-3.18, groundHeightAt(-3.18, 0.65) + 0.05, 0.65),
    ],
    0.17,
    0.04,
    18,
  );

  // =========================================================
  // 3. LUSH GPU-SWAYING AQUATIC FLORA
  // =========================================================
  const rand = seededRand(7741);

  const greenLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.leafGreenColor,
      color: new THREE.Color('#6ec963'),
      roughness: 0.48,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
  );
  applyPlantSway(greenLeafMat, plantUniforms, 0.28);

  const deepAnubiasMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.leafGreenColor,
      color: new THREE.Color('#2d7a42'),
      roughness: 0.34,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  applyPlantSway(deepAnubiasMat, plantUniforms, 0.09);

  const redPlantMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.leafRedColor,
      color: new THREE.Color('#d9594c'),
      roughness: 0.46,
      metalness: 0.02,
      side: THREE.DoubleSide,
    }),
  );
  applyPlantSway(redPlantMat, plantUniforms, 0.24);

  // 3a. Tall Background Vallisneria Ribbons (InstancedMesh for crisp performance!)
  const valGeo = trackGeo(createLeafBladeGeometry(3.2, 0.16, 0.45, 14));
  const valCount = 54;
  const valMesh = new THREE.InstancedMesh(valGeo, greenLeafMat, valCount);
  valMesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const valClusters: Array<[number, number, number]> = [
    [-4.35, -1.65, 16],
    [-3.15, -1.85, 12],
    [3.85, -1.62, 16],
    [2.15, -1.85, 10],
  ];
  let idx = 0;
  for (const [cx, cz, count] of valClusters) {
    for (let k = 0; k < count && idx < valCount; k++) {
      const px = cx + (rand() - 0.5) * 1.15;
      const pz = cz + (rand() - 0.5) * 0.65;
      const gy = groundHeightAt(px, pz) - 0.04;
      const sy = 0.65 + rand() * 0.52;
      dummy.position.set(px, gy, pz);
      dummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.22);
      dummy.scale.set(0.85 + rand() * 0.45, sy, 1);
      dummy.updateMatrix();
      valMesh.setMatrixAt(idx, dummy.matrix);
      col.setHSL(0.31 + (rand() - 0.5) * 0.04, 0.58, 0.36 + rand() * 0.16);
      valMesh.setColorAt(idx, col);
      idx++;
    }
  }
  valMesh.instanceMatrix.needsUpdate = true;
  if (valMesh.instanceColor) valMesh.instanceColor.needsUpdate = true;
  group.add(valMesh);

  // 3b. Lush Amazon Sword (Echinodorus) Rosettes
  const swordBladeGeo = trackGeo(createLeafBladeGeometry(1.75, 0.42, 0.52, 12));
  const swordCenters: Array<[number, number, number]> = [
    [-3.65, -0.85, 12],
    [3.35, -0.82, 11],
    [-0.55, -1.68, 10],
  ];
  const totalSwordLeaves = swordCenters.reduce((sum, c) => sum + c[2], 0);
  const swordMesh = new THREE.InstancedMesh(swordBladeGeo, greenLeafMat, totalSwordLeaves);
  swordMesh.frustumCulled = false;

  let sIdx = 0;
  for (const [cx, cz, count] of swordCenters) {
    const gy = groundHeightAt(cx, cz) - 0.03;
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const tilt = 0.18 + (k % 3) * 0.16 + rand() * 0.08;
      const scale = 0.72 + rand() * 0.45;
      dummy.position.set(cx + Math.cos(angle) * 0.08, gy, cz + Math.sin(angle) * 0.08);
      dummy.rotation.set(tilt, angle, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      swordMesh.setMatrixAt(sIdx, dummy.matrix);
      col.setHSL(0.33 + (rand() - 0.5) * 0.03, 0.56, 0.34 + rand() * 0.14);
      swordMesh.setColorAt(sIdx, col);
      sIdx++;
    }
  }
  swordMesh.instanceMatrix.needsUpdate = true;
  if (swordMesh.instanceColor) swordMesh.instanceColor.needsUpdate = true;
  group.add(swordMesh);

  // 3c. Crimson Rotala / Ludwigia Stem Bushes (Warm ruby botanical accent!)
  const redLeafGeo = trackGeo(createLeafBladeGeometry(2.15, 0.24, 0.32, 10));
  const redCount = 34;
  const redMesh = new THREE.InstancedMesh(redLeafGeo, redPlantMat, redCount);
  redMesh.frustumCulled = false;

  const redSpots: Array<[number, number, number]> = [
    [-1.65, -1.65, 18],
    [1.35, -1.65, 16],
  ];
  let rIdx = 0;
  for (const [cx, cz, count] of redSpots) {
    for (let k = 0; k < count && rIdx < redCount; k++) {
      const px = cx + (rand() - 0.5) * 1.05;
      const pz = cz + (rand() - 0.5) * 0.58;
      const gy = groundHeightAt(px, pz) - 0.03;
      const sc = 0.65 + rand() * 0.55;
      dummy.position.set(px, gy, pz);
      dummy.rotation.set(0.12 + rand() * 0.24, rand() * Math.PI * 2, (rand() - 0.5) * 0.22);
      dummy.scale.set(sc * 0.9, sc, sc);
      dummy.updateMatrix();
      redMesh.setMatrixAt(rIdx, dummy.matrix);
      col.setHSL(0.015 + (rand() - 0.5) * 0.03, 0.68, 0.38 + rand() * 0.16);
      redMesh.setColorAt(rIdx, col);
      rIdx++;
    }
  }
  redMesh.instanceMatrix.needsUpdate = true;
  if (redMesh.instanceColor) redMesh.instanceColor.needsUpdate = true;
  group.add(redMesh);

  // 3d. Anubias Broad Leaves tucked onto driftwood & rock crevices
  const anubiasGeo = trackGeo(createLeafBladeGeometry(0.62, 0.34, 0.24, 8));
  const anubiasAnchors: Array<[number, number, number]> = [
    [-2.05, woodBaseY + 0.52, -0.1],
    [-1.15, woodBaseY + 1.05, -0.15],
    [-2.95, groundHeightAt(-2.95, 0.1) + 0.26, 0.1],
    [2.15, groundHeightAt(2.15, -0.35) + 0.36, -0.35],
    [1.55, groundHeightAt(1.55, 0.15) + 0.18, 0.15],
  ];
  const anubiasPerAnchor = 6;
  const anubiasMesh = new THREE.InstancedMesh(
    anubiasGeo,
    deepAnubiasMat,
    anubiasAnchors.length * anubiasPerAnchor,
  );
  anubiasMesh.frustumCulled = false;

  let aIdx = 0;
  for (const [ax, ay, az] of anubiasAnchors) {
    for (let k = 0; k < anubiasPerAnchor; k++) {
      const ang = (k / anubiasPerAnchor) * Math.PI * 2 + rand() * 0.4;
      const sc = 0.72 + rand() * 0.42;
      dummy.position.set(ax + Math.cos(ang) * 0.08, ay, az + Math.sin(ang) * 0.08);
      dummy.rotation.set(0.55 + rand() * 0.42, ang, 0);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      anubiasMesh.setMatrixAt(aIdx, dummy.matrix);
      col.setHSL(0.36 + (rand() - 0.5) * 0.03, 0.52, 0.22 + rand() * 0.1);
      anubiasMesh.setColorAt(aIdx, col);
      aIdx++;
    }
  }
  anubiasMesh.instanceMatrix.needsUpdate = true;
  if (anubiasMesh.instanceColor) anubiasMesh.instanceColor.needsUpdate = true;
  group.add(anubiasMesh);

  // 3e. Lush Foreground Monte Carlo / Java Moss Cushions
  const mossGeo = trackGeo(new THREE.IcosahedronGeometry(0.24, 2));
  mossGeo.scale(1.35, 0.42, 1.15);
  const mossMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#4f9c3e',
      roughness: 0.88,
      metalness: 0.0,
    }),
  );
  applyCausticsToMaterial(mossMat, causticsUniforms, 1.25);

  const mossClusters: Array<[number, number, number]> = [
    [-3.1, 0.85, 10],
    [-1.4, 0.95, 8],
    [2.5, 0.72, 10],
    [3.8, 0.65, 8],
    [-2.2, -0.05, 8],
  ];
  const mossTotal = mossClusters.reduce((s, c) => s + c[2], 0);
  const mossMesh = new THREE.InstancedMesh(mossGeo, mossMat, mossTotal);
  let mIdx = 0;
  for (const [mx, mz, count] of mossClusters) {
    for (let k = 0; k < count; k++) {
      const px = mx + (rand() - 0.5) * 1.15;
      const pz = mz + (rand() - 0.5) * 0.72;
      const gy = groundHeightAt(px, pz);
      const sc = 0.62 + rand() * 0.68;
      dummy.position.set(px, gy + 0.02, pz);
      dummy.rotation.set((rand() - 0.5) * 0.2, rand() * Math.PI * 2, (rand() - 0.5) * 0.2);
      dummy.scale.set(sc, sc * (0.8 + rand() * 0.4), sc);
      dummy.updateMatrix();
      mossMesh.setMatrixAt(mIdx, dummy.matrix);
      col.setHSL(0.29 + (rand() - 0.5) * 0.04, 0.58, 0.3 + rand() * 0.14);
      mossMesh.setColorAt(mIdx, col);
      mIdx++;
    }
  }
  mossMesh.instanceMatrix.needsUpdate = true;
  if (mossMesh.instanceColor) mossMesh.instanceColor.needsUpdate = true;
  mossMesh.computeBoundingSphere();
  group.add(mossMesh);

  // 3f. Floating Water-Surface Salvinia Pads with Delicate Hanging Roots
  const floatGroup = new THREE.Group();
  const padGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.12, 0.022, 10));
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#63b84c',
      roughness: 0.65,
      metalness: 0.02,
    }),
  );
  const rootGeo = trackGeo(new THREE.CylinderGeometry(0.008, 0.002, 0.36, 5));
  rootGeo.translate(0, -0.18, 0);
  const rootMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#7a7054',
      roughness: 0.9,
    }),
  );

  const floatItems: Array<{
    group: THREE.Group;
    baseX: number;
    baseZ: number;
    phase: number;
  }> = [];

  for (let i = 0; i < 14; i++) {
    const fg = new THREE.Group();
    const isLeft = i < 9;
    const fx = isLeft ? -4.3 + rand() * 2.4 : 2.1 + rand() * 1.9;
    const fz = -1.7 + rand() * 2.1;
    const sc = 0.68 + rand() * 0.65;

    const p1 = new THREE.Mesh(padGeo, padMat);
    p1.scale.set(sc, 1, sc * 0.85);
    fg.add(p1);

    const p2 = new THREE.Mesh(padGeo, padMat);
    p2.position.set(0.12 * sc, 0.004, 0.06 * sc);
    p2.scale.set(sc * 0.72, 1, sc * 0.65);
    fg.add(p2);

    const r1 = new THREE.Mesh(rootGeo, rootMat);
    r1.position.set(0.02, 0, 0);
    r1.scale.set(1, 0.6 + rand() * 0.8, 1);
    fg.add(r1);

    fg.position.set(fx, WATER_TOP_Y + 0.01, fz);
    fg.rotation.y = rand() * Math.PI * 2;
    floatGroup.add(fg);

    floatItems.push({ group: fg, baseX: fx, baseZ: fz, phase: rand() * Math.PI * 2 });
  }
  group.add(floatGroup);

  return {
    group,
    obstacles,
    update: (elapsed: number, flowStrength: number) => {
      plantUniforms.uTime.value = elapsed;
      plantUniforms.uFlowStrength.value = flowStrength;

      // Gently bob floating Salvinia pads on surface ripples
      for (const item of floatItems) {
        const waveY =
          Math.sin(elapsed * 1.8 + item.phase) * (0.012 + flowStrength * 0.015) +
          Math.cos(elapsed * 1.3 + item.baseX) * 0.008;
        item.group.position.y = WATER_TOP_Y + 0.01 + waveY;
        item.group.position.x = item.baseX + Math.sin(elapsed * 0.45 + item.phase) * (0.07 + flowStrength * 0.06);
        item.group.rotation.z = Math.sin(elapsed * 1.6 + item.phase) * 0.08;
      }
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
