import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AquariumTelemetry,
  CameraPresetId,
  FiltrationSettings,
  FishInfo,
  LIGHT_PRESETS,
  LightingSettings,
  WATER_TOP_Y,
} from '../types/aquarium';
import { buildAquascape, AquascapeBuildResult } from './aquascape';
import { AquariumAudioEngine } from './audioEngine';
import { buildFishSystem, FishAgent, FishSystemResult } from './fishSystem';
import { createProceduralTextures, ProceduralTextureSet } from './proceduralTextures';
import { buildSubstrate, CausticsUniforms, SubstrateBuildResult } from './substrate';
import { buildTankStructure, TankStructureResult } from './tankStructure';
import { buildWaterEffects, WaterEffectsResult } from './waterEffects';

export interface AquariumEngineCallbacks {
  onTelemetry: (telemetry: AquariumTelemetry) => void;
  onFishListUpdate: (fish: FishInfo[]) => void;
  onSelectFish: (fish: FishInfo | null) => void;
  onContextLost: (lost: boolean) => void;
}

const CAMERA_PRESETS: Record<
  Exclude<CameraPresetId, 'follow'>,
  { pos: THREE.Vector3; target: THREE.Vector3 }
> = {
  overview: {
    pos: new THREE.Vector3(0.4, 1.35, 11.4),
    target: new THREE.Vector3(0, -0.35, 0),
  },
  closeup: {
    pos: new THREE.Vector3(-1.1, 0.35, 6.2),
    target: new THREE.Vector3(-0.3, -0.15, -0.15),
  },
  top: {
    pos: new THREE.Vector3(0.2, 8.9, 5.2),
    target: new THREE.Vector3(0, 0.2, 0),
  },
  side: {
    pos: new THREE.Vector3(10.6, 0.85, 3.8),
    target: new THREE.Vector3(0, -0.2, 0),
  },
};

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/**
 * Converts Kelvin color temperature (3000K warm amber -> 6500K crisp white -> 12000K actinic blue)
 * into a smooth RGB THREE.Color.
 */
function kelvinToColor(kelvin: number, target: THREE.Color): THREE.Color {
  const k = THREE.MathUtils.clamp(kelvin, 3000, 12000);
  if (k < 6500) {
    const t = (k - 3000) / 3500;
    const r = 1.0;
    const g = THREE.MathUtils.lerp(0.68, 0.97, t);
    const b = THREE.MathUtils.lerp(0.42, 1.0, t);
    return target.setRGB(r, g, b);
  }
  const t = (k - 6500) / 5500;
  const r = THREE.MathUtils.lerp(0.96, 0.45, t);
  const g = THREE.MathUtils.lerp(0.98, 0.78, t);
  const b = 1.0;
  return target.setRGB(r, g, b);
}

// Reusable scratch objects (Zero GC inside render loop)
const _tmpKeyColor = new THREE.Color();
const _tmpKelvinColor = new THREE.Color();
const _tmpLedColor = new THREE.Color();
const _tmpWaterTint = new THREE.Color();
const _tmpShaftColor = new THREE.Color();
const _tmpBgColor = new THREE.Color();
const _tmpHemiSky = new THREE.Color();
const _tmpHemiGround = new THREE.Color();
const _followGoalPos = new THREE.Vector3();
const _followGoalTarget = new THREE.Vector3();
const _pointerNdc = new THREE.Vector2();

export class AquariumEngine {
  private container: HTMLElement;
  private callbacks: AquariumEngineCallbacks;
  private isSoftwareGl: boolean;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private textures: ProceduralTextureSet;
  private substrate: SubstrateBuildResult;
  private tank: TankStructureResult;
  private aquascape: AquascapeBuildResult;
  private waterEffects: WaterEffectsResult;
  private fishSystem: FishSystemResult;
  public audio: AquariumAudioEngine;

  // Lights
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private tankUnderGlow: THREE.PointLight;

  private causticsUniforms: CausticsUniforms;

  // Live state
  private lighting: LightingSettings = {
    preset: 'daylight',
    brightness: LIGHT_PRESETS.daylight.brightness,
    kelvin: LIGHT_PRESETS.daylight.kelvin,
  };
  private filtration: FiltrationSettings = {
    power: 75,
    aeration: true,
  };

