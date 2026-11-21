import * as THREE from 'three';

export interface ProceduralTextureSet {
  sandColor: THREE.CanvasTexture;
  sandBump: THREE.CanvasTexture;
  rockColor: THREE.CanvasTexture;
  rockBump: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  woodBump: THREE.CanvasTexture;
  cabinetWoodColor: THREE.CanvasTexture;
  cabinetWoodBump: THREE.CanvasTexture;
  leafGreenColor: THREE.CanvasTexture;
  leafRedColor: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  particleDot: THREE.CanvasTexture;
  fishTextures: Record<string, THREE.CanvasTexture>;
  fishEyeTexture: THREE.CanvasTexture;
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

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createSandTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const [cCol, ctxCol] = makeCanvas(size, size);
  const [cBmp, ctxBmp] = makeCanvas(size, size);
  const rand = seededRand(101);

  ctxCol.fillStyle = '#c9b38f';
  ctxCol.fillRect(0, 0, size, size);
  ctxBmp.fillStyle = '#808080';
  ctxBmp.fillRect(0, 0, size, size);

  // Subtle organic ripple bands in sand
  for (let y = 0; y < size; y += 2) {
    const wave = Math.sin((y / size) * Math.PI * 10) * 0.5 + 0.5;
    ctxCol.fillStyle = `rgba(110, 92, 66, ${0.06 * wave})`;
    ctxCol.fillRect(0, y, size, 2);
    const bVal = Math.floor(115 + wave * 28);
    ctxBmp.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    ctxBmp.fillRect(0, y, size, 2);
  }

  // Fine quartz & volcanic mineral grains
  const grainColors = ['#dfd0b4', '#b89f79', '#997f5c', '#e8dec8', '#6e5c45', '#d3be9c'];
  for (let i = 0; i < 18000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 0.6 + rand() * 1.9;
    ctxCol.fillStyle = grainColors[Math.floor(rand() * grainColors.length)];
    ctxCol.globalAlpha = 0.45 + rand() * 0.45;
    ctxCol.beginPath();
    ctxCol.arc(x, y, r, 0, Math.PI * 2);
    ctxCol.fill();

    const g = Math.floor(80 + rand() * 155);
    ctxBmp.fillStyle = `rgb(${g},${g},${g})`;
    ctxBmp.globalAlpha = 0.7;
    ctxBmp.beginPath();
    ctxBmp.arc(x, y, r, 0, Math.PI * 2);
    ctxBmp.fill();
  }
  ctxCol.globalAlpha = 1;
  ctxBmp.globalAlpha = 1;

  return [
    finalizeTexture(cCol, true, maxAniso, 4, 2.4),
    finalizeTexture(cBmp, false, maxAniso, 4, 2.4),
  ];
}

function createRockTextures(maxAniso: number): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const [cCol, ctxCol] = makeCanvas(size, size);
  const [cBmp, ctxBmp] = makeCanvas(size, size);
  const rand = seededRand(202);

  // Seiryu slate blue-grey limestone base
  const grad = ctxCol.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#464d54');
  grad.addColorStop(0.5, '#5b636b');
  grad.addColorStop(1, '#3b4147');
  ctxCol.fillStyle = grad;
  ctxCol.fillRect(0, 0, size, size);

  ctxBmp.fillStyle = '#7e7e7e';
  ctxBmp.fillRect(0, 0, size, size);

  // Sedimentary mineral striations & white quartz veins
  for (let i = 0; i < 140; i++) {
    const y = rand() * size;
    const thickness = 1 + rand() * 6;
    const isVein = rand() > 0.84;
    ctxCol.strokeStyle = isVein
      ? `rgba(218, 224, 228, ${0.22 + rand() * 0.25})`
      : `rgba(25, 30, 34, ${0.18 + rand() * 0.3})`;
    ctxCol.lineWidth = isVein ? 1.2 : thickness;
    ctxCol.beginPath();
    ctxCol.moveTo(0, y);
    let cy = y;
    for (let x = 0; x <= size; x += 32) {
      cy += (rand() - 0.5) * 14;
      ctxCol.lineTo(x, cy);
    }
    ctxCol.stroke();

    const bCol = isVein ? 210 : 40;
    ctxBmp.strokeStyle = `rgba(${bCol},${bCol},${bCol}, 0.45)`;
    ctxBmp.lineWidth = thickness + 1;
    ctxBmp.beginPath();
    ctxBmp.moveTo(0, y);
    cy = y;
    for (let x = 0; x <= size; x += 32) {
      cy += (rand() - 0.5) * 10;
      ctxBmp.lineTo(x, cy);
    }
    ctxBmp.stroke();
  }

  // Subtle submerged olive-moss mineral patina patches
  for (let i = 0; i < 65; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 34;
    const g = ctxCol.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(66, 94, 62, 0.22)');
    g.addColorStop(1, 'rgba(66, 94, 62, 0)');
    ctxCol.fillStyle = g;
    ctxCol.beginPath();
    ctxCol.arc(x, y, r, 0, Math.PI * 2);
    ctxCol.fill();
  }

  // Micro grit
  for (let i = 0; i < 4500; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = Math.floor(45 + rand() * 110);
    ctxCol.fillStyle = `rgba(${v},${v + 4},${v + 8},0.22)`;
    ctxCol.fillRect(x, y, 2, 2);
  }

  return [
    finalizeTexture(cCol, true, maxAniso, 2, 2),
    finalizeTexture(cBmp, false, maxAniso, 2, 2),
  ];
}

