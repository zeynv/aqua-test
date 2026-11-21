import * as THREE from 'three';
import {
  GLASS_T,
  TANK_BOTTOM_Y,
  TANK_D,
  TANK_HALF_D,
  TANK_HALF_W,
  TANK_W,
  WATER_TOP_Y,
} from '../types/aquarium';
import type { ProceduralTextureSet } from './proceduralTextures';
import { groundHeightAt } from './substrate';

export interface FoodParticle {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  soakTime: number;
  eaten: boolean;
  scale: number;
  rotY: number;
  color: THREE.Color;
}

export interface WaterEffectsResult {
  group: THREE.Group;
  waterSurfaceMesh: THREE.Mesh;
  foodParticles: FoodParticle[];
  dropFood: (worldX?: number, worldZ?: number) => number;
  markFoodEaten: (food: FoodParticle) => void;
  update: (
    dt: number,
    elapsed: number,
    filterPower01: number,
    aeration: boolean,
    clarity01: number,
    lightColor: THREE.Color,
    brightness01: number,
    waterTint: THREE.Color,
    shaftColor: THREE.Color,
  ) => void;
  dispose: () => void;
}

const MAX_RIPPLES = 6;
const MAX_FOOD = 64;
const MAX_CRUMBS = 48;
const AIRSTONE_BUBBLES = 95;
const LILY_BUBBLES = 70;
const TOTAL_BUBBLES = AIRSTONE_BUBBLES + LILY_BUBBLES;

interface BubbleState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  phase: number;
  kind: 'airstone' | 'lily';
  life: number;
  maxLife: number;
}

interface CrumbState {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const _dummy = new THREE.Object3D();

export function buildWaterEffects(
  textures: ProceduralTextureSet,
  lilyNozzlePos: THREE.Vector3,
  airstonePos: THREE.Vector3,
): WaterEffectsResult {
  const group = new THREE.Group();
  group.name = 'WaterEffects';

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

  const innerW = TANK_W - GLASS_T * 2.1;
  const innerD = TANK_D - GLASS_T * 2.1;

  // =========================================================
  // 1. DYNAMIC ANIMATED WATER SURFACE WITH FEEDING RIPPLES
  // =========================================================
  const rippleCenters = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector3(0, 0, -999));
  let rippleCursor = 0;

  const waterSurfaceGeo = trackGeo(new THREE.PlaneGeometry(innerW, innerD, 72, 36));
  waterSurfaceGeo.rotateX(-Math.PI / 2);

  const waterSurfaceMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uAgitation: { value: 0.72 },
        uTintColor: { value: new THREE.Color('#2894b0') },
        uLightColor: { value: new THREE.Color('#eefaff') },
        uBrightness: { value: 0.9 },
        uClarity: { value: 0.96 },
        uRipples: { value: rippleCenters },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAgitation;
        uniform vec3 uRipples[${MAX_RIPPLES}];
        varying vec3 vWorldPos;
        varying vec3 vNormalDir;
        varying vec2 vUv;

