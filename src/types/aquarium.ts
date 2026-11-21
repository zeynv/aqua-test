export const TANK_W = 10.4;
export const TANK_H = 5.4;
export const TANK_D = 4.8;
export const GLASS_T = 0.08;

export const TANK_HALF_W = TANK_W / 2;
export const TANK_HALF_H = TANK_H / 2;
export const TANK_HALF_D = TANK_D / 2;

export const WATER_TOP_Y = TANK_HALF_H - 0.36; // 2.34
export const TANK_BOTTOM_Y = -TANK_HALF_H; // -2.7

export type LightPresetId = 'daylight' | 'sunrise' | 'sunset' | 'reef' | 'moonlight';

export type CameraPresetId = 'overview' | 'closeup' | 'top' | 'side' | 'follow';

export interface LightPreset {
  id: LightPresetId;
  label: string;
  kelvin: number;
  brightness: number; // 0..100
  keyColor: string;
  ledColor: string;
  hemiSky: string;
  hemiGround: string;
  waterTint: string;
  shaftColor: string;
  bgTop: string;
  bgBottom: string;
  causticsIntensity: number;
  fishSpeedScale: number;
}

export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  daylight: {
    id: 'daylight',
    label: 'Дневной',
    kelvin: 6800,
    brightness: 88,
    keyColor: '#f6fbff',
    ledColor: '#e8f7ff',
    hemiSky: '#b9e3f5',
    hemiGround: '#1a2f2e',
    waterTint: '#166e85',
    shaftColor: '#9be7ff',
    bgTop: '#0b1520',
    bgBottom: '#060a0f',
    causticsIntensity: 1.0,
    fishSpeedScale: 1.0,
  },
  sunrise: {
    id: 'sunrise',
    label: 'Рассвет',
    kelvin: 4600,
    brightness: 74,
    keyColor: '#ffd9b8',
    ledColor: '#ffe0c4',
    hemiSky: '#f5b89c',
    hemiGround: '#241c1a',
    waterTint: '#256c78',
    shaftColor: '#ffd4a6',
    bgTop: '#161118',
    bgBottom: '#08070b',
    causticsIntensity: 0.88,
    fishSpeedScale: 0.92,
  },
  sunset: {
    id: 'sunset',
    label: 'Закат',
    kelvin: 3400,
    brightness: 70,
    keyColor: '#ffb570',
    ledColor: '#ffc285',
    hemiSky: '#e88b5a',
    hemiGround: '#211510',
    waterTint: '#36585c',
    shaftColor: '#ffba75',
    bgTop: '#18100d',
    bgBottom: '#090707',
    causticsIntensity: 0.82,
    fishSpeedScale: 0.85,
  },
  reef: {
    id: 'reef',
    label: 'Актиник',
    kelvin: 11200,
    brightness: 84,
    keyColor: '#8ad8ff',
    ledColor: '#66ccff',
    hemiSky: '#3ba6e6',
    hemiGround: '#0a1e33',
    waterTint: '#0d568a',
    shaftColor: '#54c4ff',
    bgTop: '#06111f',
    bgBottom: '#040810',
    causticsIntensity: 1.12,
    fishSpeedScale: 1.04,
  },
  moonlight: {
    id: 'moonlight',
    label: 'Лунный',
    kelvin: 12000,
    brightness: 32,
    keyColor: '#5c89cc',
    ledColor: '#4c7fd6',
    hemiSky: '#233f6b',
    hemiGround: '#060c17',
    waterTint: '#08264a',
    shaftColor: '#4674bf',
    bgTop: '#040811',
    bgBottom: '#020408',
    causticsIntensity: 0.45,
    fishSpeedScale: 0.56,
  },
};

export interface LightingSettings {
  preset: LightPresetId;
  brightness: number; // 0..100
  kelvin: number; // 3000..12000
}

export interface FiltrationSettings {
  power: number; // 0..100
  aeration: boolean;
}

export interface FishInfo {
  id: string;
  speciesId: 'discus_blue' | 'discus_orange' | 'angelfish' | 'neon' | 'swordtail' | 'corydoras';
  name: string;
  latinName: string;
  zone: string;
  temperament: string;
  satiety: number; // 0..100
  isEating: boolean;
  accentHex: string;
}

export interface AquariumTelemetry {
  clarity: number; // 0..100
  temperature: number; // ~25.4 C
  oxygen: number; // 0..100
  activeFoodCount: number;
  fishCount: number;
  fedTotal: number;
}

export interface ObstacleSphere {
  x: number;
  y: number;
  z: number;
  r: number;
}