function createWoodTextures(maxAniso: number, isCabinet: boolean): [THREE.CanvasTexture, THREE.CanvasTexture] {
  const size = 512;
  const [cCol, ctxCol] = makeCanvas(size, size);
  const [cBmp, ctxBmp] = makeCanvas(size, size);
  const rand = seededRand(isCabinet ? 404 : 303);

  ctxCol.fillStyle = isCabinet ? '#33241a' : '#583f2b';
  ctxCol.fillRect(0, 0, size, size);
  ctxBmp.fillStyle = '#808080';
  ctxBmp.fillRect(0, 0, size, size);

  const fibers = isCabinet ? 220 : 280;
  for (let i = 0; i < fibers; i++) {
    const y = rand() * size;
    const dark = rand() > 0.45;
    if (isCabinet) {
      ctxCol.strokeStyle = dark
        ? `rgba(24, 15, 9, ${0.15 + rand() * 0.25})`
        : `rgba(92, 66, 46, ${0.12 + rand() * 0.22})`;
    } else {
      ctxCol.strokeStyle = dark
        ? `rgba(34, 22, 13, ${0.22 + rand() * 0.35})`
        : `rgba(128, 96, 66, ${0.16 + rand() * 0.25})`;
    }
    ctxCol.lineWidth = 1 + rand() * (isCabinet ? 3 : 4.5);
    ctxCol.beginPath();
    ctxCol.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      const bend = Math.sin((x / size) * Math.PI * 2 + i * 0.15) * (isCabinet ? 4 : 9);
      ctxCol.lineTo(x, y + bend);
    }
    ctxCol.stroke();

    const bv = dark ? 52 : 178;
    ctxBmp.strokeStyle = `rgba(${bv},${bv},${bv},0.35)`;
    ctxBmp.lineWidth = 1.5 + rand() * 2.5;
    ctxBmp.beginPath();
    ctxBmp.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      const bend = Math.sin((x / size) * Math.PI * 2 + i * 0.15) * (isCabinet ? 4 : 9);
      ctxBmp.lineTo(x, y + bend);
    }
    ctxBmp.stroke();
  }

  return [
    finalizeTexture(cCol, true, maxAniso, isCabinet ? 2 : 3, isCabinet ? 1 : 1),
    finalizeTexture(cBmp, false, maxAniso, isCabinet ? 2 : 3, isCabinet ? 1 : 1),
  ];
}

function createLeafTexture(maxAniso: number, baseHex: string, tipHex: string, veinHex: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 512);
  const grad = ctx.createLinearGradient(0, 512, 0, 0);
  grad.addColorStop(0, baseHex);
  grad.addColorStop(0.65, tipHex);
  grad.addColorStop(1, tipHex);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Central midrib
  ctx.strokeStyle = veinHex;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(128, 512);
  ctx.lineTo(128, 16);
  ctx.stroke();

  // Lateral veins
  ctx.lineWidth = 2;
  for (let y = 480; y > 40; y -= 28) {
    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.quadraticCurveTo(75, y - 16, 16, y - 48);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.quadraticCurveTo(181, y - 16, 240, y - 48);
    ctx.stroke();
  }

  // Subtle organic mottling
  const rand = seededRand(505);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rand() * 256, rand() * 512, 4, 8);
  }

  return finalizeTexture(canvas, true, maxAniso, 1, 1);
}

function createFishEyeTexture(maxAniso: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const cx = 64;
  const cy = 64;
  const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 62);
  grad.addColorStop(0, '#050608');
  grad.addColorStop(0.46, '#050608');
  grad.addColorStop(0.5, '#e8b648');
  grad.addColorStop(0.84, '#c77c26');
  grad.addColorStop(1, '#26180d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Crisp glossy catchlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(48, 46, 9, 0, Math.PI * 2);
  ctx.fill();

  return finalizeTexture(canvas, true, maxAniso, 1, 1);
}

function drawScalesOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 0.14): void {
  ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.lineWidth = 1.2;
  const stepX = 18;
  const stepY = 14;
  for (let row = 0; row < h / stepY + 2; row++) {
    const offset = (row % 2) * (stepX * 0.5);
    for (let col = 0; col < w / stepX + 2; col++) {
      const x = col * stepX + offset;
      const y = row * stepY;
      ctx.beginPath();
      ctx.arc(x, y, stepX * 0.52, -Math.PI * 0.4, Math.PI * 0.4);
      ctx.stroke();
    }
  }
}

function createFishSpeciesTexture(species: string, maxAniso: number): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const [canvas, ctx] = makeCanvas(w, h);
  const rand = seededRand(species.length * 913 + 17);

  if (species === 'discus_blue') {
    // Royal Turquoise Discus: deep cerulean body with luminous electric-turquoise horizontal striations & faint dark stress bars
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#103e6b');
    base.addColorStop(0.35, '#196f99');
    base.addColorStop(0.7, '#1d82a3');
    base.addColorStop(1, '#123e61');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Subtle vertical natural bars
    for (let b = 0; b < 7; b++) {
      const bx = 70 + b * 60;
      ctx.fillStyle = 'rgba(7, 22, 40, 0.28)';
      ctx.fillRect(bx, 0, 22, h);
    }

    // Wavy iridescent turquoise horizontal striations
    for (let s = 0; s < 16; s++) {
      const sy = 16 + s * 14.5;
      ctx.strokeStyle = s % 2 === 0 ? 'rgba(92, 240, 255, 0.78)' : 'rgba(235, 134, 72, 0.35)';
      ctx.lineWidth = s % 2 === 0 ? 4.2 : 2.8;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (let x = 0; x <= w; x += 24) {
        const wy = sy + Math.sin(x * 0.032 + s * 0.7) * 7.5;
        ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    drawScalesOverlay(ctx, w, h, 0.16);
  } else if (species === 'discus_orange') {
    // Pigeon Blood Tangerine Discus with pearlescent white marbling
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#ff8e3c');
    base.addColorStop(0.45, '#ff5924');
    base.addColorStop(0.85, '#e83e1c');
    base.addColorStop(1, '#ff9c54');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    for (let s = 0; s < 14; s++) {
      const sy = 18 + s * 16;
      ctx.strokeStyle = 'rgba(255, 243, 224, 0.65)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      for (let x = 0; x <= w; x += 28) {
        ctx.lineTo(x, sy + Math.cos(x * 0.038 + s) * 8);
      }
      ctx.stroke();
    }
    drawScalesOverlay(ctx, w, h, 0.15);
  } else if (species === 'angelfish') {
    // Koi Marbled Angelfish: pearly silver-white base, warm amber forehead crown, dramatic ink-black vertical bands & patches
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#f3efe6');
    base.addColorStop(0.5, '#e5e8ec');
    base.addColorStop(1, '#cfd7df');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);

    // Warm golden-orange koi crown near front/top
    const crown = ctx.createRadialGradient(w * 0.8, h * 0.25, 12, w * 0.78, h * 0.3, 150);
    crown.addColorStop(0, 'rgba(255, 134, 38, 0.95)');
    crown.addColorStop(0.65, 'rgba(247, 168, 56, 0.72)');
    crown.addColorStop(1, 'rgba(247, 168, 56, 0)');
    ctx.fillStyle = crown;
    ctx.fillRect(0, 0, w, h);

    // Bold black angelfish stripes
    const stripes = [
      { x: 110, width: 42 },
      { x: 245, width: 54 },
      { x: 380, width: 34 },
    ];
    for (const st of stripes) {
      ctx.fillStyle = 'rgba(18, 20, 24, 0.88)';
      ctx.beginPath();
      ctx.moveTo(st.x, 0);
      ctx.quadraticCurveTo(st.x - 16, h * 0.5, st.x + 8, h);
      ctx.lineTo(st.x + st.width, h);
      ctx.quadraticCurveTo(st.x + st.width - 14, h * 0.5, st.x + st.width + 6, 0);
      ctx.closePath();
      ctx.fill();
    }
    drawScalesOverlay(ctx, w, h, 0.12);
  } else if (species === 'neon') {
    // Neon Tetra: metallic silver belly, electric glowing cyan-blue upper lateral band, vivid crimson rear lower half
    ctx.fillStyle = '#d7e6f0';
    ctx.fillRect(0, 0, w, h);

    // Olive-silver dorsal ridge
    const back = ctx.createLinearGradient(0, 0, 0, h * 0.34);
    back.addColorStop(0, '#2a4a5e');
    back.addColorStop(1, '#5889a8');
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, w, h * 0.34);

    // Electric neon cyan stripe
    const neonGrad = ctx.createLinearGradient(0, h * 0.24, 0, h * 0.52);
    neonGrad.addColorStop(0, '#00f0ff');
    neonGrad.addColorStop(0.5, '#19d8ff');
    neonGrad.addColorStop(1, '#0088ff');
    ctx.fillStyle = neonGrad;
    ctx.fillRect(40, h * 0.26, w - 40, h * 0.24);

    // Vivid crimson-red rear lower section (tail is toward x = 0)
    const redGrad = ctx.createLinearGradient(0, 0, w * 0.62, 0);
    redGrad.addColorStop(0, '#ff1e38');
    redGrad.addColorStop(0.75, '#f2243b');
    redGrad.addColorStop(1, 'rgba(242, 36, 59, 0)');
    ctx.fillStyle = redGrad;
    ctx.fillRect(0, h * 0.48, w * 0.62, h * 0.44);
  } else if (species === 'swordtail') {
    // Red Wagtail Swordtail: glossy tangerine-vermilion body with pearly belly & dark fin edge
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, '#d92818');
    body.addColorStop(0.45, '#ff511e');
    body.addColorStop(0.8, '#ff8636');
    body.addColorStop(1, '#ffd59c');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);

    // Subtle horizontal gold shimmer band
    ctx.fillStyle = 'rgba(255, 224, 150, 0.32)';
    ctx.fillRect(0, h * 0.42, w, h * 0.14);
    drawScalesOverlay(ctx, w, h, 0.16);
  } else {
    // Peppered Corydoras: warm bronze-beige armored plates with dark charcoal leopard speckles
    const body = ctx.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, '#5a5042');
    body.addColorStop(0.5, '#9d8c74');
    body.addColorStop(0.85, '#cdbda5');
    body.addColorStop(1, '#dfd4c2');
    ctx.fillStyle = body;
    ctx.fillRect(0, 0, w, h);

    // Iridescent green-gold gill plate sheen
    const sheen = ctx.createRadialGradient(w * 0.72, h * 0.48, 8, w * 0.72, h * 0.48, 80);
    sheen.addColorStop(0, 'rgba(130, 214, 174, 0.5)');
    sheen.addColorStop(1, 'rgba(130, 214, 174, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 160; i++) {
      const sx = rand() * w;
      const sy = rand() * h * 0.78;
      const sr = 3 + rand() * 8;
      ctx.fillStyle = `rgba(34, 30, 24, ${0.42 + rand() * 0.42})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Subtle gill operculum arc near front (x ~ 0.72 * w)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(w * 0.71, h * 0.52, h * 0.26, Math.PI * 0.65, Math.PI * 1.35);
  ctx.stroke();

  return finalizeTexture(canvas, true, maxAniso, 1, 1);
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 126);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createParticleDotTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(215, 245, 255, 0.65)');
  grad.addColorStop(1, 'rgba(215, 245, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [sandColor, sandBump] = createSandTextures(maxAniso);
  const [rockColor, rockBump] = createRockTextures(maxAniso);
  const [woodColor, woodBump] = createWoodTextures(maxAniso, false);
  const [cabinetWoodColor, cabinetWoodBump] = createWoodTextures(maxAniso, true);
  const leafGreenColor = createLeafTexture(maxAniso, '#1f5c2d', '#4ea843', 'rgba(174, 232, 138, 0.45)');
  const leafRedColor = createLeafTexture(maxAniso, '#5c1f24', '#c9433c', 'rgba(255, 178, 150, 0.42)');
  const contactShadow = createContactShadowTexture();
  const particleDot = createParticleDotTexture();
  const fishEyeTexture = createFishEyeTexture(maxAniso);

  const speciesList = ['discus_blue', 'discus_orange', 'angelfish', 'neon', 'swordtail', 'corydoras'];
  const fishTextures: Record<string, THREE.CanvasTexture> = {};
  for (const sp of speciesList) {
    fishTextures[sp] = createFishSpeciesTexture(sp, maxAniso);
  }

  const allTextures: THREE.Texture[] = [
    sandColor,
    sandBump,
    rockColor,
    rockBump,
    woodColor,
    woodBump,
    cabinetWoodColor,
    cabinetWoodBump,
    leafGreenColor,
    leafRedColor,
    contactShadow,
    particleDot,
    fishEyeTexture,
    ...Object.values(fishTextures),
  ];

  return {
    sandColor,
    sandBump,
    rockColor,
    rockBump,
    woodColor,
    woodBump,
    cabinetWoodColor,
    cabinetWoodBump,
    leafGreenColor,
    leafRedColor,
    contactShadow,
    particleDot,
    fishTextures,
    fishEyeTexture,
    dispose: () => {
      for (const tex of allTextures) {
        tex.dispose();
      }
    },
  };
}
