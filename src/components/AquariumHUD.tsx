import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Droplets,
  Eye,
  Fish,
  RotateCcw,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import {
  AquariumTelemetry,
  CameraPresetId,
  FiltrationSettings,
  FishInfo,
  LIGHT_PRESETS,
  LightPresetId,
  LightingSettings,
} from '../types/aquarium';

type DockTab = 'lighting' | 'filtration' | 'camera' | 'fish';

interface AquariumHUDProps {
  lighting: LightingSettings;
  filtration: FiltrationSettings;
  telemetry: AquariumTelemetry;
  cameraPreset: CameraPresetId;
  autoRotate: boolean;
  audioEnabled: boolean;
  fishList: FishInfo[];
  selectedFish: FishInfo | null;
  dockCollapsed: boolean;
  onToggleDock: () => void;
  onFeed: () => void;
  onChangeLighting: (next: LightingSettings) => void;
  onChangeFiltration: (next: FiltrationSettings) => void;
  onPurifyWater: () => void;
  onSelectCamera: (preset: CameraPresetId) => void;
  onToggleAutoRotate: () => void;
  onToggleAudio: () => void;
  onSelectFish: (id: string | null, follow?: boolean) => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'overview', label: 'Общий вид' },
  { id: 'closeup', label: 'Крупный план' },
  { id: 'side', label: 'Сбоку' },
  { id: 'top', label: 'Сверху' },
  { id: 'follow', label: 'Следить за рыбкой' },
];

const LIGHT_PRESET_ORDER: LightPresetId[] = ['daylight', 'sunrise', 'sunset', 'reef', 'moonlight'];

const PRESET_SWATCHES: Record<LightPresetId, string> = {
  daylight: '#e0f4ff',
  sunrise: '#ffd2a6',
  sunset: '#ff9d52',
  reef: '#38bdf8',
  moonlight: '#446db5',
};

const FILTER_SPEED_MODES = [
  { label: 'Выкл', power: 0 },
  { label: 'Тихий', power: 35 },
  { label: 'Стандарт', power: 75 },
  { label: 'Турбо', power: 100 },
];

