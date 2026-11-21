import * as THREE from 'three';
import {
  GLASS_T,
  TANK_BOTTOM_Y,
  TANK_D,
  TANK_H,
  TANK_HALF_D,
  TANK_HALF_H,
  TANK_HALF_W,
  TANK_W,
  WATER_TOP_Y,
} from '../types/aquarium';
import type { ProceduralTextureSet } from './proceduralTextures';

export interface TankStructureResult {
  group: THREE.Group;
  ledStripMaterial: THREE.MeshStandardMaterial;
  heaterGlowMaterial: THREE.MeshStandardMaterial;
  lilyPipeNozzlePos: THREE.Vector3;
  airstonePos: THREE.Vector3;
  dispose: () => void;
}

export function buildTankStructure(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): TankStructureResult {
  const group = new THREE.Group();
  group.name = 'TankStructure';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const track = <G extends THREE.BufferGeometry>(g: G): G => {
    geometries.push(g);
    return g;
  };
  const trackMat = <M extends THREE.Material>(m: M): M => {
    materials.push(m);
    return m;
  };

  // =========================================================
  // 1. ARCHITECTURAL STUDIO FLOOR & CONTACT SHADOW GROUNDING
  // =========================================================
  const cabinetH = 2.75;
  const cabinetTopY = TANK_BOTTOM_Y - 0.08;
  const floorY = cabinetTopY - cabinetH - 0.14;

  const floorGeo = track(new THREE.PlaneGeometry(58, 58));
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#090e14',
      roughness: 0.88,
      metalness: 0.06,
    }),
  );
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.position.y = floorY;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // Soft radial studio contact shadow right beneath cabinet
  const shadowGeo = track(new THREE.PlaneGeometry(TANK_W + 6.4, TANK_D + 5.6));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.72,
    }),
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = floorY + 0.02;
  group.add(shadowPlane);

  // =========================================================
  // 2. BESPOKE WALNUT & OBSIDIAN AQUARIUM CABINET STAND
  // =========================================================
  const cabinetGroup = new THREE.Group();

  const matNeoprenePad = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#11151b',
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const padGeo = track(new THREE.BoxGeometry(TANK_W + 0.04, 0.08, TANK_D + 0.04));
  const padMesh = new THREE.Mesh(padGeo, matNeoprenePad);
  padMesh.position.y = TANK_BOTTOM_Y - 0.04;
  cabinetGroup.add(padMesh);

  const walnutMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.cabinetWoodColor,
      bumpMap: textures.cabinetWoodBump,
      bumpScale: 0.02,
      roughness: 0.56,
      metalness: 0.05,
    }),
  );

  const obsidianTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#141920',
      roughness: 0.36,
      metalness: 0.42,
    }),
  );

  const brushedAlumMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#aeb8c2',
      roughness: 0.24,
      metalness: 0.9,
      anisotropy: 0.7,
    }),
  );

  // Main walnut carcass
  const carcassGeo = track(new THREE.BoxGeometry(TANK_W + 0.16, cabinetH - 0.24, TANK_D + 0.14));
  const carcassMesh = new THREE.Mesh(carcassGeo, walnutMat);
  carcassMesh.position.y = cabinetTopY - (cabinetH - 0.24) / 2 - 0.06;
  carcassMesh.castShadow = true;
  carcassMesh.receiveShadow = true;
  cabinetGroup.add(carcassMesh);

  // Recessed shadow top collar under tank
  const collarGeo = track(new THREE.BoxGeometry(TANK_W - 0.12, 0.08, TANK_D - 0.12));
  const collarMesh = new THREE.Mesh(collarGeo, obsidianTrimMat);
  collarMesh.position.y = cabinetTopY - 0.04;
  cabinetGroup.add(collarMesh);

  // Front cabinet doors (3 precision flush panels with subtle bevel seam)
  const doorW = (TANK_W - 0.08) / 3;
  const doorH = cabinetH - 0.38;
  const doorGeo = track(new THREE.BoxGeometry(doorW - 0.05, doorH, 0.05));
  const handleGeo = track(new THREE.BoxGeometry(0.42, 0.035, 0.04));

  for (let i = -1; i <= 1; i++) {
    const door = new THREE.Mesh(doorGeo, walnutMat);
    door.position.set(i * doorW, cabinetTopY - 0.1 - doorH / 2, (TANK_D + 0.14) / 2 + 0.025);
    door.receiveShadow = true;
    cabinetGroup.add(door);

    const handle = new THREE.Mesh(handleGeo, brushedAlumMat);
    handle.position.set(i * doorW, cabinetTopY - 0.22, (TANK_D + 0.14) / 2 + 0.06);
    cabinetGroup.add(handle);
  }

  // Recessed dark plinth & 4 brushed aluminum leveling feet
  const plinthGeo = track(new THREE.BoxGeometry(TANK_W - 0.48, 0.2, TANK_D - 0.48));
  const plinthMesh = new THREE.Mesh(plinthGeo, obsidianTrimMat);
  plinthMesh.position.y = floorY + 0.18;
  cabinetGroup.add(plinthMesh);

  const footGeo = track(new THREE.CylinderGeometry(0.14, 0.16, 0.09, 20));
  const footOffsets: [number, number][] = [
    [-TANK_HALF_W + 0.65, -TANK_HALF_D + 0.65],
    [TANK_HALF_W - 0.65, -TANK_HALF_D + 0.65],
    [-TANK_HALF_W + 0.65, TANK_HALF_D - 0.65],
    [TANK_HALF_W - 0.65, TANK_HALF_D - 0.65],
  ];
  for (const [fx, fz] of footOffsets) {
    const foot = new THREE.Mesh(footGeo, brushedAlumMat);
    foot.position.set(fx, floorY + 0.045, fz);
    cabinetGroup.add(foot);
  }

  group.add(cabinetGroup);

  // =========================================================
  // 3. RIMLESS OPTIWHITE LOW-IRON GLASS TANK VESSEL
  // =========================================================
  const glassGroup = new THREE.Group();

  // Bottom glass base plate
  const basePlateGeo = track(new THREE.BoxGeometry(TANK_W, 0.06, TANK_D));
  const basePlateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1b2628',
      roughness: 0.3,
      metalness: 0.15,
    }),
  );
  const basePlate = new THREE.Mesh(basePlateGeo, basePlateMat);
  basePlate.position.y = TANK_BOTTOM_Y + 0.03;
  glassGroup.add(basePlate);

  // Ultra-clear glass pane material (depthWrite: false so interior fish & plants never sort-clip!)
  const glassPaneMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#e8f9ff',
      transparent: true,
      opacity: isSoftwareGl ? 0.14 : 0.13,
      roughness: 0.04,
      metalness: 0.02,
      reflectivity: 0.92,
      ior: 1.52,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  // Front & back glass panes
  const fbPaneGeo = track(new THREE.PlaneGeometry(TANK_W, TANK_H));
  const frontPane = new THREE.Mesh(fbPaneGeo, glassPaneMat);
  frontPane.position.set(0, 0, TANK_HALF_D);
  frontPane.renderOrder = 22;
  glassGroup.add(frontPane);

  const backPane = new THREE.Mesh(fbPaneGeo, glassPaneMat);
  backPane.position.set(0, 0, -TANK_HALF_D);
  backPane.rotation.y = Math.PI;
  backPane.renderOrder = 22;
  glassGroup.add(backPane);

  // Left & right glass panes
  const lrPaneGeo = track(new THREE.PlaneGeometry(TANK_D, TANK_H));
  const leftPane = new THREE.Mesh(lrPaneGeo, glassPaneMat);
  leftPane.position.set(-TANK_HALF_W, 0, 0);
  leftPane.rotation.y = -Math.PI / 2;
  leftPane.renderOrder = 22;
  glassGroup.add(leftPane);

  const rightPane = new THREE.Mesh(lrPaneGeo, glassPaneMat);
  rightPane.position.set(TANK_HALF_W, 0, 0);
  rightPane.rotation.y = Math.PI / 2;
  rightPane.renderOrder = 22;
  glassGroup.add(rightPane);

  // Authentic Optiwhite emerald-aqua beveled glass edge rims (top & vertical silicone edges)
  const glassEdgeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#73d4c8',
      emissive: '#1e6e68',
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.62,
      roughness: 0.08,
      metalness: 0.08,
      clearcoat: 1.0,
      depthWrite: false,
    }),
  );

  const topEdgeFBGeo = track(new THREE.BoxGeometry(TANK_W + GLASS_T, GLASS_T * 0.72, GLASS_T));
  const topEdgeFront = new THREE.Mesh(topEdgeFBGeo, glassEdgeMat);
  topEdgeFront.position.set(0, TANK_HALF_H, TANK_HALF_D);
  topEdgeFront.renderOrder = 24;
  glassGroup.add(topEdgeFront);

  const topEdgeBack = new THREE.Mesh(topEdgeFBGeo, glassEdgeMat);
  topEdgeBack.position.set(0, TANK_HALF_H, -TANK_HALF_D);
  topEdgeBack.renderOrder = 24;
  glassGroup.add(topEdgeBack);

  const topEdgeLRGeo = track(new THREE.BoxGeometry(GLASS_T, GLASS_T * 0.72, TANK_D - GLASS_T));
  const topEdgeLeft = new THREE.Mesh(topEdgeLRGeo, glassEdgeMat);
  topEdgeLeft.position.set(-TANK_HALF_W, TANK_HALF_H, 0);
  topEdgeLeft.renderOrder = 24;
  glassGroup.add(topEdgeLeft);

  const topEdgeRight = new THREE.Mesh(topEdgeLRGeo, glassEdgeMat);
  topEdgeRight.position.set(TANK_HALF_W, TANK_HALF_H, 0);
  topEdgeRight.renderOrder = 24;
  glassGroup.add(topEdgeRight);

  // Thin vertical corner glass-seam columns (silicone & edge refraction)
  const cornerSeamGeo = track(new THREE.BoxGeometry(GLASS_T * 0.85, TANK_H, GLASS_T * 0.85));
  const cornerMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#5ec9be',
      emissive: '#124c48',
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.44,
      roughness: 0.12,
      depthWrite: false,
    }),
  );
  const corners: [number, number][] = [
    [-TANK_HALF_W, TANK_HALF_D],
    [TANK_HALF_W, TANK_HALF_D],
    [-TANK_HALF_W, -TANK_HALF_D],
    [TANK_HALF_W, -TANK_HALF_D],
  ];
  for (const [cx, cz] of corners) {
    const seam = new THREE.Mesh(cornerSeamGeo, cornerMat);
    seam.position.set(cx, 0, cz);
    seam.renderOrder = 23;
    glassGroup.add(seam);
  }

  group.add(glassGroup);

  // =========================================================
  // 4. SUSPENDED ANODIZED ALUMINUM LED LIGHT FIXTURE
  // =========================================================
  const lightBarGroup = new THREE.Group();
  const barY = TANK_HALF_H + 1.15;

  const anodizedMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#1b2028',
      roughness: 0.28,
      metalness: 0.88,
      anisotropy: 0.65,
    }),
  );

  // Sleek tapered aluminum heatsink housing
  const barBodyGeo = track(new THREE.BoxGeometry(TANK_W - 0.9, 0.14, 0.72));
  const barBody = new THREE.Mesh(barBodyGeo, anodizedMat);
  barBody.position.set(0, barY, -0.05);
  barBody.castShadow = true;
  lightBarGroup.add(barBody);

  // Cooling fin ribs on top of LED fixture
  const finGeo = track(new THREE.BoxGeometry(TANK_W - 1.0, 0.04, 0.05));
  for (let i = -3; i <= 3; i++) {
    const fin = new THREE.Mesh(finGeo, brushedAlumMat);
    fin.position.set(0, barY + 0.085, -0.05 + i * 0.09);
    lightBarGroup.add(fin);
  }

  // Side end-caps
  const capGeo = track(new THREE.BoxGeometry(0.08, 0.16, 0.76));
  const leftCap = new THREE.Mesh(capGeo, brushedAlumMat);
  leftCap.position.set(-(TANK_W - 0.9) / 2 - 0.02, barY, -0.05);
  const rightCap = new THREE.Mesh(capGeo, brushedAlumMat);
  rightCap.position.set((TANK_W - 0.9) / 2 + 0.02, barY, -0.05);
  lightBarGroup.add(leftCap, rightCap);

  // Emissive LED diffuser lens panel on the underside
  const ledStripMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: new THREE.Color('#e8f7ff'),
      emissiveIntensity: 2.2,
      roughness: 0.18,
      metalness: 0.0,
    }),
  );
  const ledLensGeo = track(new THREE.PlaneGeometry(TANK_W - 1.25, 0.52));
  ledLensGeo.rotateX(Math.PI / 2);
  const ledLens = new THREE.Mesh(ledLensGeo, ledStripMaterial);
  ledLens.position.set(0, barY - 0.072, -0.05);
  lightBarGroup.add(ledLens);

  // Twin stainless steel suspension brackets mounting neatly onto tank rim
  const bracketCurveL = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-TANK_HALF_W + 0.02, TANK_HALF_H - 0.08, -0.05),
    new THREE.Vector3(-TANK_HALF_W + 0.02, barY + 0.05, -0.05),
    new THREE.Vector3(-TANK_HALF_W + 0.45, barY + 0.05, -0.05),
  ]);
  const bracketCurveR = new THREE.CatmullRomCurve3([
    new THREE.Vector3(TANK_HALF_W - 0.02, TANK_HALF_H - 0.08, -0.05),
    new THREE.Vector3(TANK_HALF_W - 0.02, barY + 0.05, -0.05),
    new THREE.Vector3(TANK_HALF_W - 0.45, barY + 0.05, -0.05),
  ]);
  const bracketL = new THREE.Mesh(track(new THREE.TubeGeometry(bracketCurveL, 20, 0.032, 10, false)), brushedAlumMat);
  const bracketR = new THREE.Mesh(track(new THREE.TubeGeometry(bracketCurveR, 20, 0.032, 10, false)), brushedAlumMat);
  lightBarGroup.add(bracketL, bracketR);

  // Rim clamp blocks
  const clampGeo = track(new THREE.BoxGeometry(0.18, 0.22, 0.34));
  const clampL = new THREE.Mesh(clampGeo, anodizedMat);
  clampL.position.set(-TANK_HALF_W, TANK_HALF_H - 0.04, -0.05);
  const clampR = new THREE.Mesh(clampGeo, anodizedMat);
  clampR.position.set(TANK_HALF_W, TANK_HALF_H - 0.04, -0.05);
  lightBarGroup.add(clampL, clampR);

  group.add(lightBarGroup);

  // =========================================================
  // 5. FILTRATION GLASSWARE, AIRSTONE DIFFUSER & HEATER
  // =========================================================
  const equipmentGroup = new THREE.Group();

  const labGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#dcf5ff',
      transparent: true,
      opacity: 0.42,
      roughness: 0.06,
      metalness: 0.05,
      clearcoat: 1.0,
      depthWrite: false,
    }),
  );

  // 5a. Glass Lily Pipe Outflow (Right rear rim, directing gentle current across top-water)
  const outflowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(TANK_HALF_W + 0.24, TANK_HALF_H - 0.6, -1.55),
    new THREE.Vector3(TANK_HALF_W + 0.24, TANK_HALF_H + 0.22, -1.55),
    new THREE.Vector3(TANK_HALF_W - 0.22, TANK_HALF_H + 0.22, -1.55),
    new THREE.Vector3(TANK_HALF_W - 0.28, WATER_TOP_Y - 0.55, -1.55),
    new THREE.Vector3(TANK_HALF_W - 0.65, WATER_TOP_Y - 0.45, -1.2),
  ]);
  const outflowTube = new THREE.Mesh(track(new THREE.TubeGeometry(outflowCurve, 32, 0.075, 14, false)), labGlassMat);
  outflowTube.renderOrder = 16;
  equipmentGroup.add(outflowTube);

  // Flared lily trumpet nozzle
  const trumpetGeo = track(new THREE.ConeGeometry(0.24, 0.42, 20, 1, true));
  trumpetGeo.rotateZ(-Math.PI / 2.2);
  trumpetGeo.rotateY(0.55);
  const trumpet = new THREE.Mesh(trumpetGeo, labGlassMat);
  trumpet.position.set(TANK_HALF_W - 0.8, WATER_TOP_Y - 0.42, -1.06);
  trumpet.renderOrder = 16;
  equipmentGroup.add(trumpet);

  const lilyPipeNozzlePos = new THREE.Vector3(TANK_HALF_W - 0.96, WATER_TOP_Y - 0.4, -0.94);

  // 5b. Glass Intake Skimmer Pipe (Left rear rim)
  const intakeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-TANK_HALF_W - 0.24, TANK_HALF_H - 0.6, -1.65),
    new THREE.Vector3(-TANK_HALF_W - 0.24, TANK_HALF_H + 0.22, -1.65),
    new THREE.Vector3(-TANK_HALF_W + 0.25, TANK_HALF_H + 0.22, -1.65),
    new THREE.Vector3(-TANK_HALF_W + 0.28, TANK_BOTTOM_Y + 1.15, -1.65),
  ]);
  const intakeTube = new THREE.Mesh(track(new THREE.TubeGeometry(intakeCurve, 30, 0.072, 14, false)), labGlassMat);
  intakeTube.renderOrder = 16;
  equipmentGroup.add(intakeTube);

  // Intake strainer rings
  const ringGeo = track(new THREE.TorusGeometry(0.088, 0.012, 8, 18));
  ringGeo.rotateX(Math.PI / 2);
  for (let r = 0; r < 6; r++) {
    const ring = new THREE.Mesh(ringGeo, obsidianTrimMat);
    ring.position.set(-TANK_HALF_W + 0.28, TANK_BOTTOM_Y + 1.2 + r * 0.085, -1.65);
    equipmentGroup.add(ring);
  }

  // 5c. Submerged Ceramic Airstone Diffuser (Back-right behind stone terrace)
  const airstonePos = new THREE.Vector3(3.45, TANK_BOTTOM_Y + 0.62, -1.52);
  const ceramicMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#cfd6dc',
      roughness: 0.78,
      metalness: 0.05,
    }),
  );
  const airstoneBody = new THREE.Mesh(track(new THREE.CylinderGeometry(0.18, 0.21, 0.14, 18)), ceramicMat);
  airstoneBody.position.copy(airstonePos);
  equipmentGroup.add(airstoneBody);

  const airstoneCollar = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 12)), anodizedMat);
  airstoneCollar.position.set(airstonePos.x, airstonePos.y + 0.1, airstonePos.z);
  equipmentGroup.add(airstoneCollar);

  // Thin silicone airline hose curving up the rear-right corner
  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(airstonePos.x + 0.12, airstonePos.y + 0.04, airstonePos.z),
    new THREE.Vector3(TANK_HALF_W - 0.2, TANK_BOTTOM_Y + 0.72, -TANK_HALF_D + 0.22),
    new THREE.Vector3(TANK_HALF_W - 0.18, TANK_HALF_H - 0.15, -TANK_HALF_D + 0.18),
    new THREE.Vector3(TANK_HALF_W + 0.12, TANK_HALF_H + 0.1, -TANK_HALF_D + 0.18),
  ]);
  const hoseMesh = new THREE.Mesh(track(new THREE.TubeGeometry(hoseCurve, 24, 0.022, 8, false)), labGlassMat);
  equipmentGroup.add(hoseMesh);

  // 5d. Submersible Quartz Heater mounted vertically on rear-left glass
  const heaterGroup = new THREE.Group();
  heaterGroup.position.set(-3.9, -0.35, -TANK_HALF_D + 0.22);

  const heaterTop = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 14)), anodizedMat);
  heaterTop.position.y = 0.82;
  heaterGroup.add(heaterTop);

  const heaterTube = new THREE.Mesh(track(new THREE.CylinderGeometry(0.082, 0.082, 1.5, 16)), labGlassMat);
  heaterTube.renderOrder = 15;
  heaterGroup.add(heaterTube);

  const heaterCore = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.045, 1.35, 12)), obsidianTrimMat);
  heaterGroup.add(heaterCore);

  const heaterGlowMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#ff7e29',
      emissive: new THREE.Color('#ff6214'),
      emissiveIntensity: 1.6,
      roughness: 0.3,
    }),
  );
  const glowBand = new THREE.Mesh(track(new THREE.CylinderGeometry(0.056, 0.056, 0.18, 12)), heaterGlowMaterial);
  glowBand.position.y = -0.22;
  heaterGroup.add(glowBand);

  // Two suction cups attaching heater to back glass
  const cupGeo = track(new THREE.CylinderGeometry(0.12, 0.06, 0.09, 14));
  cupGeo.rotateX(Math.PI / 2);
  const cup1 = new THREE.Mesh(cupGeo, matNeoprenePad);
  cup1.position.set(0, 0.45, -0.1);
  const cup2 = new THREE.Mesh(cupGeo, matNeoprenePad);
  cup2.position.set(0, -0.45, -0.1);
  heaterGroup.add(cup1, cup2);

  equipmentGroup.add(heaterGroup);
  group.add(equipmentGroup);

  return {
    group,
    ledStripMaterial,
    heaterGlowMaterial,
    lilyPipeNozzlePos,
    airstonePos,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
