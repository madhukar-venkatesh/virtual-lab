import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Environment } from '@react-three/drei';
import { ArrowLeft, Timer, RefreshCw, Eye, LineChart, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';
import { Controls } from './Controls';
import { Oscilloscope } from './Oscilloscope';
import { DataPoint } from '../types';

// --- 3D Components (Ported from SimpleMuscleTwitch/EffectOfLoad) ---

const InteractiveObject = ({
    label,
    children,
    onHoverChange
}: {
    label: string,
    children: React.ReactNode,
    onHoverChange?: (label: string | null) => void
}) => {
    return (
        <group
            onPointerOver={(e) => {
                if (onHoverChange) { e.stopPropagation(); onHoverChange(label); document.body.style.cursor = 'pointer'; }
            }}
            onPointerOut={(e) => {
                if (onHoverChange) { onHoverChange(null); document.body.style.cursor = 'auto'; }
            }}
        >
            {children}
        </group>
    );
};

const LucasChamber = ({ muscleShortening, onHoverChange }: { muscleShortening: number, onHoverChange?: (l: string | null) => void }) => {
    return (
        <InteractiveObject label="Lucas Chamber & Muscle" onHoverChange={onHoverChange}>
            <group position={[-2, 0, 0]}>
                <group position={[0, -0.5, 0]}>
                    <Box args={[3.2, 0.2, 1.5]} position={[0, -0.1, 0]}>
                        <meshPhysicalMaterial color="#cbd5e1" roughness={0.1} transmission={0.2} thickness={0.5} />
                    </Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, 0.7]}>
                        <meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                    </Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, -0.7]}>
                        <meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                    </Box>
                    <Box args={[0.1, 1, 1.3]} position={[1.55, 0.5, 0]}>
                        <meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                    </Box>
                    <Box args={[0.1, 1, 1.3]} position={[-1.55, 0.5, 0]}>
                        <meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                    </Box>
                    <Box args={[3.0, 0.8, 1.3]} position={[0, 0.4, 0]}>
                        <meshPhysicalMaterial color="#a5f3fc" transmission={0.9} opacity={0.6} transparent roughness={0.1} ior={1.33} />
                    </Box>
                </group>

                <group position={[0, 0.2, 0]}>
                    <Cylinder args={[0.05, 0.05, 0.8]} rotation={[0, 0, 1.57]} position={[-1.2, 0, 0]}>
                        <meshStandardMaterial color="#94a3b8" />
                    </Cylinder>
                    <group position={[-1.2, 0, 0]}>
                        <group scale={[1 - (muscleShortening * 0.15), 1 + (muscleShortening * 0.3), 1 + (muscleShortening * 0.3)]} position={[1, 0, 0]}>
                            <Sphere args={[0.3, 16, 16]} scale={[3, 1, 1]} position={[0, 0, 0]}>
                                <meshStandardMaterial color="#be123c" roughness={0.6} />
                            </Sphere>
                            <Box args={[1.2, 0.05, 0.05]} position={[1.4, 0, 0]}>
                                <meshStandardMaterial color="#f1f5f9" />
                            </Box>
                        </group>
                    </group>
                </group>
            </group>
        </InteractiveObject>
    );
};

const AnimatedThumbScrew = ({ mode }: { mode: 'After-Loaded' | '-Loaded' }) => {
    const groupRef = useRef<THREE.Group>(null);
    const metalColor = "#c0c0c0";
    const targetY = mode === '-Loaded' ? 0.20 : 0.05;

    useFrame((state, delta) => {
        if (groupRef.current) {
            groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, delta * 5);
        }
    });

    return (
        <group position={[0.1, 0, -0.15]} rotation={[0, 0, Math.PI / 4]}>
            <group ref={groupRef}>
                <Cylinder args={[0.025, 0.025, 0.25]} position={[0, 0.125, 0]}>
                    <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.15} />
                </Cylinder>
                <Cylinder args={[0.05, 0.05, 0.06]} position={[0, 0.28, 0]}>
                    <meshStandardMaterial color={metalColor} metalness={0.85} roughness={0.25} />
                </Cylinder>
                <Box args={[0.07, 0.01, 0.015]} position={[0, 0.311, 0]}>
                    <meshStandardMaterial color="#1a1a1a" />
                </Box>
            </group>
        </group>
    );
};