        float surfaceHeight(vec2 p, float t) {
          float amp = 0.016 + uAgitation * 0.028;
          float h = sin(p.x * 1.85 + t * (2.1 + uAgitation * 1.4)) * cos(p.y * 1.65 - t * 1.6) * amp;
          h += sin(p.x * 3.8 - p.y * 2.7 + t * 2.8) * amp * 0.45;
          h += cos((p.x + p.y) * 5.2 - t * 3.4) * amp * 0.22;

          // Circular expanding feeding ripples
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            float age = t - uRipples[i].z;
            if (age > 0.0 && age < 3.6) {
              float d = distance(p, uRipples[i].xy);
              float wave = sin(d * 13.0 - age * 10.5);
              float ringMask = exp(-abs(d - age * 1.35) * 2.4) * exp(-age * 0.95);
              h += wave * ringMask * 0.048;
            }
          }
          return h;
        }

        void main() {
          vUv = uv;
          vec3 pos = position;
          float h = surfaceHeight(pos.xz, uTime);
          pos.y += h;

          // Analytic finite-difference normal for crisp specular ripples
          float eps = 0.06;
          float hx = surfaceHeight(pos.xz + vec2(eps, 0.0), uTime);
          float hz = surfaceHeight(pos.xz + vec2(0.0, eps), uTime);
          vec3 n = normalize(vec3(h - hx, eps, h - hz));
          vNormalDir = normalize(mat3(modelMatrix) * n);

          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTintColor;
        uniform vec3 uLightColor;
        uniform float uBrightness;
        uniform float uClarity;
        varying vec3 vWorldPos;
        varying vec3 vNormalDir;
        varying vec2 vUv;

        void main() {
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 N = normalize(vNormalDir);
          if (!gl_FrontFacing) N = -N;

          float NdotV = max(dot(N, V), 0.0);
          float fresnel = pow(1.0 - NdotV, 3.0);

          // Overhead LED bar specular reflection
          vec3 L = normalize(vec3(0.15, 1.0, 0.1));
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 96.0) * (0.65 + uBrightness * 1.15);

          // Subtle edge meniscus brighten
          float edgeX = smoothstep(0.45, 0.5, abs(vUv.x - 0.5));
          float edgeZ = smoothstep(0.45, 0.5, abs(vUv.y - 0.5));
          float meniscus = max(edgeX, edgeZ) * 0.35;

          vec3 murky = vec3(0.24, 0.38, 0.25);
          vec3 waterCol = mix(murky, uTintColor, uClarity);
          vec3 col = mix(waterCol * (0.45 + uBrightness * 0.55), uLightColor, fresnel * 0.65 + meniscus);
          col += uLightColor * spec;

          float alpha = clamp(0.24 + fresnel * 0.44 + spec * 0.35 + meniscus * 0.28, 0.2, 0.82);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );

  const waterSurfaceMesh = new THREE.Mesh(waterSurfaceGeo, waterSurfaceMat);
  waterSurfaceMesh.position.y = WATER_TOP_Y;
  waterSurfaceMesh.renderOrder = 14;
  waterSurfaceMesh.layers.enable(1); // Allow double-click water raycasting
  waterSurfaceMesh.userData.isWaterSurface = true;
  group.add(waterSurfaceMesh);

  // =========================================================
  // 2. SUBTLE VOLUMETRIC WATER TINT & TURBIDITY BLOCK
  // =========================================================
  const waterHeight = WATER_TOP_Y - TANK_BOTTOM_Y;
  const waterVolGeo = trackGeo(new THREE.BoxGeometry(innerW - 0.03, waterHeight, innerD - 0.03));
  const waterVolMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#146a82'),
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  );
  const waterVolMesh = new THREE.Mesh(waterVolGeo, waterVolMat);
  waterVolMesh.position.y = TANK_BOTTOM_Y + waterHeight / 2;
  waterVolMesh.renderOrder = 3;
  group.add(waterVolMesh);

  // =========================================================
  // 3. VOLUMETRIC GOD RAYS (LIGHT SHAFTS) FROM LED BAR
  // =========================================================
  const shaftsGroup = new THREE.Group();
  const shaftMat = trackMat(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color('#9be7ff') },
        uIntensity: { value: 0.14 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;

        void main() {
          float horiz = sin(vUv.x * 3.14159265);
          float rays = 0.55 + 0.45 * sin(vUv.x * 18.0 + uTime * 0.9 + vUv.y * 2.0)
                            * cos(vUv.x * 11.0 - uTime * 0.65);
          float vertFade = smoothstep(0.0, 0.72, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
          float alpha = horiz * horiz * vertFade * rays * uIntensity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    }),
  );

  const shaftPlaneGeo = trackGeo(new THREE.PlaneGeometry(TANK_W - 1.4, waterHeight - 0.35));
  const shaftConfigs = [
    { z: -0.95, rotX: 0.08, rotY: 0.03 },
    { z: -0.1, rotX: -0.05, rotY: -0.02 },
    { z: 0.75, rotX: -0.1, rotY: 0.04 },
  ];
  for (const cfg of shaftConfigs) {
    const s = new THREE.Mesh(shaftPlaneGeo, shaftMat);
    s.position.set(0, WATER_TOP_Y - (waterHeight - 0.35) / 2 - 0.05, cfg.z);
    s.rotation.set(cfg.rotX, cfg.rotY, 0);
    s.renderOrder = 10;
    shaftsGroup.add(s);
  }
  group.add(shaftsGroup);

  // =========================================================
  // 4. SHIMMERING BUBBLE STREAMS (AIRSTONE + LILY PIPE OUTFLOW)
  // =========================================================
  const bubbleGeo = trackGeo(new THREE.SphereGeometry(1, 10, 10));
  const bubbleMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#e6fbff',
      emissive: '#4eaec9',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.62,
      roughness: 0.05,
      metalness: 0.1,
      clearcoat: 1.0,
      depthWrite: false,
    }),
  );
  const bubbleMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, TOTAL_BUBBLES);
  bubbleMesh.frustumCulled = false;
  bubbleMesh.renderOrder = 13;
  group.add(bubbleMesh);

  const bubbles: BubbleState[] = [];
  const respawnBubble = (b: BubbleState, randomProgress = false): void => {
    if (b.kind === 'airstone') {
      const progress = randomProgress ? Math.random() : 0;
      b.pos.set(
        airstonePos.x + (Math.random() - 0.5) * 0.28,
        airstonePos.y + 0.14 + progress * (WATER_TOP_Y - airstonePos.y - 0.2),
        airstonePos.z + (Math.random() - 0.5) * 0.26,
      );
      b.vel.set((Math.random() - 0.5) * 0.08, 0.75 + Math.random() * 0.72, (Math.random() - 0.5) * 0.08);
      b.radius = 0.018 + Math.random() * 0.038;
      b.phase = Math.random() * Math.PI * 2;
      b.life = progress * 3.0;
      b.maxLife = 4.2;
    } else {
      // Fine micro-bubbles swept horizontally from the Lily Pipe nozzle
      const progress = randomProgress ? Math.random() : 0;
      b.pos.set(
        lilyNozzlePos.x - progress * 4.5 + (Math.random() - 0.5) * 0.14,
        lilyNozzlePos.y + (Math.random() - 0.5) * 0.2,
        lilyNozzlePos.z + (Math.random() - 0.5) * 0.22,
      );
      b.vel.set(-(1.4 + Math.random() * 1.4), (Math.random() - 0.32) * 0.35, (Math.random() - 0.5) * 0.42);
      b.radius = 0.011 + Math.random() * 0.022;
      b.phase = Math.random() * Math.PI * 2;
      b.life = progress * 2.5;
      b.maxLife = 2.2 + Math.random() * 1.6;
    }
  };

  for (let i = 0; i < TOTAL_BUBBLES; i++) {
    const b: BubbleState = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      radius: 0.02,
      phase: 0,
      kind: i < AIRSTONE_BUBBLES ? 'airstone' : 'lily',
      life: 0,
      maxLife: 3,
    };
    respawnBubble(b, true);
    bubbles.push(b);
  }

  // =========================================================
  // 5. SUSPENDED MICRO-PARTICLES / TURBIDITY MOTES
  // =========================================================
  const moteCount = 320;
  const motePositions = new Float32Array(moteCount * 3);
  const motePhases = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * (innerW - 0.4);
    motePositions[i * 3 + 1] = TANK_BOTTOM_Y + 0.65 + Math.random() * (waterHeight - 0.85);
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * (innerD - 0.4);
    motePhases[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = trackGeo(new THREE.BufferGeometry());
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = trackMat(
    new THREE.PointsMaterial({
      map: textures.particleDot,
      color: '#c9f0d8',
      size: 0.055,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const motePoints = new THREE.Points(moteGeo, moteMat);
  motePoints.renderOrder = 11;
  group.add(motePoints);

  // =========================================================
  // 6. INTERACTIVE FOOD FLAKES & CRUMB SPARKLE BURSTS
  // =========================================================
  const foodParticles: FoodParticle[] = [];
  let nextFoodId = 1;

  const foodGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.048, 0.018, 7));
  const foodMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.68,
      metalness: 0.05,
    }),
  );
  const foodMesh = new THREE.InstancedMesh(foodGeo, foodMat, MAX_FOOD);
  foodMesh.setColorAt(0, new THREE.Color('#d97a2b'));
  if (foodMesh.instanceColor) foodMesh.instanceColor.needsUpdate = true;
  foodMesh.count = 0;
  foodMesh.frustumCulled = false;
  foodMesh.renderOrder = 12;
  group.add(foodMesh);

  // Crumb burst when a fish snaps up food
  const crumbGeo = trackGeo(new THREE.DodecahedronGeometry(0.02, 0));
  const crumbMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: '#ffd98a',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  const crumbMesh = new THREE.InstancedMesh(crumbGeo, crumbMat, MAX_CRUMBS);
  crumbMesh.count = 0;
  crumbMesh.frustumCulled = false;
  group.add(crumbMesh);

  const crumbs: CrumbState[] = Array.from({ length: MAX_CRUMBS }, () => ({
    active: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    maxLife: 0.7,
  }));

  const foodPalette = [
    new THREE.Color('#d97a2b'),
    new THREE.Color('#c4492d'),
    new THREE.Color('#8c9e36'),
    new THREE.Color('#e3a742'),
  ];

  let currentTime = 0;

  const spawnRipple = (x: number, z: number): void => {
    rippleCenters[rippleCursor].set(x, z, currentTime);
    rippleCursor = (rippleCursor + 1) % MAX_RIPPLES;
  };

  const dropFood = (worldX?: number, worldZ?: number): number => {
    const cx = worldX !== undefined
      ? THREE.MathUtils.clamp(worldX, -TANK_HALF_W + 0.85, TANK_HALF_W - 0.85)
      : (Math.random() - 0.5) * 4.2;
    const cz = worldZ !== undefined
      ? THREE.MathUtils.clamp(worldZ, -TANK_HALF_D + 0.7, TANK_HALF_D - 0.7)
      : (Math.random() - 0.5) * 1.8;

    spawnRipple(cx, cz);
    spawnRipple(cx + (Math.random() - 0.5) * 0.7, cz + (Math.random() - 0.5) * 0.5);

    const dropCount = 16;
    let added = 0;
    for (let i = 0; i < dropCount; i++) {
      if (foodParticles.length >= MAX_FOOD) {
        foodParticles.shift();
      }
      const px = THREE.MathUtils.clamp(cx + (Math.random() - 0.5) * 1.4, -TANK_HALF_W + 0.45, TANK_HALF_W - 0.45);
      const pz = THREE.MathUtils.clamp(cz + (Math.random() - 0.5) * 0.95, -TANK_HALF_D + 0.45, TANK_HALF_D - 0.45);
      const col = foodPalette[Math.floor(Math.random() * foodPalette.length)].clone();
      foodParticles.push({
        id: nextFoodId++,
        position: new THREE.Vector3(px, WATER_TOP_Y - 0.02 - Math.random() * 0.06, pz),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.16, -0.02, (Math.random() - 0.5) * 0.12),
        age: 0,
        soakTime: 0.7 + Math.random() * 1.8, // floats briefly, then sinks gently
        eaten: false,
        scale: 0.78 + Math.random() * 0.55,
        rotY: Math.random() * Math.PI * 2,
        color: col,
      });
      added++;
    }
    return added;
  };

  const markFoodEaten = (food: FoodParticle): void => {
    if (food.eaten) return;
    food.eaten = true;
    // Emit 4 tiny expanding crumb specks
    let emitted = 0;
    for (let i = 0; i < crumbs.length && emitted < 4; i++) {
      const c = crumbs[i];
      if (!c.active) {
        c.active = true;
        c.pos.copy(food.position);
        c.vel.set(
          (Math.random() - 0.5) * 0.65,
          (Math.random() - 0.35) * 0.55,
          (Math.random() - 0.5) * 0.65,
        );
        c.life = 0;
        c.maxLife = 0.45 + Math.random() * 0.35;
        emitted++;
      }
    }
  };

  const murkyVolColor = new THREE.Color('#2c4d32');
  const tmpColor = new THREE.Color();

  return {
    group,
    waterSurfaceMesh,
    foodParticles,
    dropFood,
    markFoodEaten,
    update: (
      dt,
      elapsed,
      filterPower01,
      aeration,
      clarity01,
      lightColor,
      brightness01,
      waterTint,
      shaftColor,
    ) => {
      currentTime = elapsed;

      // 1. Update water surface shader uniforms
      waterSurfaceMat.uniforms.uTime.value = elapsed;
      waterSurfaceMat.uniforms.uAgitation.value = 0.15 + filterPower01 * 0.85;
      waterSurfaceMat.uniforms.uTintColor.value.copy(waterTint);
      waterSurfaceMat.uniforms.uLightColor.value.copy(lightColor);
      waterSurfaceMat.uniforms.uBrightness.value = brightness01;
      waterSurfaceMat.uniforms.uClarity.value = clarity01;

      // 2. Update volumetric water tint & turbidity
      tmpColor.copy(murkyVolColor).lerp(waterTint, clarity01);
      waterVolMat.color.copy(tmpColor);
      waterVolMat.opacity = THREE.MathUtils.lerp(0.24, 0.055, clarity01);

      // 3. Update god rays
      shaftMat.uniforms.uTime.value = elapsed;
      shaftMat.uniforms.uColor.value.copy(shaftColor);
      shaftMat.uniforms.uIntensity.value =
        (0.03 + brightness01 * 0.145) * (0.38 + clarity01 * 0.62);

      // 4. Update bubble streams
      const activeAirstoneCount = aeration
        ? Math.floor(AIRSTONE_BUBBLES * (0.28 + filterPower01 * 0.72))
        : 0;
      const activeLilyCount = Math.floor(LILY_BUBBLES * filterPower01);

      let visibleBubbles = 0;
      for (let i = 0; i < TOTAL_BUBBLES; i++) {
        const b = bubbles[i];
        const isActive =
          b.kind === 'airstone'
            ? i < activeAirstoneCount
            : i - AIRSTONE_BUBBLES < activeLilyCount;

        if (!isActive) continue;

        b.life += dt;
        if (b.kind === 'airstone') {
          const speedMul = 0.65 + filterPower01 * 0.7;
          b.pos.y += b.vel.y * speedMul * dt;
          b.pos.x += (Math.sin(elapsed * 4.2 + b.phase) * 0.18 - filterPower01 * 0.25) * dt;
          b.pos.z += Math.cos(elapsed * 3.7 + b.phase) * 0.16 * dt;

          if (b.pos.y >= WATER_TOP_Y - 0.03 || b.life > b.maxLife) {
            respawnBubble(b, false);
          }
        } else {
          const jetMul = 0.3 + filterPower01 * 1.15;
          b.pos.x += b.vel.x * jetMul * dt;
          b.pos.y += (b.vel.y + 0.18 * (b.life / b.maxLife)) * dt;
          b.pos.z += (b.vel.z + Math.sin(elapsed * 5 + b.phase) * 0.12) * dt;
          // Drag slows horizontal jet down gracefully
          b.vel.x *= Math.pow(0.55, dt);

          if (
            b.pos.y >= WATER_TOP_Y - 0.02 ||
            b.pos.x < -TANK_HALF_W + 0.35 ||
            b.life > b.maxLife
          ) {
            respawnBubble(b, false);
          }
        }

        _dummy.position.copy(b.pos);
        const wobble = 1 + Math.sin(elapsed * 9 + b.phase) * 0.08;
        _dummy.scale.set(b.radius * wobble, b.radius / wobble, b.radius * wobble);
        _dummy.rotation.set(0, 0, 0);
        _dummy.updateMatrix();
        bubbleMesh.setMatrixAt(visibleBubbles, _dummy.matrix);
        visibleBubbles++;
      }
      bubbleMesh.count = visibleBubbles;
      bubbleMesh.instanceMatrix.needsUpdate = true;

      // 5. Update suspended turbidity motes (visibility increases when water is less clear)
      const posArr = moteGeo.attributes.position as THREE.BufferAttribute;
      const driftSpeed = 0.06 + filterPower01 * 0.34;
      for (let i = 0; i < moteCount; i++) {
        let x = posArr.getX(i);
        let y = posArr.getY(i);
        let z = posArr.getZ(i);
        const ph = motePhases[i];

        x -= driftSpeed * dt;
        y += Math.sin(elapsed * 0.9 + ph) * 0.035 * dt;
        z += Math.cos(elapsed * 0.75 + ph) * 0.028 * dt;

        if (x < -innerW / 2 + 0.25) x = innerW / 2 - 0.25;
        if (y > WATER_TOP_Y - 0.12) y = TANK_BOTTOM_Y + 0.75;
        if (y < TANK_BOTTOM_Y + 0.55) y = WATER_TOP_Y - 0.25;

        posArr.setXYZ(i, x, y, z);
      }
      posArr.needsUpdate = true;
      moteMat.opacity = THREE.MathUtils.lerp(0.68, 0.14, clarity01) * (0.35 + brightness01 * 0.65);
      moteMat.size = THREE.MathUtils.lerp(0.095, 0.045, clarity01);
      moteMat.color.copy(tmpColor.set('#96c982').lerp(lightColor, clarity01));

      // 6. Update Food Particles physics & InstancedMesh
      for (let i = foodParticles.length - 1; i >= 0; i--) {
        const f = foodParticles[i];
        f.age += dt;
        if (f.eaten || f.age > 34) {
          foodParticles.splice(i, 1);
          continue;
        }

        const floorY = groundHeightAt(f.position.x, f.position.z) + 0.04;
        if (f.age < f.soakTime) {
          // Floating gently on water surface, pushed softly by surface current
          f.position.y = WATER_TOP_Y - 0.025 + Math.sin(elapsed * 3 + f.id) * 0.015;
          f.position.x += (-filterPower01 * 0.18 + Math.sin(elapsed + f.id) * 0.04) * dt;
          f.position.z += Math.cos(elapsed * 0.8 + f.id) * 0.03 * dt;
        } else if (f.position.y > floorY) {
          // Fluttering slowly downward
          const sinkRate = 0.19 + (f.id % 4) * 0.03;
          f.position.y = Math.max(floorY, f.position.y - sinkRate * dt);
          f.position.x += (-filterPower01 * 0.24 + Math.sin(elapsed * 2.2 + f.id) * 0.09) * dt;
          f.position.z += Math.cos(elapsed * 1.9 + f.id) * 0.07 * dt;
          f.rotY += dt * 1.8;
        }

        f.position.x = THREE.MathUtils.clamp(f.position.x, -TANK_HALF_W + 0.35, TANK_HALF_W - 0.35);
        f.position.z = THREE.MathUtils.clamp(f.position.z, -TANK_HALF_D + 0.35, TANK_HALF_D - 0.35);
      }

      for (let i = 0; i < foodParticles.length; i++) {
        const f = foodParticles[i];
        _dummy.position.copy(f.position);
        _dummy.rotation.set(
          Math.sin(elapsed * 2.5 + f.id) * 0.4,
          f.rotY,
          Math.cos(elapsed * 2.1 + f.id) * 0.35,
        );
        const fadeOut = f.age > 30 ? Math.max(0.01, (34 - f.age) / 4) : 1;
        _dummy.scale.setScalar(f.scale * fadeOut);
        _dummy.updateMatrix();
        foodMesh.setMatrixAt(i, _dummy.matrix);
        foodMesh.setColorAt(i, f.color);
      }
      foodMesh.count = foodParticles.length;
      foodMesh.instanceMatrix.needsUpdate = true;
      if (foodMesh.instanceColor) foodMesh.instanceColor.needsUpdate = true;

      // 7. Update Eaten Crumb Sparkle Bursts
      let activeCrumbs = 0;
      for (const c of crumbs) {
        if (!c.active) continue;
        c.life += dt;
        if (c.life >= c.maxLife) {
          c.active = false;
          continue;
        }
        c.pos.addScaledVector(c.vel, dt);
        c.vel.multiplyScalar(Math.pow(0.18, dt));
        const s = 1 - c.life / c.maxLife;
        _dummy.position.copy(c.pos);
        _dummy.scale.setScalar(s);
        _dummy.rotation.set(c.life * 6, c.life * 4, 0);
        _dummy.updateMatrix();
        crumbMesh.setMatrixAt(activeCrumbs, _dummy.matrix);
        activeCrumbs++;
      }
      crumbMesh.count = activeCrumbs;
      crumbMesh.instanceMatrix.needsUpdate = true;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
