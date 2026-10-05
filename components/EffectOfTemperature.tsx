import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Environment, Text } from '@react-three/drei';
import { ArrowLeft, Eye, LineChart, Thermometer, Zap, RefreshCw, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';

// --- Types & Constants ---
const TOTAL_WINDOW_MS = 400; // Increased to show longer latent periods clearly

interface SimulationState {
    time: number;
    isRunning: boolean;
    data: { t: number; y: number }[];
    currentHeight: number;
    phase: 'Rest' | 'Latent' | 'Contraction' | 'Relaxation';
}

// Temperature effects on muscle contraction
const getTemperatureParameters = (temperature: number) => {
    // Temperature effects based on textbook (Fig 21.1):
    // Warm (38-40°C): HIGHEST amplitude, SHORTEST latent period (LW)
    // Normal (25-26°C): Medium amplitude, Medium latent period (LN)
    // Cold (10-16°C): LOWEST amplitude, LONGEST latent period (LC)

    let latentPeriod = 10;
    let contractionDuration = 40;
    let relaxationDuration = 50;
    let amplitudeMultiplier = 1.0;

    if (temperature <= 10) {
        // Cold (10°C): Total = 250ms (Latent 75 + Contraction 65 + Relaxation 110)
        latentPeriod = 75;
        contractionDuration = 65;
        relaxationDuration = 110;
        amplitudeMultiplier = 0.5;
    } else if (temperature < 20) {
        // Cool - transition
        latentPeriod = 60;
        contractionDuration = 62;
        relaxationDuration = 100;
        amplitudeMultiplier = 0.7;
    } else if (temperature <= 30) {
        // Normal (25°C): Total = 200ms (Latent 50 + Contraction 60 + Relaxation 90)
        latentPeriod = 50;
        contractionDuration = 60;
        relaxationDuration = 90;
        amplitudeMultiplier = 0.85;
    } else if (temperature < 40) {
        // Warm transition
        latentPeriod = 35;
        contractionDuration = 55;
        relaxationDuration = 80;
        amplitudeMultiplier = 0.95;
    } else if (temperature <= 42) {
        // Warm (40°C): Total = 150ms (Latent 25 + Contraction 50 + Relaxation 75)
        latentPeriod = 25;
        contractionDuration = 50;
        relaxationDuration = 75;
        amplitudeMultiplier = 1.2;
    } else {
        // Heat Rigor (>= 43°C) - muscle proteins denature
        // Muscle enters sustained contraction state
        latentPeriod = 15;
        contractionDuration = 50;
        relaxationDuration = 0; // No relaxation - sustained contraction
        amplitudeMultiplier = 1.3; // Strong sustained contraction
    }

    const isHeatRigor = temperature >= 43;
    return { latentPeriod, contractionDuration, relaxationDuration, amplitudeMultiplier, isHeatRigor };
};

// --- Helper Physics ---
const calculateInstantaneousHeight = (
    t: number,
    peakHeight: number,
    params: { latentPeriod: number; contractionDuration: number; relaxationDuration: number; isHeatRigor?: boolean }
) => {
    if (t < 0) return 0;
    if (t < params.latentPeriod) return 0;

    const activeTime = t - params.latentPeriod;

    let contraction = 0;

    if (activeTime < params.contractionDuration) {
        const progress = activeTime / params.contractionDuration;
        contraction = peakHeight * Math.sin(progress * (Math.PI / 2));
    } else if (params.isHeatRigor) {
        // Heat rigor: sustained contraction, no relaxation
        contraction = peakHeight;
    } else if (activeTime < params.contractionDuration + params.relaxationDuration) {
        const relaxTime = activeTime - params.contractionDuration;
        const progress = relaxTime / params.relaxationDuration;
        contraction = peakHeight * ((1 + Math.cos(progress * Math.PI)) / 2);
    }

    return contraction;
};

// --- 3D Components ---

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

// Temperature indicator showing the Ringer's solution temperature
const TemperatureIndicator = ({ temperature }: { temperature: number }) => {
    const redColor = '#ef4444';
    const glassColor = '#e2e8f0';
    const plateColor = '#f8fafc';
    const metalColor = '#94a3b8';

    // Temperature mapping: 0-50 C maps to -0.5 to 0.5 height
    const getCHeight = (c: number) => (c / 50) - 0.5;
    const getFFromC = (c: number) => (c * 9 / 5) + 32;
    const getFHeight = (f: number) => (((f - 32) * 5 / 9) / 50) - 0.5;

    return (
        <group position={[-3, 0.8, -0.56]} rotation={[0, 0, 0]}>
            {/* Backing Plate */}
            <Box args={[0.50, 1.7, 0.05]} position={[0.01, 0, -0.02]}>
                <meshStandardMaterial color={plateColor} roughness={0.5} />
            </Box>

            <Text position={[0, 0.78, 0.01]} fontSize={0.05} color="#475569" fontWeight="bold">
                THERMOMETER
            </Text>

            {/* Glass Tube (outer) - Extended to cover bulb area */}
            <Cylinder args={[0.04, 0.04, 1.3]} position={[0, -0.05, 0]}>
                <meshPhysicalMaterial
                    color={glassColor}
                    transmission={0.9}
                    thickness={0.02}
                    roughness={0.1}
                    transparent
                    opacity={0.4}
                />
            </Cylinder>

            {/* Red Fluid Bulb reservoir - Moved slightly up to connect */}
            <Sphere args={[0.1, 16, 16]} position={[0, -0.7, 0]}>
                <meshStandardMaterial color={redColor} emissive={redColor} emissiveIntensity={0.4} />
            </Sphere>

            {/* Static Red Fluid (Reservoir-to-scale junction) */}
            <Cylinder args={[0.02, 0.02, 0.2]} position={[0, -0.6, 0]}>
                <meshStandardMaterial color={redColor} emissive={redColor} emissiveIntensity={0.3} />
            </Cylinder>

            {/* Red Fluid Column (dynamic, starts from zero at -0.5) */}
            <Cylinder
                args={[0.02, 0.02, Math.max(0.001, (temperature / 50) * 1.0)]}
                position={[0, -0.5 + (Math.max(0.001, (temperature / 50) * 1.0) / 2), 0]}
            >
                <meshStandardMaterial color={redColor} emissive={redColor} emissiveIntensity={0.4} />
            </Cylinder>

            {/* Scale Headers - Adjusted position for better spacing */}
            <Text position={[-0.12, 0.65, 0.01]} fontSize={0.08} color="#475569" fontWeight="bold">C</Text>
            <Text position={[0.12, 0.65, 0.01]} fontSize={0.08} color="#475569" fontWeight="bold">F</Text>

            {/* Celsius Scale (Left side) */}
            {Array.from({ length: 26 }).map((_, i) => {
                const tempC = i * 2;
                const h = getCHeight(tempC);
                const isMajor = tempC % 10 === 0;
                return (
                    <group key={`c-${i}`} position={[-0.04, h, 0.01]}>
                        <Box args={[isMajor ? 0.08 : 0.04, 0.005, 0.01]} position={[isMajor ? -0.04 : -0.02, 0, 0]}>
                            <meshStandardMaterial color="#64748b" />
                        </Box>
                        {isMajor && (
                            <Text position={[-0.11, 0, 0]} fontSize={0.06} color="#1e293b" anchorX="right">
                                {tempC}
                            </Text>
                        )}
                    </group>
                );
            })}

            {/* Fahrenheit Scale (Right side) */}
            {[32, 40, 50, 60, 70, 80, 90, 100, 110, 122].map((tempF, i) => {
                const h = getFHeight(tempF);
                const isMajor = tempF % 20 === 0 || tempF === 32 || tempF === 122;
                return (
                    <group key={`f-${i}`} position={[0.04, h, 0.01]}>
                        <Box args={[isMajor ? 0.08 : 0.04, 0.005, 0.01]} position={[isMajor ? 0.04 : 0.02, 0, 0]}>
                            <meshStandardMaterial color="#64748b" />
                        </Box>
                        {isMajor && (
                            <Text position={[0.10, 0, 0]} fontSize={0.06} color="#1e293b" anchorX="left">
                                {tempF}
                            </Text>
                        )}
                    </group>
                );
            })}

            {/* Metal clamps - Repositioned for cleaner area */}
            <Cylinder args={[0.045, 0.045, 0.02]} position={[0, 0.6, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
                <meshStandardMaterial color={metalColor} metalness={0.8} />
            </Cylinder>
            <Cylinder args={[0.045, 0.045, 0.02]} position={[0, -0.68, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
                <meshStandardMaterial color={metalColor} metalness={0.8} />
            </Cylinder>
        </group>
    );
};

const LucasChamber = ({
    muscleShortening,
    onHoverChange,
    temperature
}: {
    muscleShortening: number,
    onHoverChange?: (l: string | null) => void,
    temperature: number
}) => {
    // Water color based on temperature (visual indicator)
    const getWaterColor = (temp: number) => {
        if (temp < 15) return '#1e40af'; // Deep blue - cold
        if (temp < 20) return '#0ea5e9'; // Light blue - cool
        if (temp <= 30) return '#a5f3fc'; // Cyan - optimal
        if (temp <= 37) return '#fef3c7'; // Warm tint
        return '#fecaca'; // Red tint - hot
    };

    return (
        <InteractiveObject label="Lucas Chamber & Muscle (Ringer's Solution)" onHoverChange={onHoverChange}>
            <group position={[-2, 0, 0]}>
                {/* Trough/Chamber Structure */}
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
                    {/* Ringer's Solution with temperature color */}
                    <Box args={[3.0, 0.8, 1.3]} position={[0, 0.4, 0]}>
                        <meshPhysicalMaterial color={getWaterColor(temperature)} transmission={0.85} opacity={0.7} transparent roughness={0.1} ior={1.33} />
                    </Box>
                </group>

                {/* Muscle */}
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
                            <Cylinder args={[0.012, 0.005, 2.8]} rotation={[0, 0, 0]} position={[0, -0.6, 0]}>
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
    tension,
    isRunning,
    onHoverChange,
    resetKey
}: {
    simTime: number,
    tension: number,
    isRunning: boolean,
    onHoverChange?: (l: string | null) => void,
    resetKey: number
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

    useEffect(() => {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1024, 512); texture.needsUpdate = true; }
        lastDrawState.current = null;
    }, [resetKey, texture]);

    useFrame(() => {
        if (!isRunning) { lastDrawState.current = null; return; }
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const MAX_ROTATION = Math.PI / 3;
        const PIXELS = 1024 * (MAX_ROTATION / (2 * Math.PI));

        const x = 50 + (simTime / TOTAL_WINDOW_MS) * PIXELS;
        const y = (512 * 0.5) - (tension * 80);

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
            const angle = (simTime / TOTAL_WINDOW_MS) * (Math.PI / 3);
            drumRef.current.rotation.y = baseRotation - angle;
        }
    });

    return (
        <InteractiveObject label="Kymograph" onHoverChange={onHoverChange}>
            <group position={[-2.071, 0.7, 4.28]}>
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

// --- Trace History Type ---
interface TraceHistory {
    temperature: number;
    data: { t: number; y: number }[];
    latentPeriod: number;
    color: string;
    label: string;
}

// --- Temperature Comparison Graph Component ---
const TemperatureComparisonGraph = ({
    currentData,
    currentTemperature,
    traceHistory,
    isRunning
}: {
    currentData: { t: number; y: number }[];
    currentTemperature: number;
    traceHistory: TraceHistory[];
    isRunning: boolean;
}) => {
    const width = 400;
    const height = 320; // Increased height to fit latent period labels
    const padding = { top: 30, right: 20, bottom: 90, left: 50 }; // Increased bottom padding
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Scale functions
    const xScale = (t: number) => padding.left + (t / TOTAL_WINDOW_MS) * graphWidth;
    const yScale = (y: number) => height - padding.bottom - (y / 2) * graphHeight;

    // Get color for temperature
    const getTraceColor = (temp: number) => {
        if (temp <= 10) return '#3b82f6'; // Blue for cold
        if (temp >= 40) return '#ef4444'; // Red for warm
        return '#22c55e'; // Green for normal
    };

    // Get label for temperature
    const getLabel = (temp: number) => {
        if (temp <= 10) return 'LC';
        if (temp >= 40) return 'LW';
        return 'LN';
    };

    // Create path from data
    const createPath = (data: { t: number; y: number }[]) => {
        if (data.length === 0) return '';
        return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.t)} ${yScale(d.y)}`).join(' ');
    };

    // Find unique latent periods for display
    const allTraces = [...traceHistory];
    if (currentData.length > 0) {
        const currentParams = getTemperatureParameters(currentTemperature);
        allTraces.push({
            temperature: currentTemperature,
            data: currentData,
            latentPeriod: currentParams.latentPeriod,
            color: getTraceColor(currentTemperature),
            label: getLabel(currentTemperature)
        });
    }

    return (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="bg-slate-950">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                <line
                    key={`h-${i}`}
                    x1={padding.left}
                    y1={height - padding.bottom - ratio * graphHeight}
                    x2={width - padding.right}
                    y2={height - padding.bottom - ratio * graphHeight}
                    stroke="#334155"
                    strokeWidth="0.5"
                />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                <line
                    key={`v-${i}`}
                    x1={padding.left + ratio * graphWidth}
                    y1={padding.top}
                    x2={padding.left + ratio * graphWidth}
                    y2={height - padding.bottom}
                    stroke="#334155"
                    strokeWidth="0.5"
                />
            ))}

            {/* Baseline */}
            <line
                x1={padding.left}
                y1={yScale(0)}
                x2={width - padding.right}
                y2={yScale(0)}
                stroke="#64748b"
                strokeWidth="1"
            />

            {/* PS (Point of Stimulus) marker - moved left to avoid overlap */}
            <line x1={xScale(0)} y1={yScale(0) - 10} x2={xScale(0)} y2={yScale(0) + 10} stroke="#94a3b8" strokeWidth="1" />
            <text x={xScale(0) - 12} y={yScale(0) + 5} fill="#94a3b8" fontSize="11" textAnchor="middle" fontWeight="bold">PS</text>

            {/* Ghost traces (historical) */}
            {traceHistory.map((trace, i) => (
                <g key={i}>
                    <path
                        d={createPath(trace.data)}
                        fill="none"
                        stroke={trace.color}
                        strokeWidth="2"
                        opacity="0.4"
                    />
                </g>
            ))}

            {/* Labels for unique temperatures - show only ONE label per temperature category */}
            {(() => {
                // Group traces by label type and find the best one for each
                const labelGroups: { [key: string]: typeof traceHistory[0] } = {};
                traceHistory.forEach(trace => {
                    if (!labelGroups[trace.label] || trace.data.length > labelGroups[trace.label].data.length) {
                        labelGroups[trace.label] = trace;
                    }
                });

                return Object.values(labelGroups).map((trace) => {
                    if (trace.data.length === 0) return null;
                    const maxPoint = trace.data.reduce((max, d) => d.y > max.y ? d : max, trace.data[0]);
                    return (
                        <text
                            key={`label-${trace.label}`}
                            x={xScale(maxPoint.t) + 5}
                            y={yScale(maxPoint.y) - 5}
                            fill={trace.color}
                            fontSize="10"
                            opacity="0.6"
                        >
                            {trace.temperature}°C
                        </text>
                    );
                });
            })()}

            {/* Current trace (bright) */}
            {currentData.length > 0 && (
                <g>
                    <path
                        d={createPath(currentData)}
                        fill="none"
                        stroke={getTraceColor(currentTemperature)}
                        strokeWidth="2.5"
                        filter="url(#glow)"
                    />
                    {/* Temperature label at peak */}
                    {(() => {
                        const maxPoint = currentData.reduce((max, d) => d.y > max.y ? d : max, currentData[0]);
                        if (maxPoint.y > 0.1) {
                            return (
                                <text
                                    x={xScale(maxPoint.t) + 8}
                                    y={yScale(maxPoint.y) - 8}
                                    fill={getTraceColor(currentTemperature)}
                                    fontSize="12"
                                    fontWeight="bold"
                                >
                                    {currentTemperature}°C
                                </text>
                            );
                        }
                        return null;
                    })()}
                </g>
            )}

            {/* Latent period markers - fixed positions: LW (top), LN (middle), LC (bottom) */}
            {allTraces.length > 0 && (
                <g>
                    {allTraces.map((trace) => {
                        const lpX = xScale(trace.latentPeriod);
                        const baseY = yScale(0);
                        // Fixed position based on label type: LW=0, LN=1, LC=2
                        const positionMap: { [key: string]: number } = { 'LW': 0, 'LN': 1, 'LC': 2 };
                        const fixedPosition = positionMap[trace.label] ?? 0;
                        const offset = fixedPosition * 16;
                        return (
                            <g key={`lp-${trace.label}-${trace.temperature}`}>
                                {/* Latent period line */}
                                <line
                                    x1={xScale(0)}
                                    y1={baseY + 35 + offset}
                                    x2={lpX}
                                    y2={baseY + 35 + offset}
                                    stroke={trace.color}
                                    strokeWidth="1.5"
                                    opacity="0.8"
                                />
                                {/* Arrow markers */}
                                <polygon
                                    points={`${xScale(0) + 5},${baseY + 32 + offset} ${xScale(0)},${baseY + 35 + offset} ${xScale(0) + 5},${baseY + 38 + offset}`}
                                    fill={trace.color}
                                    opacity="0.8"
                                />
                                <polygon
                                    points={`${lpX - 5},${baseY + 32 + offset} ${lpX},${baseY + 35 + offset} ${lpX - 5},${baseY + 38 + offset}`}
                                    fill={trace.color}
                                    opacity="0.8"
                                />
                                {/* Label */}
                                <text
                                    x={(xScale(0) + lpX) / 2}
                                    y={baseY + 33 + offset}
                                    fill={trace.color}
                                    fontSize="10"
                                    textAnchor="middle"
                                    fontWeight="bold"
                                >
                                    {trace.label}
                                </text>
                            </g>
                        );
                    })}
                </g>
            )}

            {/* Glow filter for current trace */}
            <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Legend */}
            <g transform={`translate(${width - 80}, 15)`}>
                <text x="0" y="0" fill="#94a3b8" fontSize="9">LW = Warm</text>
                <text x="0" y="12" fill="#94a3b8" fontSize="9">LN = Normal</text>
                <text x="0" y="24" fill="#94a3b8" fontSize="9">LC = Cold</text>
            </g>
        </svg>
    );
};

// --- Temperature Control Component ---
const TemperatureControl = ({
    temperature,
    setTemperature,
    targetTemperature,
    setTargetTemperature
}: {
    temperature: number,
    setTemperature: (t: number) => void,
    targetTemperature: number | null,
    setTargetTemperature: (t: number | null) => void
}) => {
    const getTemperatureLabel = (temp: number) => {
        if (temp <= 10) return 'Cold';
        if (temp >= 43) return 'HEAT RIGOR';
        if (temp >= 40) return 'Warm';
        return ''; // No label for intermediate temperatures
    };

    const getTemperatureColor = (temp: number) => {
        if (temp <= 10) return 'text-blue-400';
        if (temp >= 43) return 'text-red-500';
        if (temp >= 40) return 'text-amber-400';
        return 'text-green-400'; // Default color for intermediate
    };

    const displayTemp = Math.round(temperature);
    const isHeatRigor = displayTemp >= 43;
    const label = getTemperatureLabel(displayTemp);

    return (
        <div className={`p-4 rounded-xl border ${isHeatRigor ? 'bg-red-950 border-red-700' : 'bg-slate-800 border-slate-700'}`}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Thermometer className={`w-5 h-5 ${getTemperatureColor(displayTemp)}`} />
                    <span className="text-sm font-medium text-slate-300">Ringer's Solution Temperature</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold ${getTemperatureColor(displayTemp)}`}>{displayTemp}°C</span>
                    {label && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${displayTemp <= 10 ? 'bg-blue-900 text-blue-300' :
                            displayTemp >= 43 ? 'bg-red-600 text-white animate-pulse' :
                                'bg-amber-900 text-amber-300'
                            }`}>
                            {label}
                        </span>
                    )}
                </div>
            </div>
            <input
                type="range"
                min="5"
                max="45"
                step="0.1"
                value={temperature}
                onChange={(e) => {
                    setTargetTemperature(null);
                    setTemperature(Number(e.target.value));
                }}
                className="w-full h-2 bg-gradient-to-r from-blue-500 via-green-500 to-red-500 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>5°C</span>
                <span>25°C</span>
                <span>45°C</span>
            </div>

            {/* Preset Temperature Buttons */}
            <div className="flex gap-2 mt-3">
                <button
                    onClick={() => setTargetTemperature(10)}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${(targetTemperature === 10 || (targetTemperature === null && displayTemp === 10))
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-blue-300 hover:bg-slate-600 border border-slate-600'
                        }`}
                >
                    ❄️ Cold (10°C)
                </button>
                <button
                    onClick={() => setTargetTemperature(40)}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${(targetTemperature === 40 || (targetTemperature === null && displayTemp === 40))
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-700 text-amber-300 hover:bg-slate-600 border border-slate-600'
                        }`}
                >
                    🔥 Warm (40°C)
                </button>
            </div>

            {/* Heat Rigor Warning */}
            {isHeatRigor && (
                <div className="mt-3 p-2 bg-red-900/50 border border-red-600 rounded-lg flex items-center gap-2">
                    <span className="text-red-400">⚠️</span>
                    <span className="text-red-300 font-semibold text-sm">Heat Rigor</span>
                </div>
            )}
        </div>
    );
};

// --- Main Component ---

export const EffectOfTemperature: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [temperature, setTemperature] = useState(25);
    const [targetTemperature, setTargetTemperature] = useState<number | null>(null);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d');
    const [traceHistory, setTraceHistory] = useState<TraceHistory[]>([]);
    const [activeTemperature, setActiveTemperature] = useState(25); // Temperature used for current trace
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const [simState, setSimState] = useState<SimulationState>({
        time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest'
    });

    const animationFrameRef = useRef<number>();

    // Smooth temperature transition
    useEffect(() => {
        if (targetTemperature === null) return;

        let frameId: number;
        const animate = () => {
            setTemperature(prev => {
                const diff = targetTemperature - prev;
                const step = Math.sign(diff) * Math.min(Math.abs(diff), 0.5); // 0.5 degrees per frame

                if (Math.abs(diff) <= 0.5) {
                    setTargetTemperature(null);
                    return targetTemperature;
                }
                return prev + step;
            });
            frameId = requestAnimationFrame(animate);
        };

        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
    }, [targetTemperature]);

    // Get color for temperature
    const getTraceColor = (temp: number) => {
        if (temp <= 10) return '#3b82f6';
        if (temp >= 40) return '#ef4444';
        return '#22c55e';
    };

    // Get label for temperature
    const getLabel = (temp: number) => {
        if (temp <= 10) return 'LC';
        if (temp >= 40) return 'LW';
        return 'LN';
    };

    const handleStimulate = () => {
        if (simState.isRunning) return;

        // Save current trace to history if it has data (using activeTemperature which has the previous stimulation temp)
        if (simState.data.length > 10) {
            const params = getTemperatureParameters(activeTemperature);
            setTraceHistory(prev => [...prev.slice(-4), { // Keep last 5 traces
                temperature: activeTemperature,
                data: [...simState.data],
                latentPeriod: params.latentPeriod,
                color: getTraceColor(activeTemperature),
                label: getLabel(activeTemperature)
            }]);
        }

        // Set the active temperature to the currently selected temperature for the new trace
        setActiveTemperature(Math.round(temperature));
        setSimState({ time: 0, isRunning: true, data: [], currentHeight: 0, phase: 'Latent' });
    };

    const handleReset = () => {
        setSimState({ time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest' });
        setTraceHistory([]);
        setActiveTemperature(Math.round(temperature));
        setTargetTemperature(25); // Set back to normal temperature on reset
        setResetKey(prev => prev + 1);
    };

    useEffect(() => {
        if (!simState.isRunning) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }

        let lastTime = Date.now();
        let simTime = simState.time;

        // Get temperature-adjusted parameters
        const tempParams = getTemperatureParameters(temperature);
        const peakHeight = 1.5 * tempParams.amplitudeMultiplier;
        const totalDuration = tempParams.latentPeriod + tempParams.contractionDuration + tempParams.relaxationDuration;

        const loop = () => {
            const now = Date.now();
            const dt = now - lastTime;
            lastTime = now;
            simTime += dt * 0.2;

            if (simTime > totalDuration + 20) {
                setSimState(prev => ({ ...prev, isRunning: false, time: totalDuration, currentHeight: 0, phase: 'Rest' }));
                return;
            }

            const h = calculateInstantaneousHeight(simTime, peakHeight, tempParams);
            let phase: SimulationState['phase'] = 'Rest';
            if (simTime < tempParams.latentPeriod) phase = 'Latent';
            else if (simTime < tempParams.latentPeriod + tempParams.contractionDuration) phase = 'Contraction';
            else phase = 'Relaxation';

            setSimState(prev => ({
                ...prev,
                time: simTime,
                currentHeight: h,
                phase,
                data: [...prev.data, { t: simTime, y: h }]
            }));
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
    }, [simState.isRunning, temperature]);


    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 via-green-400 to-red-400 bg-clip-text text-transparent">Effect of Temperature</h1>
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

            <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Mobile View Toggle */}
                <div className="lg:hidden flex bg-slate-800 border-b border-slate-700">
                    <button
                        onClick={() => setMobileView('3d')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === '3d'
                            ? 'bg-slate-900 text-cyan-400 border-b-2 border-cyan-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-cyan-400 border-b-2 border-cyan-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        <span>Graph View</span>
                    </button>
                </div>

                {/* 3D View */}
                <div className={`flex-1 relative bg-black ${mobileView === 'graph' ? 'hidden lg:flex' : 'flex'}`}>
                    <Canvas shadows camera={{ position: [2.95, 4.04, 8.23], fov: 35 }}>
                        <color attach="background" args={[sceneBgColor]} />
                        <Environment preset="city" />
                        <ambientLight intensity={0.6} color="#ffffff" />
                        <spotLight position={[10, 10, 5]} angle={0.3} penumbra={0.5} intensity={2} castShadow />

                        <group position={[0, -1, 0]}>
                            <group rotation={[0, Math.PI / 2, 0]}>
                                <LucasChamber muscleShortening={simState.currentHeight} onHoverChange={setHoveredLabel} temperature={temperature} />
                                <StarlingLever angle={simState.currentHeight * 0.15} onHoverChange={setHoveredLabel} />
                                <TemperatureIndicator temperature={temperature} />
                            </group>
                            <Kymograph
                                simTime={simState.time}
                                tension={simState.currentHeight}
                                isRunning={simState.isRunning}
                                onHoverChange={setHoveredLabel}
                                resetKey={resetKey}
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

                {/* Controls & Graph Panel */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none">
                    {/* Temperature Comparison Graph */}
                    <div className={`flex-1 p-6 min-h-0 flex flex-col border-b border-slate-800 ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Temperature Comparison</h3>
                        <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative">
                            <TemperatureComparisonGraph
                                currentData={simState.data}
                                currentTemperature={activeTemperature}
                                traceHistory={traceHistory}
                                isRunning={simState.isRunning}
                            />
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="p-6 bg-slate-900 z-10 space-y-4">
                        {/* Temperature Control */}
                        <TemperatureControl
                            temperature={temperature}
                            setTemperature={setTemperature}
                            targetTemperature={targetTemperature}
                            setTargetTemperature={setTargetTemperature}
                        />

                        {/* Simple Stimulate/Reset Buttons */}
                        <div className="flex gap-3">
                            <button
                                onClick={handleStimulate}
                                disabled={simState.isRunning}
                                className={`flex-1 py-3 px-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${simState.isRunning
                                    ? 'bg-slate-700 cursor-not-allowed opacity-50'
                                    : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 shadow-lg shadow-emerald-500/25'
                                    }`}
                            >
                                <Zap className="w-5 h-5" />
                                STIMULATE
                            </button>
                            <button
                                onClick={handleReset}
                                className="py-3 px-4 rounded-xl font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