const StarlingLever = ({ angle, onHoverChange }: { angle: number, onHoverChange?: (l: string | null) => void }) => {
    const brassColor = "#b8860b";
    const darkBrassColor = "#8b6914";
    const metalColor = "#c0c0c0";
    const mode = '-Loaded';

    return (
        <group position={[-0.5, 1.5, 0.1]}>
            <group position={[0.3, -1.9, 0]}>
                <InteractiveObject label="Stand (Upright Post)" onHoverChange={onHoverChange}>
                    <group position={[0, -1.5, 0]}>
                        <Box args={[0.6, 0.1, 0.4]} position={[0, -0.05, 0]}>
                            <meshStandardMaterial color={darkBrassColor} metalness={0.7} roughness={0.3} />
                        </Box>
                        <Cylinder args={[0.08, 0.1, 2.8]} position={[0, 1.35, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                        </Cylinder>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Adjustment Screw (Height Control)" onHoverChange={onHoverChange}>
                    <group position={[0, 1.35, 0]}>
                        <Cylinder args={[0.06, 0.06, 0.3]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        <Cylinder args={[0.1, 0.1, 0.15]} position={[0, 0.22, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.3} />
                        </Cylinder>
                    </group>
                </InteractiveObject>
            </group>
            <group position={[-0.4, -0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, -1.11]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, 0.11]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.1, 1.3]} position={[0, 0.15, -0.5]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                <InteractiveObject label="After Load Screw" onHoverChange={onHoverChange}>
                    <AnimatedThumbScrew mode={mode} />
                </InteractiveObject>
                <InteractiveObject label="Pivot Bolt (Fulcrum Axis)" onHoverChange={onHoverChange}>
                    <group>
                        <Cylinder args={[0.04, 0.04, 1.4]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.21]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Nut (Pivot Bolt)" onHoverChange={onHoverChange}>
                    <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.21]}>
                        <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                    </Cylinder>
                </InteractiveObject>

                <group rotation={[0, 0, -angle]}>
                    <InteractiveObject label="Long Arm (Writing Lever)" onHoverChange={onHoverChange}>
                        <group rotation={[0, Math.PI, -Math.PI / 2]}>
                            <group position={[0.55, 0, 1]}>
                                <Box args={[1.125, 0.08, 0.05]} position={[0, 0, 0]}>
                                    <meshStandardMaterial color={brassColor} metalness={0.6} roughness={0.4} />
                                </Box>
                                {[-0.3, -0.05, 0.2, 0.45].map((x, i) => (
                                    <Cylinder key={i} args={[0.02, 0.02, 0.052]} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
                                        <meshStandardMaterial color="#1a1a1a" />
                                    </Cylinder>
                                ))}
                            </group>
                        </group>
                    </InteractiveObject>
                    <InteractiveObject label="Muscle Hook (S-shaped)" onHoverChange={onHoverChange}>
                        <group position={[0, 0, -0.15]} rotation={[0, 0, 1.7]}>
                            <Cylinder args={[0.015, 0.015, 0.6]} position={[0, -0.3, 0]}>
                                <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                            </Cylinder>
                            <Cylinder args={[0.015, 0.015, 0.15]} position={[0.05, -0.6, 0]} rotation={[0, 0, 0.8]}>
                                <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                            </Cylinder>
                        </group>
                    </InteractiveObject>
                    <InteractiveObject label="Writing Point (Stylus)" onHoverChange={onHoverChange}>
                        <group position={[0, -1.1, -1]}>
                            <Cylinder args={[0.012, 0.005, 0.6]} rotation={[0, 0, 0]} position={[0, -0.3, 0]}>
                                <meshStandardMaterial color="#1a1a1a" />
                            </Cylinder>
                        </group>
                    </InteractiveObject>
                </group>
            </group>
        </group>
    );
};

const Kymograph = ({
    simTime,
    currentForce,
    isRunning,
    onHoverChange,
    resetKey,
    historyTraces
}: {
    simTime: number,
    currentForce: number, // Changed from tension to actual force value
    isRunning: boolean,
    onHoverChange?: (l: string | null) => void,
    resetKey: number,
    historyTraces: { data: DataPoint[], label?: string }[]
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const lastDrawState = useRef<{ x: number, y: number } | null>(null);
    const texture = useMemo(() => {
        const canvas = canvasRef.current;
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 512);
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    // Y-axis scaling constants matching Oscilloscope domain [-3, 12]
    const Y_MIN = -3;
    const Y_MAX = 12;
    const Y_RANGE = Y_MAX - Y_MIN; // 15
    const CANVAS_HEIGHT = 512;
    const CANVAS_TOP_MARGIN = 30; // Leave some margin at top
    const CANVAS_BOTTOM_MARGIN = 50; // Leave some margin at bottom
    const USABLE_HEIGHT = CANVAS_HEIGHT - CANVAS_TOP_MARGIN - CANVAS_BOTTOM_MARGIN;

    // Convert force value to canvas Y coordinate (inverted: higher force = lower Y)
    const forceToCanvasY = (force: number) => {
        const normalized = (force - Y_MIN) / Y_RANGE; // 0 to 1
        return CANVAS_HEIGHT - CANVAS_BOTTOM_MARGIN - (normalized * USABLE_HEIGHT);
    };

    // Draw History Logic
    useEffect(() => {
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Clear Canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1024, 512);

        const MAX_ROTATION = Math.PI; // Full spread
        const PIXELS = 1024 * (MAX_ROTATION / (2 * Math.PI));
        const TOTAL_WINDOW_MS = 500; // Increased window

        // Draw all history traces with same scaling as Oscilloscope
        historyTraces.forEach((trace, i) => {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.3 + (i / Math.max(1, historyTraces.length)) * 0.7})`;
            ctx.lineWidth = 2;
            ctx.beginPath();

            trace.data.forEach((pt, idx) => {
                const x = 50 + (pt.time / TOTAL_WINDOW_MS) * PIXELS;
                const y = forceToCanvasY(pt.force);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        });

        texture.needsUpdate = true;
        lastDrawState.current = null; // Reset live draw state
    }, [historyTraces, resetKey, texture]);

    useFrame(() => {
        if (!isRunning) { lastDrawState.current = null; return; }
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const MAX_ROTATION = Math.PI;
        const PIXELS = 1024 * (MAX_ROTATION / (2 * Math.PI));
        const TOTAL_WINDOW_MS = 500;

        const x = 50 + (simTime / TOTAL_WINDOW_MS) * PIXELS;
        const y = forceToCanvasY(currentForce); // Use same scaling as history traces

        if (lastDrawState.current) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(lastDrawState.current.x, lastDrawState.current.y); ctx.lineTo(x, y); ctx.stroke();
            texture.needsUpdate = true;
        }
        lastDrawState.current = { x, y };
    });

    const drumRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (drumRef.current && isRunning) {
            const baseRotation = 1.5;
            const angle = (simTime / 500) * Math.PI;
            drumRef.current.rotation.y = baseRotation - angle;
        }
    });

    return (
        <InteractiveObject label="Kymograph" onHoverChange={onHoverChange}>
            <group position={[-2.5, 1.5, 2]}>
                <group ref={drumRef} rotation={[0, 1.5, 0]}>
                    <Cylinder args={[1.2, 1.2, 3, 64]}>
                        <meshBasicMaterial attach="material-0" map={texture} />
                        <meshStandardMaterial attach="material-1" color="#111" />
                        <meshStandardMaterial attach="material-2" color="#111" />
                    </Cylinder>
                </group>
                <Cylinder args={[0.1, 0.1, 4.5]} position={[0, -0.25, 0]}><meshStandardMaterial color="#1e293b" /></Cylinder>
                <Box args={[1.5, 0.5, 2]} position={[0, -2.25, 0]}><meshStandardMaterial color="#0f172a" /></Box>
            </group>
        </InteractiveObject>
    );
};


// --- Constants & Logic from MuscleLab ---

const LATENT_PERIOD_BASE = 10;
const CONTRACTION_TIME_BASE = 40;
const RELAXATION_TIME_BASE = 50;
const THRESHOLD_VOLTAGE = 1.0; // In MuscleLab generic it might be generic
const MAX_VOLTAGE = 8.0;

// PASTE: FATIGUE_WAVE_CONFIG from App.tsx
const FATIGUE_WAVE_CONFIG = [
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

export const GenesisOfFatigue: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [voltage, setVoltage] = useState(3.5);
    const [data, setData] = useState<DataPoint[]>([]);
    const dataRef = useRef<DataPoint[]>([]);

    const [isStimulating, setIsStimulating] = useState(false);
    const [contractionLevel, setContractionLevel] = useState(0);
    const [currentForceValue, setCurrentForceValue] = useState(0); // Actual force value for Kymograph
    const [lastPeakForce, setLastPeakForce] = useState(0);

    const [autoStimulate, setAutoStimulate] = useState(false);
    const autoStimulateRef = useRef(false);
    const [stimulusCount, setStimulusCount] = useState(0);
    const stimulusCountRef = useRef(0);
    const [fatigueLevel, setFatigueLevel] = useState(0);
    const fatigueLevelRef = useRef(0);
    const [historyData, setHistoryData] = useState<{ data: DataPoint[], label?: string }[]>([]);

    const animationRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d'); // Toggle for mobile view
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const calculateParameters = (v: number, l: number, f: number, sc: number) => {
        let maxForce = v < THRESHOLD_VOLTAGE ? 0 : (v >= MAX_VOLTAGE ? 10 : 10 * ((v - THRESHOLD_VOLTAGE) / (MAX_VOLTAGE - THRESHOLD_VOLTAGE)));
        let contracture = 0;
        let secondPeak = 0;
        let durationMultiplier = 1.0;

        const waveIndex = Math.min(sc - 1, FATIGUE_WAVE_CONFIG.length - 1);
        const waveConfig = FATIGUE_WAVE_CONFIG[Math.max(0, waveIndex)];

        maxForce = waveConfig.peak;
        contracture = waveConfig.trough;
        durationMultiplier = waveConfig.duration ?? 1.0;
        secondPeak = waveConfig.secondPeak ?? 0;

        return {
            force: maxForce,
            latent: LATENT_PERIOD_BASE,
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

            const currentCount = stimulusCountRef.current;
            const shouldSave = currentCount <= 10 || currentCount % 10 === 0;

            if (shouldSave) {
                const capturedData = [...dataRef.current];
                setHistoryData(prev => [...prev, { data: capturedData, label: currentCount.toString() }]);
            }

            if (autoStimulateRef.current && fatigueLevelRef.current < 1 && currentCount < 70) {
                handleStimulate();
            } else {
                setAutoStimulate(false);
                autoStimulateRef.current = false;
            }
            return;
        }

        let currentForce = 0;

        if (elapsed < params.latent) {
            currentForce = 0;
        } else if (elapsed < params.latent + params.contraction) {
            const progress = (elapsed - params.latent) / params.contraction;
            const risePhase = 0.05;
            const peakPhase = 0.15;
            const troughPhase = 0.70;

            if (progress < risePhase) {
                const riseProgress = progress / risePhase;
                currentForce = params.force * riseProgress;
            } else if (progress < peakPhase) {
                currentForce = params.force;
            } else if (progress < troughPhase) {
                const decayProgress = (progress - peakPhase) / (troughPhase - peakPhase);
                const decayFactor = 1 - decayProgress;
                currentForce = params.force * decayFactor + params.contracture * (1 - decayFactor);
            } else {
                const recoveryProgress = (progress - troughPhase) / (1 - troughPhase);
                currentForce = params.contracture + (params.secondPeak - params.contracture) * recoveryProgress;
            }
        } else {
            currentForce = params.secondPeak;
        }

        const displayForce = currentForce + (Math.random() - 0.5) * 0.02;

        setData(prev => {
            const plotTime = Math.floor(elapsed);
            if (prev.length === 0) {
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
        if (isStimulating) return;

        stimulusCountRef.current += 1;
        const currentCount = stimulusCountRef.current;
        setStimulusCount(currentCount);

        let currentFatigue = fatigueLevelRef.current;
        if (currentCount > 5) {
            currentFatigue = Math.min(1, currentFatigue + 0.015);
            fatigueLevelRef.current = currentFatigue;
            setFatigueLevel(currentFatigue);
        }

        const params = calculateParameters(voltage, 0, currentFatigue, currentCount);

        setLastPeakForce(params.force);
        setData([]);
        dataRef.current = [];

        setIsStimulating(true);
        startTimeRef.current = performance.now();
        cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame((t) => runSimulation(t, params));
    };

    const handleReset = () => {
        setData([]);
        dataRef.current = [];
        setHistoryData([]);
        setContractionLevel(0);
        setCurrentForceValue(0); // Reset force value for Kymograph
        setIsStimulating(false);
        setFatigueLevel(0);
        fatigueLevelRef.current = 0;
        setStimulusCount(0);
        stimulusCountRef.current = 0;
        setAutoStimulate(false);
        autoStimulateRef.current = false;
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setResetKey(prev => prev + 1);
    };

    // Calculate `simTime` for Kymograph
    // We can infer simTime from data length or just use a state if we wanted synchronized updates.
    // But leveraging the loop timestamp inside runSimulation is better.
    // However, `runSimulation` doesn't update state that Kymograph binds to except `contractionLevel`.
    // We need `simTime` state for Kymograph rotation!
    // SimpleMuscleTwitch uses `simState.time`.
    // MuscleLab used `data` length implicitly or something?
    // Looking at MuscleLab again... it didn't seem to pass `simTime` to a Kymograph component because it didn't HAVE a Kymograph component!
    // It only had `Controls` and `Oscilloscope`. 
    // NOW we are adding Kymograph. We need to feed it `simTime`.

    // Quick fix: Add `simTime` state and update it in `runSimulation`.
    const [simTime, setSimTime] = useState(0);

    // Update `runSimulation` to setSimTime
    const runSimulationWrapper = (timestamp: number, params: any) => {
        const elapsed = timestamp - startTimeRef.current;
        setSimTime(elapsed); // Sync for 3D Kymograph
        runSimulation(timestamp, params);
    };

    // Override the animation frame call in handleStimulate/runSimulation to use Wrapper?
    // Or just modify runSimulation above.
    // I'll modify `runSimulation` in place in the text above before writing? 
    // Actually, `runSimulation` is already defined. I'll patch it in the file writing content.
    // I'll add `setSimTime(elapsed)` inside `runSimulation`.

    // Re-writing runSimulation to include setSimTime:
    const runSimulationWithTime = (timestamp: number, params: any) => {
        const elapsed = timestamp - startTimeRef.current;
        setSimTime(elapsed);

        const totalDuration = params.latent + params.contraction + params.relaxation;

        if (elapsed > totalDuration + 50) {
            setIsStimulating(false);
            setContractionLevel(params.contracture / 10);

            const currentCount = stimulusCountRef.current;
            const shouldSave = currentCount <= 10 || currentCount % 10 === 0;

            if (shouldSave) {
                const capturedData = [...dataRef.current];
                setHistoryData(prev => [...prev, { data: capturedData, label: currentCount.toString() }]);
            }

            if (autoStimulateRef.current && fatigueLevelRef.current < 1 && currentCount < 70) {
                handleStimulate(); // This calls the original handleStimulate which sets animationRef
            } else {
                setAutoStimulate(false);
                autoStimulateRef.current = false;
            }
            return;
        }

        let currentForce = 0;

        if (elapsed < params.latent) {
            currentForce = 0;
        } else if (elapsed < params.latent + params.contraction) {
            const progress = (elapsed - params.latent) / params.contraction;
            const risePhase = 0.05;
            const peakPhase = 0.15;
            const troughPhase = 0.70;

            if (progress < risePhase) {
                const riseProgress = progress / risePhase;
                currentForce = params.force * riseProgress;
            } else if (progress < peakPhase) {
                currentForce = params.force;
            } else if (progress < troughPhase) {
                const decayProgress = (progress - peakPhase) / (troughPhase - peakPhase);
                const decayFactor = 1 - decayProgress;
                currentForce = params.force * decayFactor + params.contracture * (1 - decayFactor);
            } else {
                const recoveryProgress = (progress - troughPhase) / (1 - troughPhase);
                currentForce = params.contracture + (params.secondPeak - params.contracture) * recoveryProgress;
            }
        } else {
            currentForce = params.secondPeak;
        }

        const displayForce = currentForce + (Math.random() - 0.5) * 0.02;

        setData(prev => {
            const plotTime = Math.floor(elapsed);
            if (prev.length === 0) {
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
        setCurrentForceValue(currentForce); // Track actual force for Kymograph
        animationRef.current = requestAnimationFrame((t) => runSimulationWithTime(t, params));
    }

    // Patch handleStimulate to use runSimulationWithTime
    const handleStimulateLinked = () => {
        if (isStimulating) return;

        stimulusCountRef.current += 1;
        const currentCount = stimulusCountRef.current;
        setStimulusCount(currentCount);

        let currentFatigue = fatigueLevelRef.current;
        if (currentCount > 5) {
            currentFatigue = Math.min(1, currentFatigue + 0.015);
            fatigueLevelRef.current = currentFatigue;
            setFatigueLevel(currentFatigue);
        }

        const params = calculateParameters(voltage, 0, currentFatigue, currentCount);

        setLastPeakForce(params.force);
        setData([]);
        dataRef.current = [];
        setSimTime(0); // Reset sim time for visual

        setIsStimulating(true);
        startTimeRef.current = performance.now();
        cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame((t) => runSimulationWithTime(t, params));
    };


    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">Genesis of Fatigue</h1>
                    </div>
                </div>
                <button
                    onClick={() => setSceneBgColor(prev => prev === '#CBD5E1' ? '#2F3E46' : '#CBD5E1')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700 transition-colors flex items-center justify-center"
                    title="Toggle Canvas Background"
                >
                    {sceneBgColor === '#CBD5E1' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </header>

            <main className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
                {/* Mobile View Toggle - Only visible on small screens */}
                <div className="lg:hidden flex bg-slate-800 border-b border-slate-700">
                    <button
                        onClick={() => setMobileView('3d')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === '3d'
                            ? 'bg-slate-900 text-orange-400 border-b-2 border-orange-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-orange-400 border-b-2 border-orange-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        <span>Graph View</span>
                    </button>
                </div>

                {/* 3D Visualization Area */}
                <div className={`relative bg-black shrink-0 ${mobileView === 'graph' ? 'hidden lg:flex lg:flex-1' : 'h-[40vh] lg:h-auto lg:flex-1 flex'}`}>
                    <Canvas shadows camera={{ position: [2.95, 4.04, 8.23], fov: 35 }}>
                        <color attach="background" args={[sceneBgColor]} />
                        <Environment preset="city" />
                        <ambientLight intensity={0.6} color="#ffffff" />
                        <spotLight position={[10, 10, 5]} angle={0.3} penumbra={0.5} intensity={2} castShadow />

                        <group position={[0, -1, 0]}>
                            <group rotation={[0, Math.PI / 2, 0]}>
                                <LucasChamber muscleShortening={contractionLevel} onHoverChange={setHoveredLabel} />
                                <StarlingLever angle={contractionLevel * 0.15} onHoverChange={setHoveredLabel} />
                            </group>
                            <Kymograph
                                simTime={simTime}
                                currentForce={currentForceValue}
                                isRunning={isStimulating}
                                onHoverChange={setHoveredLabel}
                                resetKey={resetKey}
                                historyTraces={historyData}
                            />
                        </group>

                        <OrbitControls makeDefault target={[-0.74, -0.60, 3.39]} minPolarAngle={0} />
                    </Canvas>

                    {hoveredLabel && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 text-white px-3 py-1.5 rounded-full text-sm border border-slate-700 backdrop-blur-sm pointer-events-none animate-in fade-in duration-200">
                            {hoveredLabel}
                        </div>
                    )}
                </div>

                {/* Right Panel: Oscilloscope & Controls */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none h-auto z-10">

                    {/* Oscilloscope View - Top */}
                    <div className={`flex-1 p-6 min-h-0 flex flex-col ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Oscilloscope View</h3>
                        <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative">
                            <Oscilloscope
                                data={data}
                                currentVoltage={voltage}
                                historyTraces={historyData}
                            />
                        </div>
                    </div>

                    {/* Controls - Bottom */}
                    <div className="p-6 border-t border-slate-800 shrink-0 bg-slate-900 z-10">
                        <Controls
                            voltage={voltage}
                            setVoltage={setVoltage}
                            onStimulate={handleStimulateLinked}
                            onReset={handleReset}
                            isStimulating={isStimulating}
                        />

                        <div className="mt-4 flex gap-4">
                            <button
                                onClick={() => {
                                    if (autoStimulateRef.current) {
                                        autoStimulateRef.current = false;
                                        setAutoStimulate(false);
                                    } else {
                                        autoStimulateRef.current = true;
                                        setAutoStimulate(true);
                                        handleStimulateLinked();
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
                    </div>
                </div>
            </main>
        </div>
    );
};
