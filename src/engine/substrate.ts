import * as THREE from 'three';
import {
  GLASS_T,
  TANK_BOTTOM_Y,
  TANK_D,
  TANK_HALF_D,
  TANK_HALF_W,
  TANK_W,
} from '../types/aquarium';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface CausticsUniforms {
  uTime: { value: number };
  uCausticsIntensity: { value: number };
  uCausticsColor: { value: THREE.Color };
}

/**
 * Deterministic sculpted aquascape substrate heightmap (in world Y).
 * Front-center forms a bright sand beach; back-left and back-right rise into
 * lush volcanic aqua-soil terraces for rocks and stem plants.
 */
export function groundHeightAt(x: number, z: number): number {
  const nx = x / TANK_HALF_W; // -1..1
  const nz = z / TANK_HALF_D; // -1 (back) .. +1 (front)

  // Gentle back-to-front slope (classic aquascaping perspective depth)
  const backSlope = THREE.MathUtils.clamp((-nz + 0.75) * 0.55, 0, 1);
  let h = 0.24 + backSlope * 0.56;

  // Left mountain mound (near x = -2.7, z = -0.85)
  const dlx = x + 2.65;
  const dlz = z + 0.85;
  const leftMound = Math.exp(-(dlx * dlx * 0.16 + dlz * dlz * 0.34)) * 0.62;

  // Right secondary terrace (near x = 2.9, z = -1.05)
  const drx = x - 2.9;
  const drz = z + 1.05;
  const rightMound = Math.exp(-(drx * drx * 0.18 + drz * drz * 0.38)) * 0.44;

  // Foreground gentle sand valley / path
  const pathDist = Math.abs(x - 0.35 + Math.sin(z * 0.7) * 0.45);
  const pathCarve = Math.exp(-pathDist * pathDist * 0.65) * THREE.MathUtils.clamp((nz + 0.35) * 0.9, 0, 1) * 0.18;

  // Natural micro-undulations
  const ripples =
    Math.sin(x * 1.45 + z * 0.9) * 0.035 +
    Math.cos(x * 2.8 - z * 2.1) * 0.018 +
    Math.sin(nx * 5.2) * 0.012;

  h = h + leftMound + rightMound - pathCarve + ripples;
  return TANK_BOTTOM_Y + Math.max(0.16, h);
}

/**
 * Injects animated dual-layer underwater light caustics onto any PBR MeshStandardMaterial
 * via onBeforeCompile so the material retains full shadows, normal/bump maps, and env reflections.
 */
export function applyCausticsToMaterial(
  material: THREE.MeshStandardMaterial,
  sharedUniforms: CausticsUniforms,
  scale = 1.0,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uCausticsIntensity = sharedUniforms.uCausticsIntensity;
    shader.uniforms.uCausticsColor = sharedUniforms.uCausticsColor;
    shader.uniforms.uCausticsScale = { value: scale };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCausticsWorldPos;
        varying vec3 vCausticsWorldNormal;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 causticsLocalPos = vec4(transformed, 1.0);
        vec3 causticsLocalNorm = objectNormal;
        #ifdef USE_INSTANCING
          causticsLocalPos = instanceMatrix * causticsLocalPos;
          causticsLocalNorm = mat3(instanceMatrix) * causticsLocalNorm;
        #endif
        vCausticsWorldPos = (modelMatrix * causticsLocalPos).xyz;
        vCausticsWorldNormal = normalize(mat3(modelMatrix) * causticsLocalNorm);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uCausticsIntensity;
        uniform vec3 uCausticsColor;
        uniform float uCausticsScale;
        varying vec3 vCausticsWorldPos;
        varying vec3 vCausticsWorldNormal;

        float causticPattern(vec2 p, float t) {
          vec2 uv = p * 0.95;
          float c1 = sin(uv.x * 2.7 + t * 1.3 + cos(uv.y * 2.3 - t * 1.1));
          float c2 = cos(uv.y * 3.1 - t * 1.05 + sin(uv.x * 2.6 + t * 0.9));
          float c3 = sin((uv.x + uv.y) * 2.2 - t * 1.45);
          float v = abs(c1 + c2 + c3 * 0.55);
          return pow(clamp(1.0 - v * 0.42, 0.0, 1.0), 3.4);
        }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `
        float upFacing = smoothstep(0.05, 0.85, vCausticsWorldNormal.y);
        float depthFade = smoothstep(-2.8, 1.8, vCausticsWorldPos.y) * 0.55 + 0.45;
        vec2 cUv = vCausticsWorldPos.xz * uCausticsScale + vCausticsWorldPos.y * 0.14;
        float caustA = causticPattern(cUv, uTime);
        float caustB = causticPattern(cUv * 1.38 + vec2(1.7, -2.3), -uTime * 0.85);
        float caust = (caustA * 0.6 + caustB * 0.55) * upFacing * depthFade * uCausticsIntensity;
        gl_FragColor.rgb += uCausticsColor * caust * 0.42;
        #include <dithering_fragment>
        `,
      );
  };
  material.customProgramCacheKey = () => `aqua-caustics-${scale.toFixed(2)}`;
}

export interface SubstrateBuildResult {
  group: THREE.Group;
  dispose: () => void;
}