  private clarity = 0.96; // 0..1
  private oxygen = 0.92; // 0..1
  private temperature = 25.4;
  private fedTotal = 0;

  // Camera transition & selection state
  private activeCameraPreset: CameraPresetId = 'overview';
  private transitionGoalPos: THREE.Vector3 | null = null;
  private transitionGoalTarget: THREE.Vector3 | null = null;
  private selectedFishId: string | null = null;
  private followFishId: string | null = null;
  private autoRotate = false;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private pointerDownPos = { x: 0, y: 0 };

  // Loop management
  private frameId = 0;
  private disposed = false;
  private lastTimeMs = 0;
  private elapsed = 0;
  private telemetryTimer = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, callbacks: AquariumEngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    // 1. Renderer setup with Software-WebGL guard & ACES Filmic color pipeline
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Fog & Studio Environment Reflection (RoomEnvironment)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070d14');
    this.scene.fog = new THREE.FogExp2('#070d14', 0.022);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envRenderTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    this.scene.environmentIntensity = 0.55;
    pmremGenerator.dispose();

    // 3. Camera & Smooth Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    this.camera.position.copy(CAMERA_PRESETS.overview.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(CAMERA_PRESETS.overview.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.72;
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.65;
    this.controls.minDistance = 2.8;
    this.controls.maxDistance = 20.5;
    this.controls.maxPolarAngle = Math.PI * 0.58; // Allows gazing slightly upward from below tank rim!
    this.controls.minPolarAngle = 0.14;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.55;

    // Cancel scripted camera transition immediately when user interacts
    this.controls.addEventListener('start', () => {
      this.transitionGoalPos = null;
      this.transitionGoalTarget = null;
      if (this.followFishId) {
        this.followFishId = null;
      }
    });

    // 4. Balanced 3-Point Studio + Overhead LED Aquarium Lighting Rig
    this.hemiLight = new THREE.HemisphereLight('#b9e3f5', '#1a2f2e', 0.9);
    this.scene.add(this.hemiLight);

    // Primary overhead LED key light (single shadow caster with crisp bounds)
    this.keyLight = new THREE.DirectionalLight('#f6fbff', 2.45);
    this.keyLight.position.set(1.2, 8.6, 2.2);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 18;
    this.keyLight.shadow.camera.left = -6.5;
    this.keyLight.shadow.camera.right = 6.5;
    this.keyLight.shadow.camera.top = 5.5;
    this.keyLight.shadow.camera.bottom = -5.5;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    // Soft front-left studio fill to illuminate cabinet & front fish scales
    this.fillLight = new THREE.DirectionalLight('#b5d9f5', 0.78);
    this.fillLight.position.set(-6.5, 2.2, 8.0);
    this.scene.add(this.fillLight);

    // Subtle back-right rim highlight for glass bevels & fish silhouettes
    this.rimLight = new THREE.DirectionalLight('#7fd8f5', 0.85);
    this.rimLight.position.set(5.2, 4.0, -7.2);
    this.scene.add(this.rimLight);

    // Internal warm/aqua water core glow
    this.tankUnderGlow = new THREE.PointLight('#6fd4f2', 1.5, 13, 1.5);
    this.tankUnderGlow.position.set(0, 1.2, 0.2);
    this.scene.add(this.tankUnderGlow);

    // 5. Build Procedural Textures & 3D World Modules
    this.textures = createProceduralTextures(this.renderer);
    this.causticsUniforms = {
      uTime: { value: 0 },
      uCausticsIntensity: { value: 1.0 },
      uCausticsColor: { value: new THREE.Color('#c8f6ff') },
    };

    this.tank = buildTankStructure(this.textures, this.isSoftwareGl);
    this.scene.add(this.tank.group);

    this.substrate = buildSubstrate(this.textures, this.causticsUniforms);
    this.scene.add(this.substrate.group);

    this.aquascape = buildAquascape(this.textures, this.causticsUniforms);
    this.scene.add(this.aquascape.group);

    this.waterEffects = buildWaterEffects(
      this.textures,
      this.tank.lilyPipeNozzlePos,
      this.tank.airstonePos,
    );
    this.scene.add(this.waterEffects.group);

