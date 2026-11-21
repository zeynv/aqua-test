import * as THREE from 'three';
import {
  FishInfo,
  ObstacleSphere,
  TANK_HALF_D,
  TANK_HALF_W,
  WATER_TOP_Y,
} from '../types/aquarium';
import type { ProceduralTextureSet } from './proceduralTextures';
import { groundHeightAt } from './substrate';
import type { FoodParticle } from './waterEffects';

export interface FishAgent {
  info: FishInfo;
  root: THREE.Group;
  bodyMesh: THREE.Mesh;
  tailPivot: THREE.Group;
  leftPectoral: THREE.Mesh;
  rightPectoral: THREE.Mesh;
  dorsalFin: THREE.Mesh;
  hitbox: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  targetDir: THREE.Vector3;
  wanderTarget: THREE.Vector3;
  wanderTimer: number;
  baseSpeed: number;
  maxSpeed: number;
  swimPhase: number;
  size: number;
  preferredMinY: number;
  preferredMaxY: number;
  isBottomDweller: boolean;
  isSchooling: boolean;
  eatCooldown: number;
  exciteBoost: number;
}

export interface FishSystemResult {
  group: THREE.Group;
  agents: FishAgent[];
  hitboxes: THREE.Mesh[];
  getFishInfoList: () => FishInfo[];
  getFishById: (id: string) => FishAgent | undefined;
  update: (
    dt: number,
    elapsed: number,
    foodParticles: FoodParticle[],
    obstacles: ObstacleSphere[],
    fishSpeedScale: number,
    currentStrength: number,
    onEatFood: (food: FoodParticle, fish: FishAgent) => void,
  ) => void;
  dispose: () => void;
}

interface SpeciesProfile {
  speciesId: FishInfo['speciesId'];
  name: string;
  latinName: string;
  zone: string;
  temperament: string;
  accentHex: string;
  bodyLen: number;
  bodyHeight: number;
  bodyThick: number;
  finColor: string;
  finOpacity: number;
  tailStyle: 'fan' | 'fork' | 'veil' | 'sword';
  tallProfile: boolean;
  baseSpeed: number;
  maxSpeed: number;
  minYOffset: number;
  maxYOffset: number;
  isBottomDweller?: boolean;
  isSchooling?: boolean;
  hasBarbels?: boolean;
}

