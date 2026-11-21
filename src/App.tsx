/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AquariumHUD } from './components/AquariumHUD';
import { AquariumEngine } from './engine/AquariumEngine';
import {
  AquariumTelemetry,
  CameraPresetId,
  FiltrationSettings,
  FishInfo,
  LIGHT_PRESETS,
  LightingSettings,
} from './types/aquarium';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AquariumEngine | null>(null);

  const [lighting, setLighting] = useState<LightingSettings>({
    preset: 'daylight',
    brightness: LIGHT_PRESETS.daylight.brightness,
    kelvin: LIGHT_PRESETS.daylight.kelvin,
  });
  const [filtration, setFiltration] = useState<FiltrationSettings>({
    power: 75,
    aeration: true,
  });
  const [telemetry, setTelemetry] = useState<AquariumTelemetry>({
    clarity: 96,
    temperature: 25.4,
    oxygen: 92,
    activeFoodCount: 0,
    fishCount: 16,
    fedTotal: 0,
  });
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overview');
  const [autoRotate, setAutoRotate] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [fishList, setFishList] = useState<FishInfo[]>([]);
  const [selectedFish, setSelectedFish] = useState<FishInfo | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  // Mount Three.js WebGL engine once inside isolated container ref
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new AquariumEngine(container, {
      onTelemetry: (next) => setTelemetry(next),
      onFishListUpdate: (list) => setFishList(list),
      onSelectFish: (fish) => setSelectedFish(fish),
      onContextLost: (lost) => setContextLost(lost),
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleFeed = useCallback(() => {
    engineRef.current?.feedFish();
  }, []);

  const handleChangeLighting = useCallback((next: LightingSettings) => {
    setLighting(next);
    engineRef.current?.setLighting(next);
  }, []);

  const handleChangeFiltration = useCallback((next: FiltrationSettings) => {
    setFiltration(next);
    engineRef.current?.setFiltration(next);
  }, []);

  const handlePurifyWater = useCallback(() => {
    engineRef.current?.purifyWater();
  }, []);

  const handleSelectCamera = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    engineRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      return next;
    });
  }, []);

  const handleToggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      engineRef.current?.setAudioEnabled(next);
      return next;
    });
  }, []);

  const handleSelectFish = useCallback((id: string | null, follow = false) => {
    engineRef.current?.selectFishById(id, follow);
    if (id && follow) {
      setCameraPreset('follow');
    }
  }, []);

  // Convenient keyboard shortcuts: F = Feed fish, H = Hide/Show HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'KeyF') {
        handleFeed();
      } else if (e.code === 'KeyH') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'Escape') {
        handleSelectFish(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleFeed, handleSelectFish]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#070b10]">
      {/* Dedicated isolated WebGL Canvas Mount Container */}
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        aria-label="Интерактивная 3D-сцена аквариума"
      />

      {/* Graceful WebGL context-lost fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#070b10]/95 p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-white/12 bg-[#0b1118] p-6">
            <h2 className="text-base font-semibold text-white">Восстановление 3D-рендера</h2>
            <p className="mt-2 text-sm text-slate-400">
              Графический контекст WebGL временно приостановлен браузером. Подождите секунду или обновите страницу.
            </p>
          </div>
        </div>
      )}

      {/* Semantic DOM HUD Overlay */}
      <AquariumHUD
        lighting={lighting}
        filtration={filtration}
        telemetry={telemetry}
        cameraPreset={cameraPreset}
        autoRotate={autoRotate}
        audioEnabled={audioEnabled}
        fishList={fishList}
        selectedFish={selectedFish}
        dockCollapsed={dockCollapsed}
        onToggleDock={() => setDockCollapsed((p) => !p)}
        onFeed={handleFeed}
        onChangeLighting={handleChangeLighting}
        onChangeFiltration={handleChangeFiltration}
        onPurifyWater={handlePurifyWater}
        onSelectCamera={handleSelectCamera}
        onToggleAutoRotate={handleToggleAutoRotate}
        onToggleAudio={handleToggleAudio}
        onSelectFish={handleSelectFish}
      />
    </main>
  );
}
