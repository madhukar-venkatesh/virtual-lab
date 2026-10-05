import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { DLCQuiz } from './components/DLCQuiz';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, Stage } from '@react-three/drei';
import { Controls } from './components/Controls';
import { SimpleMuscleTwitch } from './components/SimpleMuscleTwitch';
import { GenesisOfFatigue } from './components/GenesisOfFatigue';
import { DataPoint } from './types';

// Lazy load heavy components
const Muscle3D = lazy(() => import('./components/Muscle3D').then(m => ({ default: m.Muscle3D })));
const Microscope3D = lazy(() => import('./components/Microscope3D').then(m => ({ default: m.Microscope3D })));
const Oscilloscope = lazy(() => import('./components/Oscilloscope').then(m => ({ default: m.Oscilloscope })));
const TwoSuccessiveStimuli = lazy(() => import('./components/TwoSuccessiveStimuli').then(m => ({ default: m.TwoSuccessiveStimuli })));
const EffectOfLoad = lazy(() => import('./components/EffectOfLoad').then(m => ({ default: m.EffectOfLoad })));
const GenesisOfTetanus = lazy(() => import('./components/GenesisOfTetanus').then(m => ({ default: m.GenesisOfTetanus })));
const EffectOfTemperature = lazy(() => import('./components/EffectOfTemperature').then(m => ({ default: m.EffectOfTemperature })));
const EffectOfStimulusStrength = lazy(() => import('./components/EffectOfStimulusStrength').then(m => ({ default: m.EffectOfStimulusStrength })));
const ConductionVelocity = lazy(() => import('./components/ConductionVelocity').then(m => ({ default: m.ConductionVelocity })));
const NormalCardiogram = lazy(() => import('./components/NormalCardiogram').then(m => ({ default: m.NormalCardiogram })));
const PropertiesOfCardiacMuscle = lazy(() => import('./components/PropertiesOfCardiacMuscle').then(m => ({ default: m.PropertiesOfCardiacMuscle })));



import {
  ArrowLeft,
  Activity,
  Droplet,
  Zap,
  Scale,
  ChevronRight,
  FlaskConical,
  Microscope,
  Grid3X3,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ZoomIn,
  ListChecks,
  Timer,
  RefreshCw,
  Dna,
  Info,
  History,
  X,
  MessageCircle,
  Star,
  Send,
  ExternalLink,
  Library,
  Loader,
  BatteryWarning,
  Thermometer,
  Heart,
  Target
} from 'lucide-react';

// --- Simulation Constants ---
const THRESHOLD_VOLTAGE = 2.5;
const MAX_VOLTAGE = 8.0;
const LATENT_PERIOD_BASE = 20; // ms
const CONTRACTION_TIME_BASE = 80; // ms
const RELAXATION_TIME_BASE = 150; // ms
const EXPERIMENT_DURATION = 500; // ms

// --- Shared Types ---
type ViewState = 'home' | 'amphibian' | 'hematology' | 'twitch' | 'load' | 'fatigue' | 'two-stimuli' | 'effect-of-load' | 'wbc-count' | 'rbc-count' | 'dlc-count' | 'dlc-quiz' | 'genesis-tetanus' | 'effect-of-temperature' | 'microscope' | 'stimulus-strength' | 'conduction-velocity' | 'normal-cardiogram' | 'properties-cardiac-muscle';

// --- GA4 Analytics Helpers ---
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const MODULE_LABELS: Record<ViewState, string> = {
  'home': 'Home',
  'amphibian': 'Amphibian Menu',
  'hematology': 'Hematology Menu',
  'twitch': 'Simple Muscle Twitch',
  'load': 'Effect of Load',
  'fatigue': 'Genesis of Fatigue',
  'two-stimuli': 'Two Successive Stimuli',
  'effect-of-load': 'Effect of Load',
  'wbc-count': 'WBC Count (TLC)',
  'rbc-count': 'RBC Count',
  'dlc-count': 'DLC Count',
  'dlc-quiz': 'DLC Quiz',
  'genesis-tetanus': 'Genesis of Tetanus',
  'effect-of-temperature': 'Effect of Temperature',
  'microscope': 'Microscope Master',
  'stimulus-strength': 'Effect of Stimulus Strength',
  'conduction-velocity': 'Conduction Velocity',
  'normal-cardiogram': 'Normal Cardiogram',
  'properties-cardiac-muscle': 'Properties of Cardiac Muscle',
};

const MODULE_CATEGORIES: Record<ViewState, string> = {
  'home': 'Navigation',
  'amphibian': 'Navigation',
  'hematology': 'Navigation',
  'twitch': 'Amphibian',
  'load': 'Amphibian',
  'fatigue': 'Amphibian',
  'two-stimuli': 'Amphibian',
  'effect-of-load': 'Amphibian',
  'genesis-tetanus': 'Amphibian',
  'effect-of-temperature': 'Amphibian',
  'stimulus-strength': 'Amphibian',
  'conduction-velocity': 'Amphibian',
  'normal-cardiogram': 'Amphibian',
  'properties-cardiac-muscle': 'Amphibian',
  'wbc-count': 'Hematology',
  'rbc-count': 'Hematology',
  'dlc-count': 'Hematology',
  'dlc-quiz': 'Hematology',
  'microscope': 'Microscope',
};

let _moduleEntryTime: number | null = null;
let _currentModule: ViewState | null = null;

function _sendTimeSpent() {
  if (_currentModule && _moduleEntryTime) {
    const timeSpent = Math.round((Date.now() - _moduleEntryTime) / 1000);
    if (timeSpent > 0) {
      window.gtag?.('event', 'module_time_spent', {
        module_id: _currentModule,
        module_name: MODULE_LABELS[_currentModule],
        module_category: MODULE_CATEGORIES[_currentModule],
        time_seconds: timeSpent,
        value: timeSpent, // GA4 uses 'value' for aggregation
      });
    }
  }
}

function trackModuleView(view: ViewState) {
  // Send time_spent for previous module
  _sendTimeSpent();

  // Update current module tracking
  _currentModule = view;
  _moduleEntryTime = Date.now();

  // 1) Virtual page view — powers GA4's Pages & Screens reports
  window.gtag?.('event', 'page_view', {
    page_title: MODULE_LABELS[view],
    page_location: window.location.origin + '/virtual-lab/' + view,
    page_path: '/virtual-lab/' + view,
  });

  // 2) Custom module_view event — for custom reports & funnels
  window.gtag?.('event', 'module_view', {
    module_id: view,
    module_name: MODULE_LABELS[view],
    module_category: MODULE_CATEGORIES[view],
  });
}

// Track experiment interactions (start, complete, etc.)
export function trackExperiment(action: string, details: Record<string, any> = {}) {
  window.gtag?.('event', 'experiment_interaction', {
    action,
    module_id: _currentModule,
    module_name: _currentModule ? MODULE_LABELS[_currentModule] : 'unknown',
    module_category: _currentModule ? MODULE_CATEGORIES[_currentModule] : 'unknown',
    ...details,
  });
}

// Send time_spent when user leaves / switches tab / closes browser
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _sendTimeSpent();
    }
  });
  window.addEventListener('beforeunload', () => {
    _sendTimeSpent();
  });
}

// --- Loading Component ---
const LoadingSpinner: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center w-full h-full min-h-[200px] bg-slate-900/50">
    <div className="relative">
      <Loader className="w-12 h-12 text-blue-500 animate-spin" />
      <div className="absolute inset-0 w-12 h-12 rounded-full bg-blue-500/20 animate-ping" />
    </div>
    <p className="mt-4 text-slate-400 text-sm font-medium animate-pulse">{message}</p>
  </div>
);

// --- Shared Components ---