const SPECIES_PROFILES: Record<FishInfo['speciesId'], SpeciesProfile> = {
  discus_blue: {
    speciesId: 'discus_blue',
    name: 'Бирюзовый дискус',
    latinName: 'Symphysodon aequifasciatus',
    zone: 'Средний слой',
    temperament: 'Величавый, спокойный',
    accentHex: '#38bdf8',
    bodyLen: 0.76,
    bodyHeight: 0.68,
    bodyThick: 0.16,
    finColor: '#2498ba',
    finOpacity: 0.72,
    tailStyle: 'fan',
    tallProfile: true,
    baseSpeed: 0.56,
    maxSpeed: 1.45,
    minYOffset: 0.85,
    maxYOffset: -0.55,
  },
  discus_orange: {
    speciesId: 'discus_orange',
    name: 'Дискус Пиджен Блад',
    latinName: 'Symphysodon discus',
    zone: 'Средний слой',
    temperament: 'Грациозный, любопытный',
    accentHex: '#fb923c',
    bodyLen: 0.72,
    bodyHeight: 0.64,
    bodyThick: 0.15,
    finColor: '#ff8a47',
    finOpacity: 0.72,
    tailStyle: 'fan',
    tallProfile: true,
    baseSpeed: 0.58,
    maxSpeed: 1.48,
    minYOffset: 0.9,
    maxYOffset: -0.55,
  },
  angelfish: {
    speciesId: 'angelfish',
    name: 'Скалярия Кои',
    latinName: 'Pterophyllum scalare',
    zone: 'Средний и верхний слой',
    temperament: 'Изящный, созерцательный',
    accentHex: '#f59e0b',
    bodyLen: 0.58,
    bodyHeight: 0.62,
    bodyThick: 0.11,
    finColor: '#e8e2d5',
    finOpacity: 0.65,
    tailStyle: 'veil',
    tallProfile: true,
    baseSpeed: 0.5,
    maxSpeed: 1.38,
    minYOffset: 1.0,
    maxYOffset: -0.42,
  },
  neon: {
    speciesId: 'neon',
    name: 'Голубой неон',
    latinName: 'Paracheirodon innesi',
    zone: 'Средний слой (стая)',
    temperament: 'Стайный, подвижный',
    accentHex: '#22d3ee',
    bodyLen: 0.32,
    bodyHeight: 0.11,
    bodyThick: 0.07,
    finColor: '#c4f1ff',
    finOpacity: 0.45,
    tailStyle: 'fork',
    tallProfile: false,
    baseSpeed: 0.96,
    maxSpeed: 2.05,
    minYOffset: 0.75,
    maxYOffset: -0.45,
    isSchooling: true,
  },
  swordtail: {
    speciesId: 'swordtail',
    name: 'Красный меченосец',
    latinName: 'Xiphophorus hellerii',
    zone: 'Верхний и средний слой',
    temperament: 'Активный, игривый',
    accentHex: '#f43f5e',
    bodyLen: 0.52,
    bodyHeight: 0.18,
    bodyThick: 0.11,
    finColor: '#ff5233',
    finOpacity: 0.78,
    tailStyle: 'sword',
    tallProfile: false,
    baseSpeed: 0.85,
    maxSpeed: 1.9,
    minYOffset: 1.15,
    maxYOffset: -0.22,
  },
  corydoras: {
    speciesId: 'corydoras',
    name: 'Сомик коридорас',
    latinName: 'Corydoras paleatus',
    zone: 'Придонный слой',
    temperament: 'Трудолюбивый, мирный',
    accentHex: '#a3e635',
    bodyLen: 0.44,
    bodyHeight: 0.17,
    bodyThick: 0.14,
    finColor: '#b5a68e',
    finOpacity: 0.68,
    tailStyle: 'fork',
    tallProfile: false,
    baseSpeed: 0.62,
    maxSpeed: 1.35,
    minYOffset: 0.16,
    maxYOffset: -3.2,
    isBottomDweller: true,
    hasBarbels: true,
  },
};

/**
 * Generates an anatomical sculpted fish fuselage BufferGeometry oriented along +X (nose at +len/2, tail base at -len/2).
 * UV.x runs 0 (tail) -> 1 (nose) matching our procedural scale textures.
 */
function createFishBodyGeometry(
  len: number,
  height: number,
  thick: number,
  tallProfile: boolean,
  isBottomDweller = false,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.5, 24, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    const sx = pos.getX(i); // -0.5..0.5
    const sy = pos.getY(i); // -0.5..0.5
    const sz = pos.getZ(i); // -0.5..0.5

    // Normalize lengthwise t: 0 = tail, 1 = nose
    const t = sx + 0.5;

    // Anatomical lengthwise profile: fuller chest around t=0.62, tapering cleanly to peduncle at t=0
    const peduncleTaper = Math.pow(THREE.MathUtils.clamp(t, 0.04, 1.0), tallProfile ? 0.55 : 0.68);
    const nosePinch = t > 0.72 ? 1.0 - Math.pow((t - 0.72) / 0.28, 1.8) * 0.35 : 1.0;

    let x = sx * len;
    let y = sy * height * (0.45 + 0.68 * peduncleTaper) * nosePinch;
    let z = sz * thick * (0.35 + 0.85 * Math.sin(t * Math.PI)) * nosePinch;

    // Slight dorsal arch & flatter belly for bottom-dwelling Corydoras
    if (isBottomDweller) {
      if (sy < 0) y *= 0.62;
      if (t > 0.7) y -= (t - 0.7) * height * 0.22;
    } else if (tallProfile) {
      // Discus / Angelfish sleek diamond-disc compression
      y *= 0.85 + Math.sin(t * Math.PI) * 0.28;
    }

    // Subtle snout protrusion at nose tip
    if (t > 0.88) {
      x += (t - 0.88) * len * 0.28;
    }

    pos.setXYZ(i, x, y, z);
    uv.setXY(i, t, 0.5 + sy);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an extruded/curved thin organic fin geometry from a 2D silhouette shape.
 */
function createFinShapeGeometry(points: Array<[number, number]>): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 10);
  return geo;
}