    this.fishSystem = buildFishSystem(this.textures, this.aquascape.obstacles);
    this.scene.add(this.fishSystem.group);

    this.audio = new AquariumAudioEngine();

    // Raycast only Layer 1 (simplified fish hitboxes + water surface)
    this.raycaster.layers.set(1);

    // Pre-warm shaders on GPU devices
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind events
    this.bindEvents();
    this.applyLightingImmediate();
    this.emitTelemetry();
    this.callbacks.onFishListUpdate(this.fishSystem.getFishInfoList());

    // Start paced render loop
    this.lastTimeMs = performance.now();
    this.tick();
  }

  public setLighting(next: LightingSettings): void {
    this.lighting = { ...next };
  }

  public setFiltration(next: FiltrationSettings): void {
    this.filtration = { ...next };
    this.audio.updateFiltration(next.power / 100, next.aeration);
  }

  public purifyWater(): void {
    this.clarity = Math.min(1.0, this.clarity + 0.45);
    this.oxygen = Math.min(1.0, this.oxygen + 0.25);
    this.emitTelemetry();
  }

  public feedFish(worldX?: number, worldZ?: number): void {
    const added = this.waterEffects.dropFood(worldX, worldZ);
    if (added > 0) {
      this.audio.playFeedPlop();
      this.emitTelemetry();
    }
  }

  public setCameraPreset(preset: CameraPresetId): void {
    this.activeCameraPreset = preset;
    if (preset === 'follow') {
      const targetId = this.selectedFishId ?? this.fishSystem.agents[0]?.info.id ?? null;
      this.followFishId = targetId;
      if (targetId) {
        this.selectedFishId = targetId;
        const agent = this.fishSystem.getFishById(targetId);
        if (agent) this.callbacks.onSelectFish({ ...agent.info });
      }
      this.transitionGoalPos = null;
      this.transitionGoalTarget = null;
      return;
    }

    this.followFishId = null;
    const cfg = CAMERA_PRESETS[preset];
    this.transitionGoalPos = cfg.pos.clone();
    this.transitionGoalTarget = cfg.target.clone();
  }

  public selectFishById(id: string | null, shouldFollow = false): void {
    this.selectedFishId = id;
    if (!id) {
      this.followFishId = null;
      this.callbacks.onSelectFish(null);
      return;
    }
    const agent = this.fishSystem.getFishById(id);
    if (agent) {
      this.callbacks.onSelectFish({ ...agent.info });
      if (shouldFollow) {
        this.activeCameraPreset = 'follow';
        this.followFishId = id;
        this.transitionGoalPos = null;
        this.transitionGoalTarget = null;
      }
    }
  }

  public setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
    this.controls.autoRotate = !this.isSoftwareGl && enabled;
  }

  public setAudioEnabled(enabled: boolean): void {
    this.audio.setEnabled(enabled);
    this.audio.updateFiltration(this.filtration.power / 100, this.filtration.aeration);
  }

  private applyLightingImmediate(): void {
    this.updateLightingRig(1.0);
  }

  private updateLightingRig(alpha: number): void {
    const preset = LIGHT_PRESETS[this.lighting.preset];
    const bright01 = THREE.MathUtils.clamp(this.lighting.brightness / 100, 0.04, 1.0);

    // Blend preset palette with Kelvin temperature slider
    kelvinToColor(this.lighting.kelvin, _tmpKelvinColor);
    _tmpKeyColor.set(preset.keyColor).lerp(_tmpKelvinColor, 0.55);
    _tmpLedColor.set(preset.ledColor).lerp(_tmpKelvinColor, 0.6);
    _tmpShaftColor.set(preset.shaftColor).lerp(_tmpKelvinColor, 0.45);
    _tmpWaterTint.set(preset.waterTint);
    _tmpBgColor.set(preset.bgBottom).lerp(_tmpKeyColor, 0.04 * bright01);
    _tmpHemiSky.set(preset.hemiSky).lerp(_tmpKelvinColor, 0.35);
    _tmpHemiGround.set(preset.hemiGround);

    this.keyLight.color.lerp(_tmpKeyColor, alpha);
    this.keyLight.intensity = THREE.MathUtils.lerp(
      this.keyLight.intensity,
      0.35 + bright01 * 2.55,
      alpha,
    );

    this.hemiLight.color.lerp(_tmpHemiSky, alpha);
    this.hemiLight.groundColor.lerp(_tmpHemiGround, alpha);
    this.hemiLight.intensity = THREE.MathUtils.lerp(
      this.hemiLight.intensity,
      0.32 + bright01 * 0.72,
      alpha,
    );

    this.fillLight.intensity = THREE.MathUtils.lerp(
      this.fillLight.intensity,
      0.28 + bright01 * 0.62,
      alpha,
    );
    this.rimLight.color.lerp(_tmpShaftColor, alpha);
    this.rimLight.intensity = THREE.MathUtils.lerp(
      this.rimLight.intensity,
      0.3 + bright01 * 0.72,
      alpha,
    );

    this.tankUnderGlow.color.lerp(_tmpShaftColor, alpha);
    this.tankUnderGlow.intensity = THREE.MathUtils.lerp(
      this.tankUnderGlow.intensity,
      0.25 + bright01 * 1.55 * (0.55 + this.clarity * 0.45),
      alpha,
    );

    this.tank.ledStripMaterial.emissive.lerp(_tmpLedColor, alpha);
    this.tank.ledStripMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      this.tank.ledStripMaterial.emissiveIntensity,
      0.15 + bright01 * 2.4,
      alpha,
    );

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.lerp(_tmpBgColor, alpha);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(_tmpBgColor, alpha);
    }

    this.causticsUniforms.uCausticsColor.value.lerp(_tmpShaftColor, alpha);
    this.causticsUniforms.uCausticsIntensity.value = THREE.MathUtils.lerp(
      this.causticsUniforms.uCausticsIntensity.value,
      preset.causticsIntensity * bright01 * (0.35 + this.clarity * 0.65),
      alpha,
    );
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.x = e.clientX;
    this.pointerDownPos.y = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return; // User was dragging camera

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const fishHits = this.raycaster.intersectObjects(this.fishSystem.hitboxes, false);
    if (fishHits.length > 0) {
      const fishId = fishHits[0].object.userData.fishId as string | undefined;
      if (fishId) {
        this.selectFishById(fishId, false);
      }
    }
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.waterEffects.waterSurfaceMesh, false);
    if (hits.length > 0) {
      const pt = hits[0].point;
      this.feedFish(pt.x, pt.z);
    }
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('dblclick', this.onDoubleClick);
    dom.addEventListener('webglcontextlost', this.onContextLost, false);
    dom.addEventListener('webglcontextrestored', this.onContextRestored, false);
    window.addEventListener('resize', this.handleResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize());
      this.resizeObserver.observe(this.container);
    }
  }

  private emitTelemetry(): void {
    this.callbacks.onTelemetry({
      clarity: Math.round(this.clarity * 100),
      temperature: Number(this.temperature.toFixed(1)),
      oxygen: Math.round(this.oxygen * 100),
      activeFoodCount: this.waterEffects.foodParticles.length,
      fishCount: this.fishSystem.agents.length,
      fedTotal: this.fedTotal,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimeMs) / 1000;
    this.lastTimeMs = now;
    const dt = THREE.MathUtils.clamp(rawDt, 0.001, 0.08);
    this.elapsed += dt;

    const filter01 = this.filtration.power / 100;
    const preset = LIGHT_PRESETS[this.lighting.preset];
    const bright01 = THREE.MathUtils.clamp(this.lighting.brightness / 100, 0.04, 1.0);

    // 1. Dynamic Water Clarity & Oxygen Simulation (driven genuinely by Filtration & Feeding!)
    const uneatenPenalty = this.waterEffects.foodParticles.length * 0.0018;
    const clarityTarget = THREE.MathUtils.clamp(0.32 + filter01 * 0.68 - uneatenPenalty, 0.25, 1.0);
    const clarityRate = clarityTarget > this.clarity ? 0.14 + filter01 * 0.28 : 0.06;
    this.clarity = THREE.MathUtils.damp(this.clarity, clarityTarget, clarityRate, dt);

    const oxygenTarget = THREE.MathUtils.clamp(
      0.42 + (this.filtration.aeration ? 0.34 : 0) + filter01 * 0.24,
      0.38,
      1.0,
    );
    this.oxygen = THREE.MathUtils.damp(this.oxygen, oxygenTarget, 0.22, dt);

    // Gentle thermostat cycle on heater indicator
    const heaterPulse = 0.5 + 0.5 * Math.sin(this.elapsed * 0.65);
    this.tank.heaterGlowMaterial.emissiveIntensity = 0.8 + heaterPulse * 1.1;
    this.temperature = 25.3 + heaterPulse * 0.2;

    // 2. Smoothly update lighting & caustics
    this.causticsUniforms.uTime.value = this.elapsed * (0.75 + filter01 * 0.55);
    this.updateLightingRig(1 - Math.exp(-5.5 * dt));

    // 3. Update Aquascape sway, Water surface/bubbles/food, and Fish AI
    this.aquascape.update(this.elapsed, filter01);

    this.waterEffects.update(
      dt,
      this.elapsed,
      filter01,
      this.filtration.aeration,
      this.clarity,
      this.keyLight.color,
      bright01,
      _tmpWaterTint.set(preset.waterTint),
      _tmpShaftColor,
    );

    this.fishSystem.update(
      dt,
      this.elapsed,
      this.waterEffects.foodParticles,
      this.aquascape.obstacles,
      preset.fishSpeedScale,
      filter01,
      (food, _fish: FishAgent) => {
        this.waterEffects.markFoodEaten(food);
        this.fedTotal++;
        this.audio.playNibble();
      },
    );

    // 4. Smooth Camera Presets & Fish Follow Mode
    if (this.followFishId) {
      const targetFish = this.fishSystem.getFishById(this.followFishId);
      if (targetFish) {
        _followGoalTarget.copy(targetFish.position);
        const orbitAngle = this.elapsed * 0.22;
        _followGoalPos.set(
          THREE.MathUtils.clamp(targetFish.position.x + Math.sin(orbitAngle) * 2.4, -5.8, 5.8),
          THREE.MathUtils.clamp(targetFish.position.y + 0.65, -0.8, WATER_TOP_Y + 2.4),
          THREE.MathUtils.clamp(targetFish.position.z + Math.cos(orbitAngle) * 2.8 + 1.8, 3.4, 8.2),
        );
        const k = 1 - Math.exp(-3.2 * dt);
        this.controls.target.lerp(_followGoalTarget, k);
        this.camera.position.lerp(_followGoalPos, k * 0.75);
      }
    } else if (this.transitionGoalPos && this.transitionGoalTarget) {
      const k = 1 - Math.exp(-4.8 * dt);
      this.camera.position.lerp(this.transitionGoalPos, k);
      this.controls.target.lerp(this.transitionGoalTarget, k);
      if (
        this.camera.position.distanceToSquared(this.transitionGoalPos) < 0.0025 &&
        this.controls.target.distanceToSquared(this.transitionGoalTarget) < 0.0025
      ) {
        this.camera.position.copy(this.transitionGoalPos);
        this.controls.target.copy(this.transitionGoalTarget);
        this.transitionGoalPos = null;
        this.transitionGoalTarget = null;
      }
    }

    // Update OrbitControls
    if (this.autoRotate && !this.isSoftwareGl && !this.followFishId) {
      this.controls.autoRotate = true;
    } else {
      this.controls.autoRotate = false;
    }
    this.controls.update();

    // 5. Periodic React HUD Telemetry Sync (4 Hz to keep React ultra-lightweight!)
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.25) {
      this.telemetryTimer = 0;
      this.emitTelemetry();
      if (this.selectedFishId) {
        const agent = this.fishSystem.getFishById(this.selectedFishId);
        if (agent) this.callbacks.onSelectFish({ ...agent.info });
      }
    }

    // 6. Render frame & pace next tick
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('dblclick', this.onDoubleClick);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.handleResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    this.audio.dispose();
    this.controls.dispose();
    this.fishSystem.dispose();
    this.waterEffects.dispose();
    this.aquascape.dispose();
    this.substrate.dispose();
    this.tank.dispose();
    this.textures.dispose();
    this.envRenderTarget.dispose();
    this.renderer.dispose();

    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