export const AquariumHUD: React.FC<AquariumHUDProps> = ({
  lighting,
  filtration,
  telemetry,
  cameraPreset,
  autoRotate,
  audioEnabled,
  fishList,
  selectedFish,
  dockCollapsed,
  onToggleDock,
  onFeed,
  onChangeLighting,
  onChangeFiltration,
  onPurifyWater,
  onSelectCamera,
  onToggleAutoRotate,
  onToggleAudio,
  onSelectFish,
}) => {
  const [activeTab, setActiveTab] = useState<DockTab>('lighting');
  const [feedPulse, setFeedPulse] = useState(false);

  const handleFeedClick = () => {
    onFeed();
    setFeedPulse(true);
    window.setTimeout(() => setFeedPulse(false), 260);
  };

  const handleSelectLightPreset = (presetId: LightPresetId) => {
    const preset = LIGHT_PRESETS[presetId];
    onChangeLighting({
      preset: presetId,
      brightness: preset.brightness,
      kelvin: preset.kelvin,
    });
  };

  // Deduplicate species summary for quick jump-to-fish strip
  const featuredFish = fishList.filter((f, idx, arr) => {
    if (f.speciesId === 'neon') {
      return arr.findIndex((x) => x.speciesId === 'neon') === idx;
    }
    return true;
  });

  const clarityLabel =
    telemetry.clarity >= 88
      ? 'Кристальная'
      : telemetry.clarity >= 65
        ? 'Нормальная'
        : 'Мутнеет';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
      {/* Top Minimal Unobtrusive Header (Left: Title + Clean Unboxed Metrics | Right: Selected Fish Card if active) */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-slate-50 leading-none">
            АкваСфера 3D
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-300/90 font-mono-tabular">
            <span>{telemetry.temperature.toFixed(1)} °C</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>Прозрачность {telemetry.clarity}%</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>O₂ {telemetry.oxygen}%</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>{telemetry.fishCount} рыб</span>
          </div>
        </div>

        {/* Discreet Selected Fish Inspection Card (Only shown when user clicks a fish) */}
        {selectedFish && (
          <div className="pointer-events-auto w-68 rounded-xl border border-white/12 bg-[#0b1118]/92 p-3.5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedFish.accentHex }}
                  />
                  <h2 className="truncate text-sm font-semibold text-slate-50">
                    {selectedFish.name}
                  </h2>
                </div>
                <p className="mt-0.5 truncate text-xs italic text-slate-400">
                  {selectedFish.latinName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectFish(null)}
                aria-label="Закрыть карточку рыбки"
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/8 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-2.5 space-y-1.5 border-t border-white/8 pt-2.5 text-xs text-slate-300">
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Слой воды</span>
                <span className="text-right text-slate-200">{selectedFish.zone}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-400">Характер</span>
                <span className="text-right text-slate-200">{selectedFish.temperament}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400">Сытость</span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all duration-200"
                      style={{ width: `${Math.round(selectedFish.satiety)}%` }}
                    />
                  </div>
                  <span className="font-mono-tabular text-slate-200">
                    {Math.round(selectedFish.satiety)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectFish(selectedFish.id, true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500/18 px-3 py-1.5 text-xs font-medium text-sky-200 transition-colors hover:bg-sky-500/28 whitespace-nowrap"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Следить камерой</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Center Occlusion, Zero backdrop-filter over WebGL) */}
      <div className="flex flex-col items-center">
        {/* Subtle interactive hint above dock when expanded */}
        {!dockCollapsed && (
          <p className="mb-1.5 hidden text-[11px] text-slate-400/85 sm:block">
            Вращайте мышью · Колёсико — масштаб · Двойной клик по воде — бросить корм · Клик по рыбке — осмотр
          </p>
        )}

        {/* Collapse / Expand Drawer Handle */}
        <button
          type="button"
          onClick={onToggleDock}
          className="pointer-events-auto mb-1.5 flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#0b1118]/92 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-white/22 hover:text-white whitespace-nowrap"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Панель управления</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Скрыть панель</span>
            </>
          )}
        </button>

        {/* Main Bottom Dock Container */}
        <div
          className={`pointer-events-auto w-full max-w-[920px] overflow-hidden rounded-2xl border border-white/12 bg-[#0b1118]/94 shadow-2xl transition-all duration-200 ease-out ${
            dockCollapsed
              ? 'pointer-events-none max-h-0 translate-y-4 border-transparent opacity-0'
              : 'max-h-[340px] translate-y-0 opacity-100'
          }`}
        >
          {/* Top Row: Primary Feed CTA + Segmented Control Tabs + Quick Audio & Reset */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 px-3.5 py-2.5 sm:flex-nowrap">
            {/* Primary Action: Feed Fish */}
            <button
              type="button"
              onClick={handleFeedClick}
              className={`flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-transform duration-150 hover:bg-sky-400 active:scale-95 whitespace-nowrap shrink-0 cursor-pointer ${
                feedPulse ? 'scale-95 bg-sky-300' : ''
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Покормить рыб</span>
              {telemetry.activeFoodCount > 0 && (
                <span className="font-mono-tabular text-[11px] text-slate-900/80">
                  ({telemetry.activeFoodCount})
                </span>
              )}
            </button>

            {/* Segmented Mode Tabs */}
            <div
              role="tablist"
              aria-label="Разделы управления аквариумом"
              className="flex items-center gap-1 rounded-xl bg-white/5 p-1"
            >
              {(
                [
                  { id: 'lighting', label: 'Освещение', Icon: Sun },
                  { id: 'filtration', label: 'Фильтрация', Icon: Droplets },
                  { id: 'camera', label: 'Камера', Icon: Camera },
                  { id: 'fish', label: 'Рыбки', Icon: Fish },
                ] as const
              ).map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={isActive}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-slate-100 text-slate-950'
                        : 'text-slate-300 hover:bg-white/6 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Utility Controls: Procedural Sound + Camera Reset */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onToggleAudio}
                title={audioEnabled ? 'Выключить звук воды' : 'Включить звук воды'}
                aria-label={audioEnabled ? 'Выключить звук воды' : 'Включить звук воды'}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  audioEnabled
                    ? 'border-sky-400/40 bg-sky-500/15 text-sky-300'
                    : 'border-white/10 bg-white/4 text-slate-400 hover:text-slate-100'
                }`}
              >
                {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => onSelectCamera('overview')}
                title="Сбросить ракурс камеры"
                aria-label="Сбросить ракурс камеры"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-slate-400 transition-colors hover:text-slate-100 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Active Tab Content Area */}
          <div className="px-4 py-3">
            {activeTab === 'lighting' && (
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
                {/* Preset Selector */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {LIGHT_PRESET_ORDER.map((presetId) => {
                    const preset = LIGHT_PRESETS[presetId];
                    const active = lighting.preset === presetId;
                    return (
                      <button
                        key={presetId}
                        type="button"
                        onClick={() => handleSelectLightPreset(presetId)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-sky-400/60 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full border border-black/30"
                          style={{ backgroundColor: PRESET_SWATCHES[presetId] }}
                        />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sliders: Brightness & Kelvin */}
                <div className="flex flex-1 flex-wrap items-center gap-5 sm:flex-nowrap">
                  <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Яркость LED</span>
                      <span className="font-mono-tabular text-slate-200">{lighting.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min={8}
                      max={100}
                      value={lighting.brightness}
                      onChange={(e) =>
                        onChangeLighting({ ...lighting, brightness: Number(e.target.value) })
                      }
                      className="aqua-slider w-full"
                    />
                  </label>

                  <label className="flex min-w-[150px] flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Спектр</span>
                      <span className="font-mono-tabular text-slate-200">{lighting.kelvin} K</span>
                    </div>
                    <input
                      type="range"
                      min={3000}
                      max={12000}
                      step={200}
                      value={lighting.kelvin}
                      onChange={(e) =>
                        onChangeLighting({ ...lighting, kelvin: Number(e.target.value) })
                      }
                      className="aqua-slider w-full"
                    />
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'filtration' && (
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-5">
                {/* Filter Power Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {FILTER_SPEED_MODES.map((m) => {
                    const active = Math.abs(filtration.power - m.power) <= 6;
                    return (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => onChangeFiltration({ ...filtration, power: m.power })}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-sky-400/60 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                {/* Continuous Flow Power Slider */}
                <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Мощность фильтра · {clarityLabel}</span>
                    <span className="font-mono-tabular text-slate-200">{filtration.power}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={filtration.power}
                    onChange={(e) =>
                      onChangeFiltration({ ...filtration, power: Number(e.target.value) })
                    }
                    className="aqua-slider w-full"
                  />
                </label>

                {/* Aeration Toggle + Instant Purify Flush */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeFiltration({ ...filtration, aeration: !filtration.aeration })
                    }
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      filtration.aeration
                        ? 'border-sky-400/50 bg-sky-500/18 text-sky-200'
                        : 'border-white/10 bg-white/4 text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    <Wind className="h-3.5 w-3.5" />
                    <span>Аэрация: {filtration.aeration ? 'Вкл' : 'Выкл'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onPurifyWater}
                    className="rounded-lg border border-white/12 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/12 whitespace-nowrap cursor-pointer"
                  >
                    Очистить воду
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'camera' && (
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {CAMERA_OPTIONS.map((opt) => {
                    const active = cameraPreset === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSelectCamera(opt.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-sky-400/60 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onToggleAutoRotate}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoRotate
                      ? 'border-sky-400/60 bg-sky-500/18 text-sky-200'
                      : 'border-white/10 bg-white/4 text-slate-300 hover:text-white'
                  }`}
                >
                  Автоповорот: {autoRotate ? 'Вкл' : 'Выкл'}
                </button>
              </div>
            )}

            {activeTab === 'fish' && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {featuredFish.map((fish) => {
                    const active = selectedFish?.id === fish.id;
                    return (
                      <button
                        key={fish.id}
                        type="button"
                        onClick={() => onSelectFish(fish.id, true)}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'border-sky-400/60 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: fish.accentHex }}
                        />
                        <span>{fish.name}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
                  Съедено корма: {telemetry.fedTotal}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