const MenuCard: React.FC<{
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  colorClass: string;
  disabled?: boolean;
}> = ({ title, description, icon, onClick, colorClass, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`
      relative group overflow-hidden p-6 rounded-2xl border transition-all duration-300 text-left w-full
      ${disabled
        ? 'bg-slate-900/50 border-slate-800 opacity-50 cursor-not-allowed'
        : `bg-slate-800 border-slate-700 hover:border-slate-500 hover:shadow-2xl hover:shadow-${colorClass}-500/20 hover:-translate-y-1`
      }
    `}
  >
    <div className={`
      absolute top-0 right-0 p-32 opacity-5 rounded-full blur-3xl transition-transform duration-500 group-hover:scale-150
      bg-${colorClass}-500
    `} />

    <div className="relative z-10 flex flex-col h-full">
      <div className={`p-3 w-fit rounded-xl mb-4 bg-slate-900/80 text-${colorClass}-400 ring-1 ring-slate-700`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-100 mb-2">{title}</h3>

      {!disabled && (
        <div className={`mt-auto pt-6 flex items-center text-sm font-semibold text-${colorClass}-400 opacity-0 group-hover:opacity-100 transition-opacity`}>
          Enter Lab <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      )}
    </div>
  </button>
);

// --- REUSABLE MICROSCOPE STAGE ---

interface MicroscopeStageProps {
  title: string;
  subtitle: string;
  onBack: () => void;
  renderSlide: (zoom: number) => React.ReactNode;
  controls?: React.ReactNode;
  infoPanel: React.ReactNode;
  initialPosition?: { x: number, y: number };
}

const MicroscopeStage: React.FC<MicroscopeStageProps> = ({
  title, subtitle, onBack, renderSlide, controls, infoPanel, initialPosition
}) => {
  const [zoom, setZoom] = useState<4 | 10 | 40 | 100>(10);
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });


  /* Restore Pan Logic */
  const MAX_PAN = 400;

  // Zoom scales: 4x -> 0.7, 10x -> 1.3, 40x -> 5, 100x -> 13
  const getScale = (z: number) => {
    switch (z) {
      case 4: return 0.7;
      case 10: return 1.3;
      case 40: return 5;
      case 100: return 13;
      default: return 1;
    }
  };
  const currentScale = getScale(zoom);

  const handlePan = (dx: number, dy: number) => {
    const speedFactor = 1.5 / currentScale;
    setPosition(prev => ({
      x: Math.max(-MAX_PAN, Math.min(MAX_PAN, prev.x + (dx * speedFactor))),
      y: Math.max(-MAX_PAN, Math.min(MAX_PAN, prev.y + (dy * speedFactor)))
    }));
  };

  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    const deltaX = -dx / currentScale;
    const deltaY = -dy / currentScale;

    setPosition(prev => ({
      x: Math.max(-MAX_PAN, Math.min(MAX_PAN, prev.x + deltaX)),
      y: Math.max(-MAX_PAN, Math.min(MAX_PAN, prev.y + deltaY))
    }));

    dragStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragStart.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
              {title}
            </h1>
            <p className="text-slate-400 text-xs">{subtitle}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row h-full overflow-hidden">
        {/* Left: Microscope View */}
        <div
          className="flex-1 bg-black relative flex items-center justify-center overflow-hidden touch-none cursor-move"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Zoom Indicators */}
          <div className="absolute top-4 left-4 z-30 flex gap-2 pointer-events-none">
            {[4, 10, 40, 100].map((z) => (
              <button
                key={z}
                onPointerDown={(e) => e.stopPropagation()}
                className={`
                    w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all pointer-events-auto
                    ${zoom === z
                    ? 'bg-indigo-600 border-indigo-400 text-white scale-110 shadow-[0_0_15px_rgba(99,102,241,0.5)]'
                    : 'bg-slate-900/80 border-slate-700 text-slate-400 hover:bg-slate-800'}
                  `}
                onClick={() => setZoom(z as 4 | 10 | 40 | 100)}
              >
                {z}x
              </button>
            ))}
          </div>

          {/* Eyepiece */}
          <div className="relative w-[300px] h-[300px] md:w-[500px] md:h-[500px] rounded-full overflow-hidden border-[12px] border-slate-800 shadow-[0_0_100px_rgba(0,0,0,1)] bg-[#eef2ff] pointer-events-none">
            <div className="absolute inset-0 z-20 pointer-events-none rounded-full bg-[radial-gradient(circle,transparent_50%,rgba(0,0,0,0.3)_80%,rgba(0,0,0,0.9)_100%)]"></div>

            {/* SLIDE CONTENT CONTAINER */}
            <div
              key={zoom}
              className="absolute w-[800px] h-[800px] origin-center"
              style={{
                transform: `translate(calc(-50% + ${-position.x * currentScale}px), calc(-50% + ${-position.y * currentScale}px)) scale(${currentScale})`,
                left: '50%',
                top: '50%',
                willChange: 'transform'
              }}
            >
              {renderSlide(zoom)}
            </div>
          </div>

          {/* Mini-map */}
          <div className="absolute bottom-4 right-4 bg-slate-900/80 p-2 rounded border border-slate-700 z-30 pointer-events-none">
            <div className="w-20 h-20 bg-slate-800 relative border border-slate-600 overflow-hidden">
              <div
                className="absolute w-4 h-4 border-2 border-red-500 bg-transparent shadow-[0_0_5px_red]"
                style={{
                  left: `${((position.x + MAX_PAN) / (MAX_PAN * 2)) * 100}%`,
                  top: `${((position.y + MAX_PAN) / (MAX_PAN * 2)) * 100}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              ></div>
            </div>
            <div className="text-[10px] text-center mt-1 text-slate-400">Stage Position</div>
          </div>
        </div>

        {/* Right: Controls Panel */}
        <div className="bg-slate-900 border-l border-slate-800 p-6 flex flex-col gap-6 w-full lg:w-96 shrink-0 z-20 shadow-xl overflow-y-auto">
          {infoPanel}

          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 shadow-inner flex flex-col items-center gap-2">
            <span className="text-xs font-bold text-slate-500 mb-1">STAGE CONTROLS</span>
            <button
              className="p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-white border border-slate-700"
              onClick={() => handlePan(0, -50)}
            >
              <ArrowUp className="w-6 h-6" />
            </button>
            <div className="flex gap-2">
              <button
                className="p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-white border border-slate-700"
                onClick={() => handlePan(-50, 0)}
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <div className="w-14 h-14 flex items-center justify-center bg-slate-900 rounded-full border border-slate-800">
                <Move className="w-6 h-6 text-slate-600" />
              </div>
              <button
                className="p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-white border border-slate-700"
                onClick={() => handlePan(50, 0)}
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>
            <button
              className="p-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 rounded-lg text-white border border-slate-700"
              onClick={() => handlePan(0, 50)}
            >
              <ArrowDown className="w-6 h-6" />
            </button>
          </div>

          {controls}
        </div>
      </main>
    </div>
  );
};

// --- HEMATOLOGY EXPERIMENTS ---

// Shared helper functions for Neubauer chamber grid
const LINE_THICKNESS = 1; // All lines same thickness

const render4x4Grid = (x: number, y: number, size: number, extendLines: { top?: boolean, bottom?: boolean, left?: boolean, right?: boolean } = {}) => {
  const lines = [];
  const subSize = size / 4;

  // Vertical lines - 3 internal lines (all should extend if needed)
  for (let i = 1; i < 4; i++) {
    const xPos = x + i * subSize;
    let yStart = y;
    let yEnd = y + size;

    // Extend ALL 3 vertical lines into middle squares if needed
    if (extendLines.left) {
      yStart = y - size; // Extend to left middle square
    }
    if (extendLines.right) {
      yEnd = y + size * 2; // Extend to right middle square
    }

    lines.push(
      <line key={`v-${x}-${y}-${i}`}
        x1={xPos} y1={yStart}
        x2={xPos} y2={yEnd}
        stroke="#64748b" strokeWidth={LINE_THICKNESS} />
    );
  }

  // Horizontal lines - 3 internal lines (all should extend if needed)
  for (let i = 1; i < 4; i++) {
    const yPos = y + i * subSize;
    let xStart = x;
    let xEnd = x + size;

    // Extend ALL 3 horizontal lines into middle squares if needed
    if (extendLines.top) {
      xStart = x - size; // Extend to top middle square
    }
    if (extendLines.bottom) {
      xEnd = x + size * 2; // Extend to bottom middle square
    }

    lines.push(
      <line key={`h-${x}-${y}-${i}`}
        x1={xStart} y1={yPos}
        x2={xEnd} y2={yPos}
        stroke="#64748b" strokeWidth={LINE_THICKNESS} />
    );
  }
  return <g key={`grid-${x}-${y}`}>{lines}</g>;
};

// Helper to render triple lines (3 parallel lines) - all same thickness
const renderTripleLine = (x1: number, y1: number, x2: number, y2: number, key: string, isVertical: boolean) => {
  const offset = 1.5; // Spacing between the 3 parallel lines
  const lines = [];

  // Draw all 3 parallel lines
  for (let i = -1; i <= 1; i++) {
    if (isVertical) {
      lines.push(
        <line key={`${key}-${i}`}
          x1={x1 + i * offset} y1={y1}
          x2={x2 + i * offset} y2={y2}
          stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
      );
    } else {
      lines.push(
        <line key={`${key}-${i}`}
          x1={x1} y1={y1 + i * offset}
          x2={x2} y2={y2 + i * offset}
          stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
      );
    }
  }
  return <g key={key}>{lines}</g>;
};

// Helper to render the dense center grid (5x5 large squares, each with 4x4 subdivision)
const renderCenterDenseGrid = (centerX: number, centerY: number, centerSize: number, squareSize: number) => {
  const largeSquareSize = centerSize / 5; // 5x5 grid of large squares
  const tinySquareSize = largeSquareSize / 4; // Each large square has 4x4 tiny squares

  const elements = [];

  // Draw the 5x5 large squares with their 4x4 subdivisions
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const largeX = centerX + col * largeSquareSize;
      const largeY = centerY + row * largeSquareSize;

      // Draw border of large square - same thickness as all lines
      elements.push(
        <rect key={`large-${row}-${col}`}
          x={largeX} y={largeY}
          width={largeSquareSize} height={largeSquareSize}
          fill="none" stroke="#334155" strokeWidth={LINE_THICKNESS} />
      );

      // Draw 4x4 grid inside each large square - same thickness
      for (let subRow = 1; subRow < 4; subRow++) {
        elements.push(
          <line key={`h-sub-${row}-${col}-${subRow}`}
            x1={largeX} y1={largeY + subRow * tinySquareSize}
            x2={largeX + largeSquareSize} y2={largeY + subRow * tinySquareSize}
            stroke="#64748b" strokeWidth={LINE_THICKNESS} />
        );
      }
      for (let subCol = 1; subCol < 4; subCol++) {
        elements.push(
          <line key={`v-sub-${row}-${col}-${subCol}`}
            x1={largeX + subCol * tinySquareSize} y1={largeY}
            x2={largeX + subCol * tinySquareSize} y2={largeY + largeSquareSize}
            stroke="#64748b" strokeWidth={LINE_THICKNESS} />
        );
      }
    }
  }

  // Draw triple lines - 5 vertical and 5 horizontal lines that extend FULLY through center AND into middle squares
  // These are the lines that divide the 5x5 grid (6 lines total, but we draw 5 internal ones as triple lines)

  // 5 vertical triple lines - extend fully through center (from top to bottom of center square) AND into middle squares
  for (let i = 1; i <= 5; i++) {
    const xPos = centerX + i * largeSquareSize;
    // Full line through center square AND extending into top-middle and bottom-middle
    elements.push(renderTripleLine(xPos, centerY - squareSize, xPos, centerY + centerSize + squareSize, `v-triple-${i}`, true));
  }

  // 5 horizontal triple lines - extend fully through center (from left to right of center square) AND into middle squares
  for (let i = 1; i <= 5; i++) {
    const yPos = centerY + i * largeSquareSize;
    // Full line through center square AND extending into left-middle and right-middle
    elements.push(renderTripleLine(centerX - squareSize, yPos, centerX + centerSize + squareSize, yPos, `h-triple-${i}`, false));
  }

  // Top border triple line - horizontal line at top edge of center square, extends fully through center and into left-middle and right-middle
  const topBorderY = centerY;
  elements.push(renderTripleLine(centerX - squareSize, topBorderY, centerX + centerSize + squareSize, topBorderY, `h-triple-top-border`, false));

  // Left border triple line - vertical line at left edge of center square, extends fully through center and into top-middle and bottom-middle
  const leftBorderX = centerX;
  elements.push(renderTripleLine(leftBorderX, centerY - squareSize, leftBorderX, centerY + centerSize + squareSize, `v-triple-left-border`, true));

  return <g>{elements}</g>;
};

// 1. WBC Experiment
const WBCExperiment: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [cells] = useState(() => {
    // Generate WBCs in corners (Neubauer: 4 corners are for WBC)
    const newCells: { id: number, x: number, y: number }[] = [];
    const GRID_SIZE = 900;
    const squareSize = GRID_SIZE / 3; // 3x3 grid, all squares same size
    const corners = [
      { x: 0, y: 0 }, // Top Left
      { x: squareSize * 2, y: 0 }, // Top Right
      { x: 0, y: squareSize * 2 }, // Bottom Left
      { x: squareSize * 2, y: squareSize * 2 } // Bottom Right
    ];
    let id = 0;
    corners.forEach(c => {
      for (let i = 0; i < 50; i++) {
        newCells.push({
          id: id++,
          x: c.x + Math.random() * (squareSize - 20) + 10,
          y: c.y + Math.random() * (squareSize - 20) + 10
        });
      }
    });
    return newCells;
  });

  // Calculate initial position to center on Top Left WBC square
  // Grid Logic:
  // Top Left WBC Square is at (0,0) in grid coordinates.
  // Center of Top Left WBC Square is at (squareSize/2, squareSize/2).
  // Microscope view is centered at slide center (450, 450) by default when position is (0,0).
  // We want the view to be centered at (150, 150) [because squareSize=300].
  // So we need to shift the view by (150 - 450, 150 - 450) = (-300, -300).
  // Wait, let's check the transform logic again:
  // transform: `translate(calc(-50% + ${-position.x * currentScale}px), calc(-50% + ${-position.y * currentScale}px))`
  // This means 'position' represents the offset from the CENTER of the slide that we want to look at.
  // Slide Center is (450, 450).
  // Top Left WBC Center is (150, 150).
  // So position = (150 - 450, 150 - 450) = (-300, -300).

  const GRID_SIZE = 900;
  const squareSize = GRID_SIZE / 3;
  const initialX = (squareSize / 2) - (GRID_SIZE / 2) + 35; // Shift +50 to move view down-right (placing W in top-left)
  const initialY = (squareSize / 2) - (GRID_SIZE / 2) + 35; // Shift +50 to move view down-right (placing W in top-left)


  return (
    <MicroscopeStage
      title="WBC Count (TLC)"
      subtitle="Total Leukocyte Count • Neubauer Chamber"
      onBack={onBack}
      initialPosition={{ x: initialX, y: initialY }}
      infoPanel={
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Grid3X3 className="w-4 h-4 text-red-400" /> Counting Rules
          </h3>
          <p className="text-sm text-slate-400 mb-2">
            Count cells in the <span className="text-white font-bold">4 Corner Squares</span> (W).
          </p>
          <ul className="text-xs text-slate-500 list-disc list-inside space-y-1">
            <li>Each corner is a large square with 4x4 grid.</li>
            <li>Count cells in all 16 small squares of each corner.</li>
            <li>Include cells on Top & Left lines.</li>
            <li>Exclude cells on Bottom & Right lines.</li>
          </ul>
        </div>
      }
      renderSlide={(zoom) => {
        const GRID_SIZE = 900;
        const squareSize = GRID_SIZE / 3; // 3x3 grid, all squares same size
        const centerX = squareSize;
        const centerY = squareSize;
        const centerSize = squareSize;

        return (
          <div className="relative w-full h-full bg-[#f8fafc]">
            <svg width="100%" height="100%" viewBox="0 0 900 900" className="opacity-90">
              {/* Main outer border - 3mm square - same thickness */}
              <rect x="0" y="0" width="900" height="900" fill="none" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />

              {/* Main dividers - lines separating 3x3 grid - same thickness */}
              <line x1={squareSize} y1="0" x2={squareSize} y2="900" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1={squareSize * 2} y1="0" x2={squareSize * 2} y2="900" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1="0" y1={squareSize} x2="900" y2={squareSize} stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1="0" y1={squareSize * 2} x2="900" y2={squareSize * 2} stroke="#1e293b" strokeWidth={LINE_THICKNESS} />

              {/* Dense center grid (5x5 with 4x4 subdivisions) - for RBC counting */}
              {renderCenterDenseGrid(centerX, centerY, centerSize, squareSize)}

              {/* 4 Corner areas (WBC counting) - each is a large square with 4x4 grid */}
              {/* Top Left - ALL 3 horizontal lines extend right into top-middle, ALL 3 vertical lines extend down into left-middle */}
              {render4x4Grid(0, 0, squareSize, { right: true, bottom: true })}
              <text x={squareSize / 2} y={squareSize / 2} fill="#94a3b8" fontSize="100" textAnchor="middle" opacity="0.3" pointerEvents="none">W</text>

              {/* Top Right - ALL 3 horizontal lines extend left into top-middle, ALL 3 vertical lines extend down into right-middle */}
              {render4x4Grid(squareSize * 2, 0, squareSize, { left: true, bottom: true })}
              <text x={squareSize * 2.5} y={squareSize / 2} fill="#94a3b8" fontSize="100" textAnchor="middle" opacity="0.3" pointerEvents="none">W</text>

              {/* Bottom Left - ALL 3 horizontal lines extend right into bottom-middle, ALL 3 vertical lines extend up into left-middle */}
              {render4x4Grid(0, squareSize * 2, squareSize, { right: true, top: true })}
              <text x={squareSize / 2} y={squareSize * 2.5} fill="#94a3b8" fontSize="100" textAnchor="middle" opacity="0.3" pointerEvents="none">W</text>

              {/* Bottom Right - ALL 3 horizontal lines extend left into bottom-middle, ALL 3 vertical lines extend up into right-middle */}
              {render4x4Grid(squareSize * 2, squareSize * 2, squareSize, { left: true, top: true })}
              <text x={squareSize * 2.5} y={squareSize * 2.5} fill="#94a3b8" fontSize="100" textAnchor="middle" opacity="0.3" pointerEvents="none">W</text>
            </svg>

            {/* Cells */}
            {cells.map(c => {
              const baseSize = zoom === 4 ? 0.5 : zoom === 10 ? 1 : zoom === 40 ? 3 : 6;

              if (zoom <= 10) {
                // 10x and 4x: Simple blue dots
                return (
                  <div
                    key={c.id}
                    className="absolute rounded-full bg-[#1e3a8a] shadow-sm"
                    style={{
                      left: `${(c.x / GRID_SIZE) * 100}%`,
                      top: `${(c.y / GRID_SIZE) * 100}%`,
                      width: baseSize,
                      height: baseSize,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                );
              } else {
                // 40x and 100x: Stained nucleus, transparent cytoplasm
                // We use a container (cytoplasm) and a nested div (nucleus)
                return (
                  <div
                    key={c.id}
                    className="absolute rounded-full border border-blue-200/30 bg-blue-50/10"
                    style={{
                      left: `${(c.x / GRID_SIZE) * 100}%`,
                      top: `${(c.y / GRID_SIZE) * 100}%`,
                      width: baseSize,
                      height: baseSize,
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {/* Nucleus: Dark purple/blue, slightly irregular */}
                    <div
                      className="bg-[#4c1d95] opacity-80"
                      style={{
                        width: '70%',
                        height: '70%',
                        borderRadius: '45% 55% 50% 50% / 50% 45% 55% 50%', // Slightly irregular shape
                      }}
                    />
                  </div>
                );
              }
            })}
          </div>
        );
      }}
    />
  );
};

// 2. RBC Experiment
const RBCExperiment: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [cells] = useState(() => {
    // Generate RBCs in Center Square (Neubauer: Center is for RBC)
    const newCells: { id: number, x: number, y: number }[] = [];
    const GRID_SIZE = 900;
    const squareSize = GRID_SIZE / 3; // 3x3 grid, all squares same size
    const centerX = squareSize;
    const centerY = squareSize;
    const centerSize = squareSize;

    let id = 0;
    // RBCs are very dense. Generate 2500 randomly distributed in the center grid.
    for (let i = 0; i < 2500; i++) {
      newCells.push({
        id: id++,
        x: centerX + Math.random() * (centerSize - 10) + 5,
        y: centerY + Math.random() * (centerSize - 10) + 5
      });
    }
    return newCells;
  });

  return (
    <MicroscopeStage
      title="RBC Count"
      subtitle="Total Erythrocyte Count • Center Square"
      onBack={onBack}
      infoPanel={
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Droplet className="w-4 h-4 text-pink-400" /> Counting Rules
          </h3>
          <p className="text-sm text-slate-400 mb-2">
            Count cells in the <span className="text-white font-bold">Center Square</span> (R).
            The center has a 5x5 grid of large squares, each subdivided into 4x4 tiny squares.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Count in the 5 central large squares (middle row and column).
          </p>
        </div>
      }
      renderSlide={(zoom) => {
        const GRID_SIZE = 900;
        const squareSize = GRID_SIZE / 3; // 3x3 grid, all squares same size
        const centerX = squareSize;
        const centerY = squareSize;
        const centerSize = squareSize;

        return (
          <div className="relative w-full h-full bg-[#f8fafc]">
            <svg width="100%" height="100%" viewBox="0 0 900 900" className="opacity-90">
              {/* Main outer border - 3mm square - same thickness */}
              <rect x="0" y="0" width="900" height="900" fill="none" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />

              {/* Main dividers - lines separating 3x3 grid - same thickness */}
              <line x1={squareSize} y1="0" x2={squareSize} y2="900" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1={squareSize * 2} y1="0" x2={squareSize * 2} y2="900" stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1="0" y1={squareSize} x2="900" y2={squareSize} stroke="#1e293b" strokeWidth={LINE_THICKNESS} />
              <line x1="0" y1={squareSize * 2} x2="900" y2={squareSize * 2} stroke="#1e293b" strokeWidth={LINE_THICKNESS} />

              {/* Dense center grid (5x5 with 4x4 subdivisions) - for RBC counting */}
              {renderCenterDenseGrid(centerX, centerY, centerSize, squareSize)}

              {/* 4 Corner areas (WBC counting) - each is a large square with 4x4 grid */}
              {/* Top Left - ALL 3 horizontal lines extend right into top-middle, ALL 3 vertical lines extend down into left-middle */}
              {render4x4Grid(0, 0, squareSize, { right: true, bottom: true })}

              {/* Top Right - ALL 3 horizontal lines extend left into top-middle, ALL 3 vertical lines extend down into right-middle */}
              {render4x4Grid(squareSize * 2, 0, squareSize, { left: true, bottom: true })}

              {/* Bottom Left - ALL 3 horizontal lines extend right into bottom-middle, ALL 3 vertical lines extend up into left-middle */}
              {render4x4Grid(0, squareSize * 2, squareSize, { right: true, top: true })}

              {/* Bottom Right - ALL 3 horizontal lines extend left into bottom-middle, ALL 3 vertical lines extend up into right-middle */}
              {render4x4Grid(squareSize * 2, squareSize * 2, squareSize, { left: true, top: true })}

              {/* Center label */}
              <text x={GRID_SIZE / 2} y={GRID_SIZE / 2} fill="#94a3b8" fontSize="80" textAnchor="middle" opacity="0.2" pointerEvents="none">RBC AREA</text>
            </svg>

            {/* RBCs - Small red dots - 470 randomly distributed in center square only */}
            {cells.map(c => (
              <div
                key={c.id}
                className="absolute rounded-full bg-red-500/80 shadow-sm"
                style={{
                  left: `${(c.x / GRID_SIZE) * 100}%`,
                  top: `${(c.y / GRID_SIZE) * 100}%`,
                  width: zoom === 4 ? 0.25 : zoom === 10 ? 0.5 : zoom === 40 ? 1.5 : 3,
                  height: zoom === 4 ? 0.25 : zoom === 10 ? 0.5 : zoom === 40 ? 1.5 : 3,
                  boxShadow: '0 0 2px rgba(239, 68, 68, 0.4)'
                }}
              />
            ))}
          </div>
        );
      }}
    />
  );
};

// 3. DLC Experiment
const DLCExperiment: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  // DLC Logic: Blood smear background. Random cells placed around.
  // User pans to find them and clicks counters.
  type CellType = 'Neutrophil' | 'Lymphocyte' | 'Monocyte' | 'Eosinophil' | 'Basophil';

  const [counts, setCounts] = useState<Record<CellType, number>>({
    Neutrophil: 0, Lymphocyte: 0, Monocyte: 0, Eosinophil: 0, Basophil: 0
  });

  const increment = (type: CellType) => setCounts(prev => ({ ...prev, [type]: prev[type] + 1 }));
  const total = Object.values(counts).reduce((a: number, b: number) => a + b, 0);

  // Generate random RBCs (many RBCs for dense coverage)
  const [rbcs] = useState(() => {
    const newRbcs = [];
    // Simple seeded random for consistency
    let seed = 12345;
    const seededRandom = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    // 5000 RBCs for dense coverage (keeping performance reasonable)
    for (let i = 0; i < 5000; i++) {
      newRbcs.push({
        id: i,
        x: seededRandom() * 780 + 10,
        y: seededRandom() * 780 + 10
      });
    }
    return newRbcs;
  });

  // Generate random WBC cells on a "smear"
  const [cells] = useState(() => {
    const newCells = [];
    let id = 0;

    // Exact distribution for 100 cells
    const distribution: Record<CellType, number> = {
      Neutrophil: 60,
      Lymphocyte: 30,
      Monocyte: 5,
      Eosinophil: 4,
      Basophil: 1
    };

    // Create pool of types
    const typesPool: CellType[] = [];
    (Object.keys(distribution) as CellType[]).forEach(type => {
      for (let i = 0; i < distribution[type]; i++) {
        typesPool.push(type);
      }
    });

    // Shuffle types
    for (let i = typesPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [typesPool[i], typesPool[j]] = [typesPool[j], typesPool[i]];
    }

    // Generate cells
    for (let i = 0; i < 100; i++) {
      newCells.push({
        id: id++,
        x: Math.random() * 700 + 50,
        y: Math.random() * 700 + 50,
        type: typesPool[i]
      });
    }
    return newCells;
  });

  const renderCell = (type: CellType, zoom: number) => {
    // Render at appropriate size for each zoom - 10x smaller than original
    const size = zoom === 100 ? 5 : zoom === 40 ? 2.5 : zoom === 10 ? 0.8 : 0.4;
    const displaySize = Math.max(size, 4); // Minimum 4px for visibility
    const monocyteMultiplier = type === 'Monocyte' ? 1.3 : 1;
    const finalSize = displaySize * monocyteMultiplier;

    const cellColors: Record<CellType, { bg: string; nucleus: string; accent?: string }> = {
      Neutrophil: { bg: '#fce7f3', nucleus: '#581c87' },
      Lymphocyte: { bg: '#fce7f3', nucleus: '#4c1d95' },
      Monocyte: { bg: '#fce7f3', nucleus: '#6b21a8' },
      Eosinophil: { bg: '#fdf2f8', nucleus: '#7c3aed', accent: '#ef4444' },
      Basophil: { bg: '#eff6ff', nucleus: '#1e3a8a', accent: '#1e40af' }
    };

    const colors = cellColors[type];

    return (
      <svg
        key={`${type}-${zoom}`}
        width={finalSize}
        height={finalSize}
        viewBox="0 0 40 40"
        style={{ display: 'block' }}
      >
        <circle cx="20" cy="20" r="18" fill={colors.bg} stroke="#f9a8d4" strokeWidth="1" />

        {type === 'Neutrophil' && (
          <>
            <circle cx="12" cy="14" r="6" fill={colors.nucleus} />
            <circle cx="24" cy="16" r="5" fill={colors.nucleus} />
            <circle cx="16" cy="26" r="6" fill={colors.nucleus} />
            <rect x="12" y="16" width="10" height="3" fill={colors.nucleus} transform="rotate(30 16 18)" />
          </>
        )}

        {type === 'Lymphocyte' && (
          <circle cx="20" cy="20" r="15" fill={colors.nucleus} />
        )}

        {type === 'Monocyte' && (
          <ellipse cx="20" cy="20" rx="12" ry="10" fill={colors.nucleus} transform="rotate(-20 20 20)" />
        )}

        {type === 'Eosinophil' && (
          <>
            <circle cx="12" cy="20" r="6" fill={colors.nucleus} opacity="0.7" />
            <circle cx="28" cy="20" r="6" fill={colors.nucleus} opacity="0.7" />
            <rect x="14" y="18" width="12" height="4" fill={colors.nucleus} opacity="0.7" />
            <circle cx="10" cy="10" r="2" fill={colors.accent} />
            <circle cx="30" cy="10" r="2" fill={colors.accent} />
            <circle cx="10" cy="30" r="2" fill={colors.accent} />
            <circle cx="30" cy="30" r="2" fill={colors.accent} />
            <circle cx="20" cy="8" r="1.6" fill={colors.accent} />
            <circle cx="20" cy="32" r="1.6" fill={colors.accent} />
          </>
        )}

        {type === 'Basophil' && (
          <>
            <circle cx="20" cy="20" r="10" fill={colors.nucleus} opacity="0.4" />
            <circle cx="8" cy="12" r="3" fill={colors.accent} />
            <circle cx="16" cy="8" r="3" fill={colors.accent} />
            <circle cx="26" cy="10" r="3" fill={colors.accent} />
            <circle cx="32" cy="18" r="3" fill={colors.accent} />
            <circle cx="30" cy="28" r="3" fill={colors.accent} />
            <circle cx="20" cy="32" r="3" fill={colors.accent} />
            <circle cx="10" cy="28" r="3" fill={colors.accent} />
            <circle cx="8" cy="20" r="3" fill={colors.accent} />
            <circle cx="20" cy="20" r="2.4" fill={colors.accent} />
          </>
        )}
      </svg>
    );
  };

  return (
    <MicroscopeStage
      title="DLC Count"
      subtitle="Differential Leucocyte Count • Blood Smear"
      onBack={onBack}
      infoPanel={
        <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-white">Cell Counter</h3>
            <span className="text-xl font-mono text-green-400">{total} / 100</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(counts) as CellType[]).map(type => (
              <button
                key={type}
                onClick={() => increment(type)}
                className="flex justify-between items-center p-2 bg-slate-700 hover:bg-slate-600 rounded text-xs border border-slate-600"
              >
                <span className="text-slate-200">{type}</span>
                <span className="bg-slate-900 px-2 py-0.5 rounded text-indigo-400 font-mono">{counts[type]}</span>
              </button>
            ))}
          </div>
          {/* Real Cells Button */}
          <button
            onClick={() => window.open('https://biolucida.net:443/image?c=MTk4Ny1jb2wtOTEtMC0wLTEtMA%3D%3D', '_blank')}
            className="mt-4 w-full py-3 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 rounded-xl font-bold text-white border border-purple-400/50 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center gap-2 animate-pulse hover:animate-none"
          >
            <Microscope className="w-5 h-5" />
            Practice on Real Slide (Web)
            <ExternalLink className="w-4 h-4 opacity-70" />
          </button>
          <button
            onClick={() => window.open('https://www.cellavision.com/node/1162', '_blank')}
            className="mt-3 w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 rounded-xl font-bold text-white border border-blue-400/50 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <Library className="w-5 h-5" />
            Cell Atlas
            <ExternalLink className="w-4 h-4 opacity-70" />
          </button>
        </div>
      }
      renderSlide={(zoom) => (
        <div className="relative w-full h-full bg-[#ffeef2]">

          {/* Cells */}
          {cells.map(c => (
            <div key={c.id} className="absolute" style={{ left: c.x, top: c.y }}>
              {renderCell(c.type, zoom)}
            </div>
          ))}
          {/* RBCs - half the size of WBCs, 700:1 ratio */}
          {rbcs.map(rbc => {
            // WBC displaySize is 4px, so RBC is 2px (half)
            const rbcSize = zoom === 100 ? 2 : zoom === 40 ? 1.5 : zoom === 10 ? 0.6 : 0.3;
            return (
              <div
                key={`rbc-${rbc.id}`}
                className="absolute rounded-full"
                style={{
                  left: rbc.x,
                  top: rbc.y,
                  width: rbcSize,
                  height: rbcSize,
                  backgroundColor: 'rgba(239, 68, 68, 0.7)'
                }}
              />
            );
          })}
        </div>
      )}
    />
  );
};


// --- AMPHIBIAN EXPERIMENTS ---

// 4. Twitch Experiment (Existing & Refined)
// Moved logic to a hook or separate component for cleaner App.tsx but sticking to file structure
// I'll make a generic 'MuscleLab' component to handle Twitch, Load, Fatigue variations.

interface MuscleLabProps {
  mode: 'twitch' | 'load' | 'fatigue';
  title: string;
  subtitle: string;
  onBack: () => void;
}

const MuscleLab: React.FC<MuscleLabProps> = ({ mode, title, subtitle, onBack }) => {
  const [voltage, setVoltage] = useState(3.5);
  const [load, setLoad] = useState(0); // For Load Experiment (grams)

  const [data, setData] = useState<DataPoint[]>([]);
  const dataRef = useRef<DataPoint[]>([]); // Ref to track data for closure access

  const [isStimulating, setIsStimulating] = useState(false);
  const [contractionLevel, setContractionLevel] = useState(0);
  const [lastPeakForce, setLastPeakForce] = useState(0);

  // Auto-stimulate for fatigue
  const [autoStimulate, setAutoStimulate] = useState(false);
  const autoStimulateRef = useRef(false); // Ref for loop access

  const [stimulusCount, setStimulusCount] = useState(0);
  const stimulusCountRef = useRef(0); // Ref for loop access

  const [fatigueLevel, setFatigueLevel] = useState(0);
  const fatigueLevelRef = useRef(0); // Ref for loop access

  // History for Fatigue Graph (superimposed)
  const [historyData, setHistoryData] = useState<{ data: DataPoint[], label?: string }[]>([]);

  // We no longer track continuous time offset, we want them to overlay from 0.
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  // ═══════════════════════════════════════════════════════════════════════════
  // FATIGUE WAVE CONFIGURATION - EDIT THIS ARRAY TO CUSTOMIZE WAVE SHAPES!
  // 
  // Each entry has these parameters:
  //   peak: Maximum height the wave reaches (in g)
  //   trough: Level wave decays towards after peak (in g, can be negative for undershoot)
  //   duration: Wave duration multiplier (1.0 = normal, 2.0 = twice as long)
  //   secondPeak: Height of secondary peak/undershoot (in g, negative = below baseline)
  //
  // Wave 1 = first stimulus, Wave 70 = last stimulus
  // ═══════════════════════════════════════════════════════════════════════════
  const FATIGUE_WAVE_CONFIG = [
    // secondPeak increases from 0.5 to 2.0 over 70 waves (contracture remainder)
    { peak: 8, trough: -2, duration: 2, secondPeak: 0.5 },   // Wave 1
    { peak: 10, trough: -1.6, duration: 2, secondPeak: 0.52 }, // Wave 2
    { peak: 11, trough: -1.2, duration: 2, secondPeak: 0.54 }, // Wave 3 (max)
    { peak: 11, trough: -0.8, duration: 2, secondPeak: 0.57 }, // Wave 4
    { peak: 11, trough: -0.4, duration: 2, secondPeak: 0.59 }, // Wave 5
    { peak: 10, trough: -0.2, duration: 2, secondPeak: 0.61 }, // Wave 6
    { peak: 10, trough: -0.1, duration: 2, secondPeak: 0.63 }, // Wave 7
    { peak: 10, trough: -0.05, duration: 2, secondPeak: 0.65 }, // Wave 8
    { peak: 10, trough: 0, duration: 2, secondPeak: 0.67 }, // Wave 9
    { peak: 9, trough: -0.05, duration: 2, secondPeak: 0.70 },  // Wave 10
    { peak: 9, trough: -0.1, duration: 2, secondPeak: 0.72 },  // Wave 11
    { peak: 9, trough: -0.2, duration: 2, secondPeak: 0.74 },  // Wave 12
    { peak: 9, trough: -0.3, duration: 2, secondPeak: 0.76 },  // Wave 13
    { peak: 8, trough: -0.4, duration: 2, secondPeak: 0.78 },  // Wave 14
    { peak: 8, trough: -0.5, duration: 2, secondPeak: 0.80 },  // Wave 15
    { peak: 8, trough: -0.6, duration: 2, secondPeak: 0.83 },  // Wave 16
    { peak: 8, trough: -0.7, duration: 2, secondPeak: 0.85 },  // Wave 17
    { peak: 7, trough: 0.8, duration: 2, secondPeak: 0.87 },  // Wave 18
    { peak: 7, trough: 0.9, duration: 2, secondPeak: 0.89 },  // Wave 19
    { peak: 7, trough: 1.00, duration: 2, secondPeak: 0.91 },  // Wave 20
    { peak: 7, trough: 1.00, duration: 2, secondPeak: 0.93 },  // Wave 21
    { peak: 6, trough: 1.02, duration: 2, secondPeak: 0.96 },  // Wave 22
    { peak: 6, trough: 1.04, duration: 2, secondPeak: 0.98 },  // Wave 23
    { peak: 6, trough: 1.06, duration: 2, secondPeak: 1.00 },  // Wave 24
    { peak: 6, trough: 1.08, duration: 2, secondPeak: 1.02 },  // Wave 25
    { peak: 5, trough: 1.10, duration: 2, secondPeak: 1.04 },  // Wave 26
    { peak: 5, trough: 1.12, duration: 2, secondPeak: 1.07 },  // Wave 27
    { peak: 5, trough: 1.14, duration: 2, secondPeak: 1.09 },  // Wave 28
    { peak: 5, trough: 1.16, duration: 2, secondPeak: 1.11 },  // Wave 29
    { peak: 5, trough: 1.18, duration: 2, secondPeak: 1.13 },  // Wave 30
    { peak: 4, trough: 1.20, duration: 2, secondPeak: 1.15 },  // Wave 31
    { peak: 4, trough: 1.22, duration: 2, secondPeak: 1.17 },  // Wave 32
    { peak: 4, trough: 1.24, duration: 2, secondPeak: 1.20 },  // Wave 33
    { peak: 4, trough: 1.26, duration: 2, secondPeak: 1.22 },  // Wave 34
    { peak: 4, trough: 1.28, duration: 2, secondPeak: 1.24 },  // Wave 35
    { peak: 3, trough: 1.30, duration: 2, secondPeak: 1.26 },  // Wave 36
    { peak: 3, trough: 1.32, duration: 2, secondPeak: 1.28 },  // Wave 37
    { peak: 3, trough: 1.34, duration: 2, secondPeak: 1.30 },  // Wave 38
    { peak: 3, trough: 1.36, duration: 2, secondPeak: 1.33 },  // Wave 39
    { peak: 3, trough: 1.38, duration: 2, secondPeak: 1.35 },  // Wave 40
    { peak: 3, trough: 1.40, duration: 2, secondPeak: 1.37 },  // Wave 41
    { peak: 2, trough: 1.42, duration: 2, secondPeak: 1.39 },  // Wave 42
    { peak: 2, trough: 1.44, duration: 2, secondPeak: 1.41 },  // Wave 43
    { peak: 2, trough: 1.46, duration: 2, secondPeak: 1.43 },  // Wave 44
    { peak: 2, trough: 1.48, duration: 2, secondPeak: 1.46 },  // Wave 45
    { peak: 2, trough: 1.50, duration: 2, secondPeak: 1.48 },  // Wave 46
    { peak: 2, trough: 1.52, duration: 2, secondPeak: 1.50 },  // Wave 47
    { peak: 2, trough: 1.54, duration: 2, secondPeak: 1.52 },  // Wave 48
    { peak: 2, trough: 1.56, duration: 2, secondPeak: 1.54 },  // Wave 49
    { peak: 2, trough: 1.58, duration: 2, secondPeak: 1.57 },  // Wave 50
    { peak: 2, trough: 1.60, duration: 2, secondPeak: 1.59 },  // Wave 51
    { peak: 2, trough: 1.62, duration: 2, secondPeak: 1.61 },  // Wave 52
    { peak: 2, trough: 1.64, duration: 2, secondPeak: 1.63 },  // Wave 53
    { peak: 2, trough: 1.66, duration: 2, secondPeak: 1.65 },  // Wave 54
    { peak: 2, trough: 1.68, duration: 2, secondPeak: 1.67 },  // Wave 55
    { peak: 2, trough: 1.70, duration: 2, secondPeak: 1.70 },  // Wave 56
    { peak: 2, trough: 1.72, duration: 2, secondPeak: 1.72 },  // Wave 57
    { peak: 2, trough: 1.74, duration: 2, secondPeak: 1.74 },  // Wave 58
    { peak: 2, trough: 1.76, duration: 2, secondPeak: 1.76 },  // Wave 59
    { peak: 2, trough: 1.78, duration: 2, secondPeak: 1.78 },  // Wave 60
    { peak: 2, trough: 1.80, duration: 2, secondPeak: 1.80 },  // Wave 61
    { peak: 2, trough: 1.82, duration: 2, secondPeak: 1.83 },  // Wave 62
    { peak: 2, trough: 1.84, duration: 2, secondPeak: 1.85 },  // Wave 63
    { peak: 2, trough: 1.86, duration: 2, secondPeak: 1.87 },  // Wave 64
    { peak: 2, trough: 1.88, duration: 2, secondPeak: 1.89 },  // Wave 65
    { peak: 2, trough: 1.90, duration: 2, secondPeak: 1.91 },  // Wave 66
    { peak: 2, trough: 1.92, duration: 2, secondPeak: 1.93 },  // Wave 67
    { peak: 2, trough: 1.94, duration: 2, secondPeak: 1.96 },  // Wave 68
    { peak: 2, trough: 1.96, duration: 2, secondPeak: 1.98 },  // Wave 69
    { peak: 2, trough: 2.00, duration: 2, secondPeak: 2.00 },  // Wave 70
  ];
  // ═══════════════════════════════════════════════════════════════════════════

  // Physics Logic
  const calculateParameters = (v: number, l: number, f: number, sc: number) => {
    // Base contraction (Hill's-ish)
    let maxForce = v < THRESHOLD_VOLTAGE ? 0 : (v >= MAX_VOLTAGE ? 10 : 10 * ((v - THRESHOLD_VOLTAGE) / (MAX_VOLTAGE - THRESHOLD_VOLTAGE)));

    // Effect of Load: Force decreases with load
    if (mode === 'load') {
      maxForce = Math.max(0, maxForce - (l * 0.1));
    }

    let contracture = 0;
    let secondPeak = 0;
    let durationMultiplier = 1.0;

    if (mode === 'fatigue') {
      // USE MANUAL CONFIGURATION - Get values from FATIGUE_WAVE_CONFIG array
      const waveIndex = Math.min(sc - 1, FATIGUE_WAVE_CONFIG.length - 1);
      const waveConfig = FATIGUE_WAVE_CONFIG[Math.max(0, waveIndex)];

      // DEBUG: Trace config access
      console.log(`[CONFIG] sc=${sc}, waveIndex=${waveIndex}, config peak=${waveConfig.peak}`);

      // Extract all configured values (with defaults for backwards compatibility)
      maxForce = waveConfig.peak;
      contracture = waveConfig.trough;
      durationMultiplier = waveConfig.duration ?? 1.0;
      secondPeak = waveConfig.secondPeak ?? 0;
    }

    return {
      force: maxForce,
      latent: LATENT_PERIOD_BASE + (l * 0.5),
      contraction: CONTRACTION_TIME_BASE * durationMultiplier,
      relaxation: (RELAXATION_TIME_BASE + (f * 200)) * durationMultiplier,
      contracture,
      secondPeak
    };
  };

  const runSimulation = (timestamp: number, params: { force: number, latent: number, contraction: number, relaxation: number, contracture: number, secondPeak: number }) => {
    const elapsed = timestamp - startTimeRef.current;
    const totalDuration = params.latent + params.contraction + params.relaxation;

    if (elapsed > totalDuration + 50) {
      setIsStimulating(false);
      setContractionLevel(params.contracture / 10);

      if (mode === 'fatigue') {
        const currentCount = stimulusCountRef.current;

        // Save history: waves 1-10 individually, then every 10th wave (20, 30, 40...)
        const shouldSave = currentCount <= 10 || currentCount % 10 === 0;

        if (shouldSave) {
          const capturedData = [...dataRef.current];
          setHistoryData(prev => [...prev, { data: capturedData, label: currentCount.toString() }]);
        }

        // Auto-stimulate until 70
        if (autoStimulateRef.current && fatigueLevelRef.current < 1 && currentCount < 70) {
          handleStimulate();
        } else {
          setAutoStimulate(false);
          autoStimulateRef.current = false;
        }
      }
      return;
    }

    let currentForce = 0; // Start at baseline

    if (elapsed < params.latent) {
      currentForce = 0; // Latent period - at baseline
    } else if (elapsed < params.latent + params.contraction) {
      const progress = (elapsed - params.latent) / params.contraction;

      // Wave shape: 5% rise, 15% hold at peak, 40% decay, 20% undershoot dip, 20% recovery
      const risePhase = 0.05;      // 0-5%: rise to peak
      const peakPhase = 0.15;      // 5-15%: hold at peak
      const troughPhase = 0.70;    // 15-70%: smooth decay past 0 to trough

      if (progress < risePhase) {
        // Rise from 0 to peak
        const riseProgress = progress / risePhase;
        currentForce = params.force * riseProgress;
      } else if (progress < peakPhase) {
        // Hold at peak
        currentForce = params.force;
      } else if (progress < troughPhase) {
        // Smooth exponential decay from peak, overshooting to trough
        const decayProgress = (progress - peakPhase) / (troughPhase - peakPhase);
        // Decay from peak toward trough (can go negative if trough < 0)
        const decayFactor = 1 - decayProgress;
        // At start: peak, at end: trough
        currentForce = params.force * decayFactor + params.contracture * (1 - decayFactor);
      } else {
        // Recovery from trough back to secondPeak
        const recoveryProgress = (progress - troughPhase) / (1 - troughPhase);
        currentForce = params.contracture + (params.secondPeak - params.contracture) * recoveryProgress;
      }
    } else {
      // Relaxation - stay at secondPeak (contracture remainder)
      currentForce = params.secondPeak;
    }

    // Minimal noise for cleaner waves
    const displayForce = currentForce + (Math.random() - 0.5) * 0.02;

    setData(prev => {
      const plotTime = Math.floor(elapsed);

      // Ensure first points show baseline before rise
      if (prev.length === 0) {
        // Add initial point at baseline (0)
        const initialData = [
          { time: 0, force: 0, voltage },
          { time: Math.max(1, plotTime), force: displayForce, voltage }
        ];
        dataRef.current = initialData;
        return initialData;
      }

      if (prev.length > 0 && plotTime === prev[prev.length - 1].time) return prev;

      const newData = [...prev, { time: plotTime, force: displayForce, voltage }];
      dataRef.current = newData;
      return newData;
    });

    setContractionLevel(currentForce / 10);
    animationRef.current = requestAnimationFrame((t) => runSimulation(t, params));
  };

  const handleStimulate = () => {
    if (isStimulating && mode !== 'fatigue') return;

    // Use Refs for logic to ensure up-to-date values in loop
    stimulusCountRef.current += 1;
    const currentCount = stimulusCountRef.current;
    setStimulusCount(currentCount); // Sync to UI

    // Fatigue logic
    let currentFatigue = fatigueLevelRef.current;
    if (mode === 'fatigue' && currentCount > 5) {
      // Start fatigue after stimulus 5 (after Treppe peak)
      // Slow down fatigue to reach max around 70 stimuli (65 steps * 0.015 approx 0.975)
      currentFatigue = Math.min(1, currentFatigue + 0.015);
      fatigueLevelRef.current = currentFatigue;
      setFatigueLevel(currentFatigue); // Updates state for UI
    }

    // Calculate parameters using current Ref values
    const params = calculateParameters(voltage, load, currentFatigue, currentCount);

    // DEBUG: Log wave parameters
    console.log(`Wave ${currentCount}: peak=${params.force.toFixed(1)}, secondPeak=${params.secondPeak}, duration=${(params.contraction / 80).toFixed(1)}x`);

    setLastPeakForce(params.force);

    // Always clear CURRENT data to start drawing the new line from X=0
    setData([]);
    dataRef.current = []; // Clear Ref

    setIsStimulating(true);
    startTimeRef.current = performance.now();
    cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame((t) => runSimulation(t, params));
  };

  const handleReset = () => {
    setData([]);
    dataRef.current = []; // Clear Ref
    setHistoryData([]); // Clear history
    setContractionLevel(0);
    setIsStimulating(false);

    setFatigueLevel(0);
    fatigueLevelRef.current = 0;

    setStimulusCount(0);
    stimulusCountRef.current = 0;

    setAutoStimulate(false);
    autoStimulateRef.current = false;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 z-10 shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">{title}</h1>
            <p className="text-slate-400 text-xs">{subtitle}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
        <section className="flex-none lg:flex-1 flex flex-col min-w-0 border-r border-slate-800">
          <div className="relative h-[250px] lg:h-auto lg:flex-1 bg-gradient-to-b from-slate-800 to-slate-900 shrink-0">
            <Suspense fallback={<LoadingSpinner message="Loading 3D model..." />}>
              <Canvas shadows camera={{ position: [4, 2, 5], fov: 45 }}>
                <Environment preset="city" />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} castShadow />
                <Stage intensity={0.5} environment="city" adjustCamera={false}>
                  <Muscle3D contraction={contractionLevel} />
                </Stage>
                <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.5} />
                <gridHelper args={[10, 10, 0x444444, 0x222222]} position={[0, -2.5, 0]} />
              </Canvas>
            </Suspense>
          </div>

          {/* Enhanced Controls */}
          <div className="p-4 lg:p-6 bg-slate-900 border-t border-slate-800 shrink-0">
            <Controls
              voltage={voltage}
              setVoltage={setVoltage}
              onStimulate={handleStimulate}
              onReset={handleReset}
              isStimulating={isStimulating && mode !== 'fatigue'} // Allow clicking in fatigue mode to stack?
            />

            {/* Extra Controls based on Mode */}
            {mode === 'load' && (
              <div className="mt-4 bg-slate-800 p-4 rounded-lg border border-slate-700">
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <Scale className="w-4 h-4 text-cyan-400" /> Afterload Weight
                  </label>
                  <span className="text-cyan-400 font-mono">{load}g</span>
                </div>
                <input
                  type="range" min="0" max="50" step="5" value={load}
                  onChange={(e) => setLoad(Number(e.target.value))}
                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>0g</span>
                  <span>50g</span>
                </div>
              </div>
            )}

            {mode === 'fatigue' && (
              <div className="mt-4 flex gap-4">
                <button
                  onClick={() => {
                    // Toggle logic using Ref for immediate truth
                    if (autoStimulateRef.current) {
                      autoStimulateRef.current = false;
                      setAutoStimulate(false);
                    } else {
                      autoStimulateRef.current = true;
                      setAutoStimulate(true);
                      handleStimulate();
                    }
                  }}
                  className={`flex-1 py-3 rounded-lg font-bold border transition-colors flex items-center justify-center gap-2
                            ${autoStimulate
                      ? 'bg-red-900/30 border-red-800 text-red-400 animate-pulse'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}
                        `}
                >
                  {autoStimulate ? <Timer className="w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                  {autoStimulate ? 'Stop Auto-Stim' : 'Start Fatigue Run'}
                </button>
                <div className="px-4 py-2 bg-slate-800 rounded-lg border border-slate-700 flex flex-col items-center justify-center min-w-[100px]">
                  <span className="text-xs text-slate-500 uppercase">Stimuli</span>
                  <span className="text-xl font-mono text-white">{stimulusCount}</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="w-full lg:w-[450px] flex flex-col bg-slate-950 border-l border-slate-800 shrink-0">
          <div className="h-[250px] lg:h-[350px] p-4 border-b border-slate-800 flex flex-col shrink-0">
            <div className="flex justify-between items-end mb-2 shrink-0">
              <h2 className="text-slate-400 text-sm font-bold uppercase tracking-wider">Oscilloscope</h2>
              {mode === 'load' && lastPeakForce > 0 && (
                <span className="text-xs text-cyan-400">Work: {(lastPeakForce * 1.5).toFixed(1)} g-mm</span>
              )}
            </div>
            <div className="flex-1 min-h-0 w-full">
              <Suspense fallback={<LoadingSpinner message="Loading oscilloscope..." />}>
                <Oscilloscope
                  data={data}
                  currentVoltage={voltage}
                  historyTraces={mode === 'fatigue' ? historyData : undefined}
                />
              </Suspense>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
};


// 5. Genesis of Tetanus Experiment
const GenesisOfTetanusExperiment: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [frequency, setFrequency] = useState(5); // stimuli per second
  const [drumSpeed, setDrumSpeed] = useState(12.5); // mm/sec
  const [isStimulating, setIsStimulating] = useState(false);
  const [data, setData] = useState<DataPoint[]>([]);
  const [markerData, setMarkerData] = useState<{ time: number, active: boolean }[]>([]);

  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastStimulusTimeRef = useRef<number>(0);
  const forcesRef = useRef<{ startTime: number, peakForce: number, decayRate: number }[]>([]);

  const DURATION = 5000; // 5 seconds of experiment

  const frequencies = [
    { label: '(A) Treppe', value: 5 },
    { label: '(B) Clonus', value: 10 },
    { label: '(C) Incomplete tetanus', value: 30 },
    { label: '(D) Complete tetanus', value: 40 }
  ];

  const runSimulation = (timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;

    if (elapsed > DURATION) {
      setIsStimulating(false);
      return;
    }

    // Stimulation Interval
    const interval = 1000 / frequency;
    if (timestamp - lastStimulusTimeRef.current >= interval) {
      lastStimulusTimeRef.current = timestamp;

      // Calculate peak force with Treppe effect
      const stimulusIndex = Math.floor(elapsed / interval);
      let peakForce = 10;
      if (stimulusIndex < 10) {
        peakForce = 5 + (stimulusIndex * 0.5); // Treppe rise
      }

      forcesRef.current.push({
        startTime: elapsed,
        peakForce: peakForce,
        decayRate: 0.01 // Slow decay for summation
      });

      setMarkerData(prev => [...prev.slice(-100), { time: elapsed, active: true }]);
    }

    // Calculate sum of active contractions
    let totalForce = 0;

    // For clonus (10/sec), use discrete spikes with triangular envelope
    // For other frequencies, use summation for tetanus
    const isClonus = frequency === 10;

    if (isClonus) {
      // Clonus: Explicit wave heights as specified
      // Peak heights and trough heights for each wave

      // Define exact peak and trough values for each wave
      // Wave 1: ascend 20, descend 2 (to 18)
      // Wave 2: rise 2.5 (to 20.5), descend 2.5 (to 18)
      // Wave 3: rise 3 (to 21), descend 3 (to 18)  
      // Wave 4: rise 4.5 (to 22.5), descend to baseline progressively
      const waveData = [
        { peak: 40, trough: 20 },     // Wave 1: ascend 20, descend 2
        { peak: 42, trough: 22 },   // Wave 2: rise 2.5, descend 2.5
        { peak: 44, trough: 23 },     // Wave 3: rise 3, descend 3
        { peak: 46, trough: 24 },   // Wave 4: rise 4.5
        { peak: 48, trough: 26 },     // Wave 5: declining
        { peak: 50, trough: 28 },     // Wave 6: declining
        { peak: 52, trough: 29 },      // Wave 7: declining
        { peak: 54, trough: 33 },      // Wave 8: declining
        { peak: 56, trough: 35 },       // Wave 9: declining
        { peak: 58, trough: 40 },       // Wave 10: return to baseline
      ];

      // Keep stimulus for longer than interval to avoid gaps
      forcesRef.current = forcesRef.current.filter(f => elapsed - f.startTime < 110);

      const totalStimuli = waveData.length;
      const interval = 1000 / frequency; // 100ms between stimuli
      const clonusDuration = totalStimuli * interval;

      // Calculate current wave index from elapsed time
      const currentWaveIndex = Math.min(Math.floor(elapsed / interval), totalStimuli - 1);

      // After all waves, maintain baseline
      if (elapsed > clonusDuration + 50) {
        totalForce = 0;
      } else if (forcesRef.current.length > 0) {
        const f = forcesRef.current[forcesRef.current.length - 1];
        const dt = elapsed - f.startTime;

        // Get wave index
        const waveIndex = Math.min(Math.floor(f.startTime / interval), totalStimuli - 1);
        const wave = waveData[waveIndex];

        // Get previous wave's trough as starting point (or 0 for first wave)
        const prevTrough = waveIndex > 0 ? waveData[waveIndex - 1].trough : 0;

        // Spike shape within wave
        const spikeDuration = 95; // Almost full interval
        const riseTime = 25; // Time to reach peak
        const fallTime = spikeDuration - riseTime; // Time to fall to trough

        if (dt < spikeDuration) {
          if (dt < riseTime) {
            // Rise from previous trough to this peak
            const progress = dt / riseTime;
            totalForce = prevTrough + (wave.peak - prevTrough) * Math.pow(progress, 0.7);
          } else {
            // Fall from peak to this wave's trough (only a small drop!)
            const decayProgress = (dt - riseTime) / fallTime;
            totalForce = wave.peak - (wave.peak - wave.trough) * Math.pow(decayProgress, 0.8);
          }
        } else {
          // At trough level between spikes
          totalForce = wave.trough;
        }
      } else {
        // Between stimuli - stay at current wave's trough (not 0!)
        if (currentWaveIndex > 0 && elapsed < clonusDuration) {
          totalForce = waveData[Math.max(0, currentWaveIndex - 1)].trough;
        } else {
          totalForce = 0;
        }
      }
    } else if (frequency === 5) {
      // TREPPE (5/sec): Staircase effect - gradual increase in force
      // Individual twitches with increasing amplitude
      const waveData = [
        { peak: 15, trough: 0 },      // Wave 1: small
        { peak: 20, trough: 0 },      // Wave 2: slightly bigger
        { peak: 25, trough: 0 },      // Wave 3: bigger
        { peak: 30, trough: 0 },      // Wave 4: bigger
        { peak: 35, trough: 0 },      // Wave 5: bigger
        { peak: 38, trough: 0 },      // Wave 6: near max
        { peak: 40, trough: 0 },      // Wave 7: max
        { peak: 40, trough: 0 },      // Wave 8: max
        { peak: 38, trough: 0 },      // Wave 9: slight decline
        { peak: 35, trough: 0 },      // Wave 10: declining
      ];

      forcesRef.current = forcesRef.current.filter(f => elapsed - f.startTime < 250);

      const totalStimuli = waveData.length;
      const interval = 1000 / frequency; // 200ms between stimuli
      const treppeDuration = totalStimuli * interval;
      const currentWaveIndex = Math.min(Math.floor(elapsed / interval), totalStimuli - 1);

      if (elapsed > treppeDuration + 100) {
        totalForce = 0;
      } else if (forcesRef.current.length > 0) {
        const f = forcesRef.current[forcesRef.current.length - 1];
        const dt = elapsed - f.startTime;
        const waveIndex = Math.min(Math.floor(f.startTime / interval), totalStimuli - 1);
        const wave = waveData[waveIndex];

        const spikeDuration = 180;
        const riseTime = 40;

        if (dt < spikeDuration) {
          if (dt < riseTime) {
            const progress = dt / riseTime;
            totalForce = wave.peak * Math.pow(progress, 0.7);
          } else {
            const decayProgress = (dt - riseTime) / (spikeDuration - riseTime);
            totalForce = wave.peak * Math.pow(1 - decayProgress, 1.2);
          }
        } else {
          totalForce = 0;
        }
      } else {
        totalForce = 0;
      }

    } else if (frequency === 30) {
      // INCOMPLETE TETANUS (30/sec): Partially fused contractions
      // Waves don't fully relax between stimuli
      const waveData = [
        { peak: 25, trough: 5 },
        { peak: 35, trough: 15 },
        { peak: 45, trough: 25 },
        { peak: 55, trough: 35 },
        { peak: 60, trough: 40 },
        { peak: 65, trough: 45 },
        { peak: 68, trough: 48 },
        { peak: 70, trough: 50 },
        { peak: 70, trough: 50 },
        { peak: 68, trough: 48 },
        { peak: 65, trough: 45 },
        { peak: 60, trough: 40 },
        { peak: 55, trough: 35 },
        { peak: 50, trough: 30 },
        { peak: 45, trough: 25 },
      ];

      forcesRef.current = forcesRef.current.filter(f => elapsed - f.startTime < 50);

      const totalStimuli = waveData.length;
      const interval = 1000 / frequency; // ~33ms between stimuli
      const tetanusDuration = totalStimuli * interval;
      const currentWaveIndex = Math.min(Math.floor(elapsed / interval), totalStimuli - 1);

      if (elapsed > tetanusDuration + 50) {
        totalForce = 0;
      } else if (forcesRef.current.length > 0) {
        const f = forcesRef.current[forcesRef.current.length - 1];
        const dt = elapsed - f.startTime;
        const waveIndex = Math.min(Math.floor(f.startTime / interval), totalStimuli - 1);
        const wave = waveData[waveIndex];
        const prevTrough = waveIndex > 0 ? waveData[waveIndex - 1].trough : 0;

        const spikeDuration = 30;
        const riseTime = 10;

        if (dt < spikeDuration) {
          if (dt < riseTime) {
            const progress = dt / riseTime;
            totalForce = prevTrough + (wave.peak - prevTrough) * Math.pow(progress, 0.7);
          } else {
            const decayProgress = (dt - riseTime) / (spikeDuration - riseTime);
            totalForce = wave.peak - (wave.peak - wave.trough) * Math.pow(decayProgress, 0.8);
          }
        } else {
          totalForce = wave.trough;
        }
      } else if (currentWaveIndex > 0 && elapsed < tetanusDuration) {
        totalForce = waveData[Math.max(0, currentWaveIndex - 1)].trough;
      } else {
        totalForce = 0;
      }

    } else if (frequency === 40) {
      // COMPLETE TETANUS (40/sec): Fully fused contractions
      // Smooth sustained contraction with minimal oscillation
      const waveData = [
        { peak: 50, trough: 38 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
        { peak: 40, trough: 40 },
      ];

      forcesRef.current = forcesRef.current.filter(f => elapsed - f.startTime < 40);

      const totalStimuli = waveData.length;
      const interval = 1000 / frequency; // 25ms between stimuli
      const tetanusDuration = totalStimuli * interval;
      const currentWaveIndex = Math.min(Math.floor(elapsed / interval), totalStimuli - 1);

      if (elapsed > tetanusDuration + 50) {
        totalForce = 0;
      } else if (forcesRef.current.length > 0) {
        const f = forcesRef.current[forcesRef.current.length - 1];
        const dt = elapsed - f.startTime;
        const waveIndex = Math.min(Math.floor(f.startTime / interval), totalStimuli - 1);
        const wave = waveData[waveIndex];
        const prevTrough = waveIndex > 0 ? waveData[waveIndex - 1].trough : 0;

        const spikeDuration = 22;
        const riseTime = 8;

        if (dt < spikeDuration) {
          if (dt < riseTime) {
            const progress = dt / riseTime;
            totalForce = prevTrough + (wave.peak - prevTrough) * Math.pow(progress, 0.7);
          } else {
            const decayProgress = (dt - riseTime) / (spikeDuration - riseTime);
            totalForce = wave.peak - (wave.peak - wave.trough) * Math.pow(decayProgress, 0.8);
          }
        } else {
          totalForce = wave.trough;
        }
      } else if (currentWaveIndex > 0 && elapsed < tetanusDuration) {
        totalForce = waveData[Math.max(0, currentWaveIndex - 1)].trough;
      } else {
        totalForce = 0;
      }
    }

    // Add noise
    const displayForce = totalForce + (Math.random() - 0.5) * 0.1;

    setData(prev => {
      const plotTime = Math.floor(elapsed);
      if (prev.length > 0 && plotTime === prev[prev.length - 1].time) return prev;
      return [...prev.slice(-1000), { time: plotTime, force: displayForce, voltage: 5 }];
    });

    animationRef.current = requestAnimationFrame(runSimulation);
  };

  const handleStart = () => {
    setData([]);
    setMarkerData([]);
    forcesRef.current = [];
    startTimeRef.current = 0;
    lastStimulusTimeRef.current = 0;
    setIsStimulating(true);
    cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(runSimulation);
  };

  const handleReset = () => {
    setData([]);
    setMarkerData([]);
    forcesRef.current = [];
    setIsStimulating(false);
    cancelAnimationFrame(animationRef.current);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
              Genesis of Tetanus
            </h1>
            <p className="text-slate-400 text-xs text-left">Amphibian / Gastrocnemius-Sciatic Preparation</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 gap-6 overflow-hidden">
        <div className="flex-1 bg-slate-900 rounded-2xl border border-slate-800 relative overflow-hidden flex flex-col">
          {/* Drawing Area */}
          <div className="flex-1 relative bg-white m-4 rounded-lg shadow-inner overflow-hidden">
            <svg width="100%" height="100%" viewBox="0 0 1000 400" preserveAspectRatio="none">
              {/* Horizontal Baseline */}
              <line x1="0" y1="320" x2="1000" y2="320" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4" />

              {/* Contraction Curve */}
              <path
                d={`M ${data.map(d => `${(d.time / DURATION) * 1000},${320 - d.force * 6}`).join(' L ')}`}
                fill="none"
                stroke="#1e293b"
                strokeWidth="2"
                className="transition-all duration-100"
              />

              {/* Signal Marker Area */}
              <line x1="0" y1="360" x2="1000" y2="360" stroke="#94a3b8" strokeWidth="1" />
              <text x="10" y="350" fontSize="10" fill="#64748b" className="font-bold">SIGNAL MARKER</text>

              {markerData.map((m, i) => (
                <line
                  key={i}
                  x1={(m.time / DURATION) * 1000} y1="360"
                  x2={(m.time / DURATION) * 1000} y2="380"
                  stroke="#1e293b" strokeWidth="1"
                />
              ))}
            </svg>

            {/* Labels based on frequency */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center text-[#1e293b] text-sm font-bold">
              {frequencies.find(f => f.value === frequency)?.label} ({frequency}/sec)
            </div>
          </div>

          {/* Controls Overlay */}
          <div className="p-6 bg-slate-800 border-t border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" /> Stimulation Frequency
              </label>
              <div className="grid grid-cols-2 gap-2">
                {frequencies.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => { setFrequency(f.value); handleReset(); }}
                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border
                      ${frequency === f.value
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                  >
                    {f.value}/sec
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                <Timer className="w-4 h-4 text-emerald-400" /> Drum Speed
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range" min="5" max="50" step="2.5"
                  value={drumSpeed}
                  onChange={(e) => setDrumSpeed(Number(e.target.value))}
                  className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
                <span className="text-emerald-400 font-mono text-sm min-w-[60px]">{drumSpeed} mm/s</span>
              </div>
            </div>

            <div className="flex items-end gap-3">
              <button
                onClick={handleStart}
                disabled={isStimulating}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" /> Start Recording
              </button>
              <button
                onClick={handleReset}
                className="px-6 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};


// --- FEEDBACK MODAL ---

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!feedback.trim()) return setError('Please enter your feedback');
  if (rating === 0) return setError('Please select a rating');

  setIsSubmitting(true);
  setError('');

  try {
    const response = await fetch('https://formspree.io/f/xeaeqwev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, rating, feedback })
    });

    if (response.ok) {
      setSubmitted(true);
    } else {
      setError('Failed to submit feedback.');
    }
  } catch (err) {
    setError('Failed to submit feedback. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
};


// --- MAIN APP NAVIGATION ---

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('home');
  const [showAbout, setShowAbout] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  // Sync state with History API
  useEffect(() => {
    // Initial state setup
    if (!window.history.state) {
      window.history.replaceState('home', '', '');
    } else if (window.history.state !== currentView) {
      setCurrentView(window.history.state as ViewState);
    }

    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        setCurrentView(event.state as ViewState);
      } else {
        setCurrentView('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (view: ViewState) => {
    if (view !== currentView) {
      window.history.pushState(view, '', '');
      setCurrentView(view);
    }
  };

  // Track module views in GA4
  useEffect(() => {
    trackModuleView(currentView);
  }, [currentView]);

  switch (currentView) {
    case 'home':
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans">
          <div className="max-w-5xl w-full space-y-12">
            <div className="text-center space-y-4 relative">
              <div className="absolute top-0 right-0 flex gap-2 z-50">
                <button
                  onClick={() => setShowAbout(true)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="About"
                >
                  <Info className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setShowHistory(true)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                  title="Version History"
                >
                  <History className="w-6 h-6" />
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="p-2 text-slate-400 hover:text-yellow-400 transition-colors"
                  title="Send Feedback"
                >
                  <MessageCircle className="w-6 h-6" />
                </button>
              </div>
              <div className="inline-flex items-center justify-center p-3 bg-blue-500/10 rounded-2xl mb-4">
                <FlaskConical className="w-10 h-10 text-blue-400" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                Virtual Physiology <span className="text-blue-500">Lab</span>
              </h1>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                Practice physiology experiments anytime, anywhere.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <MenuCard
                title="Hematology"
                description="WBC, RBC, and Differential Counts using Virtual Microscopy."
                icon={<Droplet className="w-8 h-8" />}
                colorClass="red"
                onClick={() => navigateTo('hematology')}
              />
              <MenuCard
                title="Amphibian"
                description="Skeletal muscle properties: Twitch, Load, Fatigue."
                icon={<Activity className="w-8 h-8" />}
                colorClass="green"
                onClick={() => navigateTo('amphibian')}
              />
              <MenuCard
                title="Microscope Master"
                description="Learn the parts and operation of a Compound Microscope."
                icon={<Microscope className="w-8 h-8" />}
                colorClass="blue"
                onClick={() => navigateTo('microscope')}
              />
            </div>
            <div className="text-center text-slate-600 text-sm mt-12 flex flex-col items-center gap-1">
              <span>© 2026 Virtual Physiology Lab</span>
              <span className="text-slate-500 text-[10px] uppercase tracking-wider">Last Updated: Mar 18, 2026</span>
            </div>
          </div>


          {/* About Modal */}
          {
            showAbout && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-900 p-8 rounded-2xl max-w-2xl w-full border border-slate-800 relative max-h-[90vh] overflow-y-auto">
                  <button
                    onClick={() => setShowAbout(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <Info className="w-6 h-6 text-blue-500" /> About Virtual Physiology Lab
                  </h2>
                  <div className="space-y-4 text-slate-300 leading-relaxed">
                    <p>
                      Virtual Physiology Lab is an interactive educational tool designed to simulate physiological experiments.
                      It allows students and professionals to practice various experiments in Hematology and Amphibian/Muscle physiology in a virtual environment.
                    </p>
                    <p>
                      <strong>Key Features:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Virtual Microscopy for Hematology (WBC, RBC, DLC).</li>
                      <li>Simulated Neubauer Chamber for cell counting.</li>
                      <li>Amphibian Muscle sim for Twitch, Load, and Fatigue analysis.</li>
                      <li>Real-time data visualization with Oscilloscope.</li>
                    </ul>
                    <p className="text-sm text-slate-500 mt-6 pt-6 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-2">
                      <span>Developed by Madhukar Venkatesh.</span>
                      <span className="text-[10px] opacity-70 uppercase tracking-widest">v1.5.0 • Mar 18, 2026</span>
                    </p>
                  </div>
                </div>
              </div>
            )
          }

          {/* Version History Modal */}
          {
            showHistory && (
              <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                <div className="bg-slate-900 p-8 rounded-2xl max-w-2xl w-full border border-slate-800 relative max-h-[90vh] overflow-y-auto">
                  <button
                    onClick={() => setShowHistory(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                  >
                    <X className="w-6 h-6" />
                  </button>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <History className="w-6 h-6 text-green-500" /> Version History
                  </h2>
                  <div className="space-y-6">
                    <div className="border-l-2 border-green-500 pl-4">
                      <h3 className="text-lg font-semibold text-white">v1.5.0 (Current)</h3>
                      <p className="text-slate-500 text-sm mb-2">March 18, 2026</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Realistic Microscope controls — Mechanical stage knobs now match real-world microscopes.</li>
                        <li>Smoother kymograph tracings — Curves are now smooth and traces preserved for comparison.</li>
                        <li>Improved Two Successive Stimuli graphs with better layout and clearer S1/S2 markers.</li>
                        <li>Added Feedback form — Rate and share suggestions directly from the app.</li>
                      </ul>
                    </div>
                    <div className="border-l-2 border-slate-700 pl-4 opacity-70">
                      <h3 className="text-lg font-semibold text-white">v1.4.0</h3>
                      <p className="text-slate-500 text-sm mb-2">February 25, 2026</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Added 5 new Cardiac Muscle experiments (Extra Systole, Heart Block, All-or-None, Staircase, Summation).</li>
                        <li>Improved mobile layout and visualizations.</li>
                        <li>Refined graph labels for better clarity.</li>
                        <li>General UI polish and bug fixes.</li>
                      </ul>
                    </div>
                    <div className="border-l-2 border-slate-700 pl-4 opacity-70">
                      <h3 className="text-lg font-semibold text-white">v1.3.0</h3>
                      <p className="text-slate-500 text-sm mb-2">January 16, 2026</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Added "Effect of Two Successive Stimuli" experiment.</li>
                        <li>Added "Genesis of Tetanus" experiment.</li>
                        <li>Enhanced 3D Microscope with interactive labels and optics.</li>
                        <li>Refined Muscle Twitch 3D models and graph visualizations.</li>
                      </ul>
                    </div>
                    <div className="border-l-2 border-slate-700 pl-4 opacity-70">
                      <h3 className="text-lg font-semibold text-white">v1.2.0</h3>
                      <p className="text-slate-500 text-sm mb-2">January 2026</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Removed Mammalian module placeholder.</li>
                        <li>Added "Last Updated" date to home screen and About modal.</li>
                      </ul>
                    </div>
                    <div className="border-l-2 border-slate-700 pl-4 opacity-70">
                      <h3 className="text-lg font-semibold text-white">v1.1.0</h3>
                      <p className="text-slate-500 text-sm mb-2">December 2025</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Added About and Version History features.</li>
                        <li>Removed legacy Lab Assistant.</li>
                        <li>Improved mobile scrolling on Android.</li>
                        <li>Optimized Hematology experiments.</li>
                      </ul>
                    </div>
                    <div className="border-l-2 border-slate-700 pl-4 opacity-70">
                      <h3 className="text-lg font-semibold text-white">v1.0.0</h3>
                      <p className="text-slate-500 text-sm mb-2">November 2025</p>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Initial release.</li>
                        <li>Included Amphibian (Twitch, Load, Fatigue) and Hematology modules.</li>
                        <li>Basic Virtual Microscope functionality.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          {/* Feedback Modal */}
          {
            showFeedback && (
              <FeedbackModal onClose={() => setShowFeedback(false)} />
            )
          }
        </div >
      );

    // Sub-Menus
    case 'amphibian':
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans relative">
          <button onClick={() => window.history.back()} className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" /> <span>Back</span>
          </button>
          <div className="max-w-4xl w-full space-y-8">
            <h2 className="text-3xl font-bold text-white text-center mb-8">Amphibian Physiology</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MenuCard
                title="Simple Muscle Twitch"
                description="Threshold, Latent Period, and Contraction Kinetics."
                icon={<Zap className="w-8 h-8" />}
                colorClass="yellow"
                onClick={() => navigateTo('twitch')}
              />
              <MenuCard
                title="Effect of Temperature"
                description="Effect of temperature on muscle contraction: Cold, Optimal, and Hot."
                icon={<Thermometer className="w-8 h-8" />}
                onClick={() => setCurrentView('effect-of-temperature')}
                colorClass="blue"
              />
              <MenuCard
                title="Effect of Two Successive Stimuli"
                description="Refractory period, summation of contractions, and beneficial effect."
                icon={<Zap className="w-8 h-8" />}
                onClick={() => setCurrentView('two-stimuli')}
                colorClass="yellow"
              />
              <MenuCard
                title="Genesis of Tetanus"
                description="Effect of increasing frequency of stimuli: Treppe, Clonus, and Tetanus."
                icon={<Activity className="w-8 h-8" />}
                onClick={() => setCurrentView('genesis-tetanus')}
                colorClass="teal"
              />
              <MenuCard
                title="Effect of Load"
                description="Afterload's effect on Work Done and Velocity."
                icon={<Scale className="w-8 h-8" />}
                colorClass="cyan"
                onClick={() => navigateTo('load')}
              />
              <MenuCard
                title="Genesis of Fatigue"
                description="Repeated stimulation, Treppe, and Muscle Fatigue."
                icon={<Timer className="w-8 h-8" />}
                colorClass="orange"
                onClick={() => navigateTo('fatigue')}
              />
              <MenuCard
                title="Effect of Stimulus Strength"
                description="Make vs Break stimuli, Recruitment of Motor Units."
                icon={<Zap className="w-8 h-8" />}
                colorClass="red"
                onClick={() => setCurrentView('stimulus-strength')}
              />
              <MenuCard
                title="Conduction Velocity"
                description="Measure nerve conduction velocity."
                icon={<Activity className="w-8 h-8" />}
                colorClass="orange"
                onClick={() => setCurrentView('conduction-velocity')}
              />
              <MenuCard
                title="Normal Cardiogram"
                description="Recording a frog heart cardiogram & effect of temperature on heart rate."
                icon={<Heart className="w-8 h-8" />}
                colorClass="red"
                onClick={() => setCurrentView('normal-cardiogram')}
              />
              <MenuCard
                title="Properties of Cardiac Muscle"
                description="Study the properties of cardiac muscle using the frog heart preparation."
                icon={<Activity className="w-8 h-8" />}
                colorClass="red"
                onClick={() => setCurrentView('properties-cardiac-muscle')}
              />
            </div>
          </div>
        </div>
      );

    case 'hematology':
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans relative">
          <button onClick={() => window.history.back()} className="absolute top-8 left-8 flex items-center gap-2 text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" /> <span>Back</span>
          </button>
          <div className="max-w-4xl w-full space-y-8">
            <h2 className="text-3xl font-bold text-white text-center mb-8">Hematology Lab</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MenuCard
                title="WBC Count (TLC)"
                description="Determine Total Leukocyte Count using a Neubauer chamber grid."
                icon={<Grid3X3 className="w-8 h-8" />}
                colorClass="red"
                onClick={() => navigateTo('wbc-count')}
              />
              <MenuCard
                title="RBC Count"
                description="Total Erythrocyte Count (Center Square)."
                icon={<Dna className="w-8 h-8" />}
                colorClass="pink"
                onClick={() => navigateTo('rbc-count')}
              />
              <MenuCard
                title="DLC Count"
                description="Differential Leucocyte Count on Blood Smear."
                icon={<ListChecks className="w-8 h-8" />}
                colorClass="purple"
                onClick={() => navigateTo('dlc-count')}
              />
              <MenuCard
                title="DLC Quiz"
                description="Identify blood cells from real microscope images."
                icon={<Target className="w-8 h-8" />}
                colorClass="pink"
                onClick={() => navigateTo('dlc-quiz')}
              />
            </div>
          </div>
        </div>
      );

    // Experiments
    case 'twitch': return <SimpleMuscleTwitch onBack={() => window.history.back()} />;
    case 'load':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Effect of Load Experiment..." />}>
          <EffectOfLoad onBack={() => window.history.back()} />
        </Suspense>
      );
    case 'fatigue': return <GenesisOfFatigue onBack={() => window.history.back()} />;

    case 'wbc-count': return <WBCExperiment onBack={() => window.history.back()} />;
    case 'rbc-count': return <RBCExperiment onBack={() => window.history.back()} />;
    case 'dlc-count': return <DLCExperiment onBack={() => window.history.back()} />;
    case 'dlc-quiz': return <DLCQuiz onBack={() => window.history.back()} />;

    case 'two-stimuli':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Two Stimuli Experiment..." />}>
          <TwoSuccessiveStimuli onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'genesis-tetanus':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Genesis of Tetanus..." />}>
          <GenesisOfTetanus onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'effect-of-temperature':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Effect of Temperature..." />}>
          <EffectOfTemperature onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'stimulus-strength':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Effect of Stimulus Strength..." />}>
          <EffectOfStimulusStrength onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'conduction-velocity':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Conduction Velocity..." />}>
          <ConductionVelocity onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'normal-cardiogram':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Normal Cardiogram..." />}>
          <NormalCardiogram onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'properties-cardiac-muscle':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Properties of Cardiac Muscle..." />}>
          <PropertiesOfCardiacMuscle onBack={() => setCurrentView('amphibian')} />
        </Suspense>
      );
    case 'effect-of-load':
      return (
        <Suspense fallback={<LoadingSpinner message="Loading Effect of Load..." />}>
          <EffectOfLoad onBack={() => window.history.back()} />
        </Suspense>
      );
    case 'microscope': return (
      <Suspense fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <LoadingSpinner message="Loading Microscope..." />
        </div>
      }>
        <Microscope3D onBack={() => window.history.back()} />
      </Suspense>
    );

    default: return null;
  }
};

export default App;