export function buildSubstrate(
  textures: ProceduralTextureSet,
  causticsUniforms: CausticsUniforms,
): SubstrateBuildResult {
  const group = new THREE.Group();
  group.name = 'SubstrateSystem';

  const innerW = TANK_W - GLASS_T * 2.3;
  const innerD = TANK_D - GLASS_T * 2.3;
  const segX = 76;
  const segZ = 42;

  // Build closed sculpted substrate block (top contour + 4 cross-section glass-side skirts so viewing from sides looks solid!)
  const topGeo = new THREE.PlaneGeometry(innerW, innerD, segX, segZ);
  topGeo.rotateX(-Math.PI / 2);

  const posAttr = topGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const sandTint = new THREE.Color('#d8c4a0');
  const soilTint = new THREE.Color('#3b3228');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = groundHeightAt(x, z);
    posAttr.setY(i, y);

    // Blend golden quartz sand beach in foreground/center with rich dark volcanic soil in elevated rear terraces
    const elevation = y - TANK_BOTTOM_Y;
    const soilBlend = THREE.MathUtils.smoothstep(elevation, 0.48, 0.92);
    tmpColor.copy(sandTint).lerp(soilTint, soilBlend * 0.78);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  topGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeo.computeVertexNormals();

  const substrateMat = new THREE.MeshStandardMaterial({
    map: textures.sandColor,
    bumpMap: textures.sandBump,
    bumpScale: 0.045,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.02,
  });
  applyCausticsToMaterial(substrateMat, causticsUniforms, 1.0);

  const topMesh = new THREE.Mesh(topGeo, substrateMat);
  topMesh.receiveShadow = true;
  group.add(topMesh);

  // Build 4 soil cross-section skirts pressed snugly inside glass panes
  const skirtMat = new THREE.MeshStandardMaterial({
    map: textures.sandColor,
    bumpMap: textures.sandBump,
    bumpScale: 0.03,
    color: new THREE.Color('#7a6852'),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const skirtGeometries: THREE.BufferGeometry[] = [];
  const createSkirt = (
    steps: number,
    coordAt: (t: number) => [number, number],
  ): THREE.BufferGeometry => {
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, z] = coordAt(t);
      const topY = groundHeightAt(x, z);
      verts.push(x, topY, z);
      uvs.push(t * 3, 1);
      verts.push(x, TANK_BOTTOM_Y + 0.015, z);
      uvs.push(t * 3, 0);
      if (i < steps) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    skirtGeometries.push(g);
    return g;
  };

  const hw = innerW / 2;
  const hd = innerD / 2;
  // Front skirt (+Z)
  group.add(new THREE.Mesh(createSkirt(segX, (t) => [-hw + t * innerW, hd]), skirtMat));
  // Back skirt (-Z)
  group.add(new THREE.Mesh(createSkirt(segX, (t) => [hw - t * innerW, -hd]), skirtMat));
  // Left skirt (-X)
  group.add(new THREE.Mesh(createSkirt(segZ, (t) => [-hw, -hd + t * innerD]), skirtMat));
  // Right skirt (+X)
  group.add(new THREE.Mesh(createSkirt(segZ, (t) => [hw, hd - t * innerD]), skirtMat));

  // Instanced smooth river pebbles & gravel scatter resting flush on groundHeightAt(x, z)
  const pebbleCount = 210;
  const pebbleGeo = new THREE.IcosahedronGeometry(0.09, 2);
  // Slightly flatten into natural river stone proportions
  pebbleGeo.scale(1.25, 0.56, 0.95);
  const pebbleMat = new THREE.MeshStandardMaterial({
    roughness: 0.62,
    metalness: 0.05,
    bumpMap: textures.rockBump,
    bumpScale: 0.015,
  });
  applyCausticsToMaterial(pebbleMat, causticsUniforms, 1.1);

  const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  pebbles.castShadow = false;
  pebbles.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const palette = [
    new THREE.Color('#6b7278'),
    new THREE.Color('#8e8170'),
    new THREE.Color('#4a4f54'),
    new THREE.Color('#b6a58c'),
    new THREE.Color('#5c5246'),
    new THREE.Color('#7a7d75'),
  ];

  let seed = 8821;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < pebbleCount; i++) {
    // Cluster pebbles naturally near rock bases & sand margins
    const x = (rand() - 0.5) * (innerW - 0.55);
    const z = (rand() - 0.5) * (innerD - 0.55);
    const sx = 0.55 + rand() * 1.45;
    const sy = 0.5 + rand() * 1.1;
    const sz = 0.55 + rand() * 1.35;
    const gy = groundHeightAt(x, z);

    dummy.position.set(x, gy + 0.02 * sy, z);
    dummy.rotation.set((rand() - 0.5) * 0.35, rand() * Math.PI * 2, (rand() - 0.5) * 0.35);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    pebbles.setMatrixAt(i, dummy.matrix);

    const baseCol = palette[Math.floor(rand() * palette.length)].clone();
    baseCol.offsetHSL(0, 0, (rand() - 0.5) * 0.12);
    pebbles.setColorAt(i, baseCol);
  }
  pebbles.instanceMatrix.needsUpdate = true;
  if (pebbles.instanceColor) pebbles.instanceColor.needsUpdate = true;
  pebbles.computeBoundingSphere();
  group.add(pebbles);

  return {
    group,
    dispose: () => {
      topGeo.dispose();
      substrateMat.dispose();
      skirtMat.dispose();
      for (const g of skirtGeometries) g.dispose();
      pebbleGeo.dispose();
      pebbleMat.dispose();
    },
  };
}