// Reusable math scratch vectors (Zero GC inside animation loop!)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _sep = new THREE.Vector3();
const _align = new THREE.Vector3();
const _coh = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _lookMat = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _zero = new THREE.Vector3(0, 0, 0);
const _qOffset = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);

export function buildFishSystem(
  textures: ProceduralTextureSet,
  obstacles: ObstacleSphere[],
): FishSystemResult {
  const group = new THREE.Group();
  group.name = 'FishSystem';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const agents: FishAgent[] = [];
  const hitboxes: THREE.Mesh[] = [];

  const trackGeo = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  const trackMat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    return m;
  };

  // Shared eye sphere & pupil/iris material
  const eyeGeo = trackGeo(new THREE.SphereGeometry(1, 12, 10));
  const eyeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: textures.fishEyeTexture,
      roughness: 0.08,
      metalness: 0.1,
      clearcoat: 1.0,
    }),
  );

  // Cache body geometries & materials per species
  const bodyGeoCache = new Map<string, THREE.BufferGeometry>();
  const bodyMatCache = new Map<string, THREE.MeshPhysicalMaterial>();
  const finMatCache = new Map<string, THREE.MeshPhysicalMaterial>();

  const getSpeciesResources = (profile: SpeciesProfile) => {
    if (!bodyGeoCache.has(profile.speciesId)) {
      bodyGeoCache.set(
        profile.speciesId,
        trackGeo(
          createFishBodyGeometry(
            profile.bodyLen,
            profile.bodyHeight,
            profile.bodyThick,
            profile.tallProfile,
            profile.isBottomDweller,
          ),
        ),
      );

      const isNeon = profile.speciesId === 'neon';
      bodyMatCache.set(
        profile.speciesId,
        trackMat(
          new THREE.MeshPhysicalMaterial({
            map: textures.fishTextures[profile.speciesId],
            roughness: isNeon ? 0.16 : 0.24,
            metalness: isNeon ? 0.38 : 0.18,
            clearcoat: 0.9,
            clearcoatRoughness: 0.12,
            iridescence: isNeon ? 0.85 : 0.42,
            iridescenceIOR: 1.35,
            emissive: isNeon ? new THREE.Color('#0c4f6b') : new THREE.Color('#000000'),
            emissiveIntensity: isNeon ? 0.35 : 0,
          }),
        ),
      );

      finMatCache.set(
        profile.speciesId,
        trackMat(
          new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(profile.finColor),
            transparent: true,
            opacity: profile.finOpacity,
            roughness: 0.28,
            metalness: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        ),
      );
    }
    return {
      bodyGeo: bodyGeoCache.get(profile.speciesId)!,
      bodyMat: bodyMatCache.get(profile.speciesId)!,
      finMat: finMatCache.get(profile.speciesId)!,
    };
  };

  // Build composite 8–11 part fish group
  const spawnFish = (
    id: string,
    speciesId: FishInfo['speciesId'],
    startPos: THREE.Vector3,
    scaleJitter = 1.0,
  ): FishAgent => {
    const p = SPECIES_PROFILES[speciesId];
    const { bodyGeo, bodyMat, finMat } = getSpeciesResources(p);

    const root = new THREE.Group();
    root.scale.setScalar(scaleJitter);
    root.position.copy(startPos);

    // 1. Primary Sculpted Body
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.castShadow = true;
    root.add(bodyMesh);

    const halfL = p.bodyLen * 0.5;
    const halfH = p.bodyHeight * 0.5;
    const halfT = p.bodyThick * 0.5;

    // 2. Articulated Caudal Tail Fin Pivot (at rear peduncle)
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-halfL * 0.92, 0, 0);

    let tailPts: Array<[number, number]>;
    if (p.tailStyle === 'fan') {
      tailPts = [
        [0, halfH * 0.22],
        [-p.bodyLen * 0.32, halfH * 0.62],
        [-p.bodyLen * 0.38, 0],
        [-p.bodyLen * 0.32, -halfH * 0.62],
        [0, -halfH * 0.22],
      ];
    } else if (p.tailStyle === 'veil') {
      tailPts = [
        [0, halfH * 0.2],
        [-p.bodyLen * 0.55, halfH * 0.85],
        [-p.bodyLen * 0.35, 0],
        [-p.bodyLen * 0.55, -halfH * 0.85],
        [0, -halfH * 0.2],
      ];
    } else if (p.tailStyle === 'sword') {
      tailPts = [
        [0, halfH * 0.32],
        [-p.bodyLen * 0.34, halfH * 0.72],
        [-p.bodyLen * 0.22, 0],
        [-p.bodyLen * 0.82, -halfH * 0.75], // iconic swordtail lower extension!
        [-p.bodyLen * 0.35, -halfH * 0.32],
        [0, -halfH * 0.28],
      ];
    } else {
      tailPts = [
        [0, halfH * 0.25],
        [-p.bodyLen * 0.38, halfH * 0.75],
        [-p.bodyLen * 0.2, 0],
        [-p.bodyLen * 0.38, -halfH * 0.75],
        [0, -halfH * 0.25],
      ];
    }
    const tailMesh = new THREE.Mesh(trackGeo(createFinShapeGeometry(tailPts)), finMat);
    tailPivot.add(tailMesh);
    root.add(tailPivot);

    // 3. Sweeping Dorsal Fin
    let dorsalPts: Array<[number, number]>;
    if (p.speciesId === 'angelfish') {
      dorsalPts = [
        [halfL * 0.22, halfH * 0.78],
        [-halfL * 0.78, halfH * 2.15],
        [-halfL * 0.86, halfH * 0.52],
      ];
    } else if (p.tallProfile) {
      dorsalPts = [
        [halfL * 0.38, halfH * 0.76],
        [0, halfH * 1.24],
        [-halfL * 0.78, halfH * 1.06],
        [-halfL * 0.88, halfH * 0.42],
      ];
    } else {
      dorsalPts = [
        [halfL * 0.2, halfH * 0.76],
        [-halfL * 0.22, halfH * 1.65],
        [-halfL * 0.52, halfH * 0.72],
      ];
    }
    const dorsalFin = new THREE.Mesh(trackGeo(createFinShapeGeometry(dorsalPts)), finMat);
    root.add(dorsalFin);

    // 4. Anal Fin (lower)
    let analPts: Array<[number, number]>;
    if (p.speciesId === 'angelfish') {
      analPts = [
        [halfL * 0.16, -halfH * 0.76],
        [-halfL * 0.74, -halfH * 2.1],
        [-halfL * 0.86, -halfH * 0.48],
      ];
    } else if (p.tallProfile) {
      analPts = [
        [halfL * 0.28, -halfH * 0.75],
        [-halfL * 0.1, -halfH * 1.2],
        [-halfL * 0.78, -halfH * 1.04],
        [-halfL * 0.86, -halfH * 0.4],
      ];
    } else {
      analPts = [
        [-halfL * 0.05, -halfH * 0.72],
        [-halfL * 0.42, -halfH * 1.28],
        [-halfL * 0.65, -halfH * 0.58],
      ];
    }
    const analFin = new THREE.Mesh(trackGeo(createFinShapeGeometry(analPts)), finMat);
    root.add(analFin);

    // 5 & 6. Paired Animated Pectoral Side Fins
    const pecGeo = trackGeo(
      createFinShapeGeometry([
        [0, 0],
        [-p.bodyLen * 0.26, halfH * 0.16],
        [-p.bodyLen * 0.22, -halfH * 0.26],
      ]),
    );
    const leftPectoral = new THREE.Mesh(pecGeo, finMat);
    leftPectoral.position.set(halfL * 0.22, -halfH * 0.16, halfT * 0.86);
    leftPectoral.rotation.y = -0.45;
    root.add(leftPectoral);

    const rightPectoral = new THREE.Mesh(pecGeo, finMat);
    rightPectoral.position.set(halfL * 0.22, -halfH * 0.16, -halfT * 0.86);
    rightPectoral.rotation.y = 0.45;
    root.add(rightPectoral);

    // 7. Ventral / Pelvic Filament Fins (especially iconic on Angelfish & Discus)
    if (p.tallProfile) {
      const ventGeo = trackGeo(
        createFinShapeGeometry([
          [halfL * 0.28, -halfH * 0.76],
          [-halfL * 0.18, -halfH * (p.speciesId === 'angelfish' ? 2.15 : 1.38)],
          [halfL * 0.12, -halfH * 0.78],
        ]),
      );
      const v1 = new THREE.Mesh(ventGeo, finMat);
      v1.position.z = 0.015;
      const v2 = new THREE.Mesh(ventGeo, finMat);
      v2.position.z = -0.015;
      root.add(v1, v2);
    }

    // 8 & 9. Glossy 3D Layered Eyes (Left + Right)
    const eyeR = Math.max(0.022, Math.min(p.bodyHeight * 0.115, p.bodyLen * 0.088));
    const eyeX = halfL * 0.58;
    const eyeY = halfH * (p.isBottomDweller ? 0.28 : 0.16);
    const eyeZ = halfT * 0.72;

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.scale.set(eyeR, eyeR, eyeR * 0.75);
    leftEye.position.set(eyeX, eyeY, eyeZ);
    leftEye.rotation.y = Math.PI / 2;
    root.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.scale.set(eyeR, eyeR, eyeR * 0.75);
    rightEye.position.set(eyeX, eyeY, -eyeZ);
    rightEye.rotation.y = -Math.PI / 2;
    root.add(rightEye);

    // 10. Cute Sensory Barbels for Bottom-Dwelling Corydoras Catfish
    if (p.hasBarbels) {
      const barbelGeo = trackGeo(new THREE.CylinderGeometry(0.005, 0.002, 0.1, 5));
      barbelGeo.rotateZ(-Math.PI * 0.68);
      const b1 = new THREE.Mesh(barbelGeo, finMat);
      b1.position.set(halfL * 0.96, -halfH * 0.34, 0.03);
      const b2 = new THREE.Mesh(barbelGeo, finMat);
      b2.position.set(halfL * 0.96, -halfH * 0.34, -0.03);
      root.add(b1, b2);
    }

    // 11. Invisible Simplified Proxy Hitbox on Raycast Layer 1 for crisp click selection
    const hitGeo = trackGeo(
      new THREE.SphereGeometry(Math.max(p.bodyLen, p.bodyHeight) * 0.65, 8, 8),
    );
    const hitMat = trackMat(new THREE.MeshBasicMaterial({ visible: false }));
    const hitbox = new THREE.Mesh(hitGeo, hitMat);
    hitbox.layers.set(1);
    hitbox.userData.fishId = id;
    root.add(hitbox);
    hitboxes.push(hitbox);

    group.add(root);

    const initialAngle = Math.random() * Math.PI * 2;
    const vel = new THREE.Vector3(Math.cos(initialAngle), 0, Math.sin(initialAngle)).multiplyScalar(
      p.baseSpeed,
    );

    const info: FishInfo = {
      id,
      speciesId,
      name: p.name,
      latinName: p.latinName,
      zone: p.zone,
      temperament: p.temperament,
      satiety: Math.round(58 + Math.random() * 26),
      isEating: false,
      accentHex: p.accentHex,
    };

    return {
      info,
      root,
      bodyMesh,
      tailPivot,
      leftPectoral,
      rightPectoral,
      dorsalFin,
      hitbox,
      position: startPos.clone(),
      velocity: vel,
      targetDir: vel.clone().normalize(),
      wanderTarget: new THREE.Vector3(
        (Math.random() - 0.5) * 6.5,
        startPos.y,
        (Math.random() - 0.5) * 2.8,
      ),
      wanderTimer: 1.5 + Math.random() * 3.5,
      baseSpeed: p.baseSpeed,
      maxSpeed: p.maxSpeed,
      swimPhase: Math.random() * Math.PI * 2,
      size: Math.max(p.bodyLen, p.bodyHeight) * scaleJitter * 0.55,
      preferredMinY: p.minYOffset,
      preferredMaxY: WATER_TOP_Y + p.maxYOffset,
      isBottomDweller: Boolean(p.isBottomDweller),
      isSchooling: Boolean(p.isSchooling),
      eatCooldown: 0,
      exciteBoost: 0,
    };
  };

  // Populate vibrant, balanced 16-fish community!
  agents.push(spawnFish('discus-1', 'discus_blue', new THREE.Vector3(-0.6, 0.35, 0.35), 1.08));
  agents.push(spawnFish('discus-2', 'discus_blue', new THREE.Vector3(1.15, 0.15, -0.25), 0.96));
  agents.push(spawnFish('discus-3', 'discus_orange', new THREE.Vector3(-1.4, 0.72, 0.55), 1.02));
  agents.push(spawnFish('angel-1', 'angelfish', new THREE.Vector3(2.1, 0.65, 0.42), 1.05));
  agents.push(spawnFish('angel-2', 'angelfish', new THREE.Vector3(-2.1, 0.95, -0.15), 0.95));

  // School of 7 glowing Neon Tetras
  for (let i = 0; i < 7; i++) {
    agents.push(
      spawnFish(
        `neon-${i + 1}`,
        'neon',
        new THREE.Vector3(
          -0.8 + (i % 4) * 0.42,
          0.35 + (i % 3) * 0.25,
          0.25 + ((i % 2) - 0.5) * 0.45,
        ),
        0.92 + (i % 3) * 0.08,
      ),
    );
  }

  // 2 Bright Red Swordtails cruising upper-mid zone
  agents.push(spawnFish('sword-1', 'swordtail', new THREE.Vector3(0.4, 1.35, 0.6), 1.04));
  agents.push(spawnFish('sword-2', 'swordtail', new THREE.Vector3(-1.6, 1.42, 0.15), 0.94));

  // 2 Peppered Corydoras foraging right above the quartz sand beach
  const coryY1 = groundHeightAt(0.2, 0.85) + 0.26;
  const coryY2 = groundHeightAt(-0.9, 1.05) + 0.26;
  agents.push(spawnFish('cory-1', 'corydoras', new THREE.Vector3(0.2, coryY1, 0.85), 1.02));
  agents.push(spawnFish('cory-2', 'corydoras', new THREE.Vector3(-0.9, coryY2, 1.05), 0.96));

  // Keep fish safely inside glass margins
  const boundX = TANK_HALF_W - 0.58;
  const boundZ = TANK_HALF_D - 0.52;

  return {
    group,
    agents,
    hitboxes,
    getFishInfoList: () => agents.map((a) => ({ ...a.info })),
    getFishById: (id: string) => agents.find((a) => a.info.id === id),
    update: (
      dt,
      elapsed,
      foodParticles,
      obsList,
      fishSpeedScale,
      currentStrength,
      onEatFood,
    ) => {
      const clampedDt = Math.min(dt, 0.05);
      const activeObstacles = obsList.length > 0 ? obsList : obstacles;

      for (let i = 0; i < agents.length; i++) {
        const f = agents[i];
        f.eatCooldown = Math.max(0, f.eatCooldown - clampedDt);
        f.exciteBoost = Math.max(0, f.exciteBoost - clampedDt * 0.8);
        f.info.satiety = Math.max(12, f.info.satiety - clampedDt * 0.28);

        _steer.set(0, 0, 0);
        let chasingFood: FoodParticle | null = null;
        let closestFoodDistSq = Infinity;

        // 1. Food Seeking Behavior (hungry fish rush excitedly toward food!)
        if (foodParticles.length > 0 && f.eatCooldown <= 0) {
          const searchRangeSq = f.isBottomDweller ? 16.0 : 36.0;
          for (let j = 0; j < foodParticles.length; j++) {
            const fp = foodParticles[j];
            if (fp.eaten) continue;
            // Bottom dwellers prefer sinking/low food, but will rise slightly if hungry
            const dSq = f.position.distanceToSquared(fp.position);
            const yPenalty = f.isBottomDweller && fp.position.y > -0.2 ? 9.0 : 0;
            if (dSq + yPenalty < closestFoodDistSq && dSq < searchRangeSq) {
              closestFoodDistSq = dSq + yPenalty;
              chasingFood = fp;
            }
          }
        }

        if (chasingFood) {
          f.info.isEating = true;
          _v1.subVectors(chasingFood.position, f.position);
          const dist = _v1.length();
          if (dist < f.size + 0.14) {
            // Snap up food!
            onEatFood(chasingFood, f);
            f.info.satiety = Math.min(100, f.info.satiety + 14);
            f.eatCooldown = 0.42;
            f.exciteBoost = 1.0;
          } else if (dist > 0.001) {
            _v1.divideScalar(dist);
            _steer.addScaledVector(_v1, 4.6);
          }
        } else {
          f.info.isEating = false;
          // 2. Peaceful Wandering / Cruising Target
          f.wanderTimer -= clampedDt;
          if (f.wanderTimer <= 0 || f.position.distanceToSquared(f.wanderTarget) < 0.65) {
            f.wanderTimer = 2.6 + Math.random() * 4.4;
            const tx = (Math.random() - 0.5) * (boundX * 1.72);
            const tz = (Math.random() - 0.5) * (boundZ * 1.65);
            const gy = groundHeightAt(tx, tz);
            const ty = f.isBottomDweller
              ? gy + 0.22 + Math.random() * 0.34
              : THREE.MathUtils.lerp(
                  Math.max(gy + f.preferredMinY, -1.2),
                  f.preferredMaxY,
                  Math.random(),
                );
            f.wanderTarget.set(tx, ty, tz);
          }
          _v1.subVectors(f.wanderTarget, f.position);
          if (_v1.lengthSq() > 0.01) {
            _v1.normalize();
            _steer.addScaledVector(_v1, 1.35);
          }
        }

        // 3. Boids Schooling for Neon Tetras + Gentle Separation for all fish
        _sep.set(0, 0, 0);
        _align.set(0, 0, 0);
        _coh.set(0, 0, 0);
        let schoolNeighbors = 0;

        for (let j = 0; j < agents.length; j++) {
          if (i === j) continue;
          const other = agents[j];
          _v1.subVectors(f.position, other.position);
          const dSq = _v1.lengthSq();
          const minSep = f.size + other.size + (f.isSchooling && other.isSchooling ? 0.14 : 0.34);

          if (dSq > 0.0001 && dSq < minSep * minSep) {
            const d = Math.sqrt(dSq);
            _sep.addScaledVector(_v1, (minSep - d) / (d * minSep));
          }

          if (f.isSchooling && other.isSchooling && dSq < 4.5 && !chasingFood) {
            _align.add(other.velocity);
            _coh.add(other.position);
            schoolNeighbors++;
          }
        }
        _steer.addScaledVector(_sep, 3.2);
        if (schoolNeighbors > 0) {
          _align.divideScalar(schoolNeighbors).normalize();
          _coh.divideScalar(schoolNeighbors).sub(f.position).normalize();
          _steer.addScaledVector(_align, 1.45);
          _steer.addScaledVector(_coh, 1.25);
        }

        // 4. Hardscape Obstacle Avoidance (Rocks & Driftwood)
        for (let k = 0; k < activeObstacles.length; k++) {
          const ob = activeObstacles[k];
          const dx = f.position.x - ob.x;
          const dy = f.position.y - ob.y;
          const dz = f.position.z - ob.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          const avoidR = ob.r + f.size + 0.18;
          if (distSq < avoidR * avoidR && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const push = ((avoidR - dist) / avoidR) * 5.8;
            _steer.x += (dx / dist) * push;
            _steer.y += (dy / dist) * push;
            _steer.z += (dz / dist) * push;
          }
        }

        // 5. Soft Tank Glass, Water Surface & Contoured Substrate Repulsion
        const marginX = boundX - f.size * 0.45;
        const marginZ = boundZ - f.size * 0.45;
        if (f.position.x > marginX - 0.65) _steer.x -= (f.position.x - (marginX - 0.65)) * 5.5;
        if (f.position.x < -marginX + 0.65) _steer.x -= (f.position.x - (-marginX + 0.65)) * 5.5;
        if (f.position.z > marginZ - 0.55) _steer.z -= (f.position.z - (marginZ - 0.55)) * 5.5;
        if (f.position.z < -marginZ + 0.55) _steer.z -= (f.position.z - (-marginZ + 0.55)) * 5.5;

        const floorLimit = groundHeightAt(f.position.x, f.position.z) + (f.isBottomDweller ? 0.16 : 0.36 + f.size * 0.35);
        const ceilLimit = WATER_TOP_Y - (chasingFood ? 0.14 : 0.28 + f.size * 0.25);
        if (f.position.y < floorLimit + 0.3) _steer.y += (floorLimit + 0.3 - f.position.y) * 6.5;
        if (f.position.y > ceilLimit - 0.25) _steer.y -= (f.position.y - (ceilLimit - 0.25)) * 6.5;

        // Subtle Lily Pipe water current nudge in upper water
        if (f.position.y > 0.4) {
          _steer.x -= currentStrength * 0.18;
        }

        // Integrate smooth turning & velocity
        const desiredSpeed =
          (chasingFood ? f.maxSpeed : f.baseSpeed * (1 + f.exciteBoost * 0.45)) *
          fishSpeedScale;

        f.velocity.addScaledVector(_steer, clampedDt * (chasingFood ? 3.2 : 1.75));
        const speed = f.velocity.length();
        const clampedSpeed = THREE.MathUtils.clamp(speed, f.baseSpeed * 0.45 * fishSpeedScale, desiredSpeed);
        if (speed > 0.0001) {
          f.velocity.multiplyScalar(clampedSpeed / speed);
        }

        // Limit extreme pitch angle so fish swim naturally horizontally
        const horizSpeed = Math.hypot(f.velocity.x, f.velocity.z);
        const maxVy = horizSpeed * (chasingFood ? 0.72 : 0.38);
        f.velocity.y = THREE.MathUtils.clamp(f.velocity.y, -maxVy, maxVy);

        f.position.addScaledVector(f.velocity, clampedDt);

        // Hard safety clamp inside tank glass & above substrate (guarantees zero clipping!)
        f.position.x = THREE.MathUtils.clamp(f.position.x, -marginX, marginX);
        f.position.z = THREE.MathUtils.clamp(f.position.z, -marginZ, marginZ);
        const strictFloor = groundHeightAt(f.position.x, f.position.z) + (f.isBottomDweller ? 0.14 : 0.28);
        f.position.y = THREE.MathUtils.clamp(f.position.y, strictFloor, WATER_TOP_Y - 0.12);

        // Update 3D orientation smoothly toward movement direction (+X is fish nose)
        if (f.velocity.lengthSq() > 0.0005) {
          _v2.copy(f.velocity).normalize();
          _lookMat.lookAt(_zero, _v2, _up);
          _targetQuat.setFromRotationMatrix(_lookMat);
          // Rotate -90 deg around Y because Three.js lookAt aligns -Z forward, while our fish nose is +X
          _targetQuat.multiply(_qOffset);
          f.root.quaternion.slerp(_targetQuat, 1 - Math.exp(-6.5 * clampedDt));
        }

        // Lifelike procedural spine sway, caudal tail wag, and pectoral fin fluttering!
        const speedRatio = clampedSpeed / Math.max(0.25, f.baseSpeed);
        f.swimPhase += clampedDt * (5.2 + speedRatio * 5.8);
        const wagAmp = 0.24 + Math.min(0.28, speedRatio * 0.16);
        f.tailPivot.rotation.y = Math.sin(f.swimPhase) * wagAmp;
        f.bodyMesh.rotation.y = -Math.sin(f.swimPhase) * wagAmp * 0.24;
        f.dorsalFin.rotation.z = Math.sin(f.swimPhase - 0.6) * 0.06;

        // Pectoral fins flutter gracefully
        const pecFlutter = Math.sin(elapsed * 7.5 + f.swimPhase * 0.45) * 0.28;
        f.leftPectoral.rotation.y = -0.45 + pecFlutter;
        f.rightPectoral.rotation.y = 0.45 - pecFlutter;

        // Apply position with subtle natural swimming bob
        f.root.position.copy(f.position);
        f.root.position.y += Math.sin(f.swimPhase * 0.5) * 0.008;
      }
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
