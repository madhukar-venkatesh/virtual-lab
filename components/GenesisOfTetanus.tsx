import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Text, Environment, Tube } from '@react-three/drei';
import { ArrowLeft, Play, RotateCcw, Settings, Activity, Eye, LineChart, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';

// --- Types & Constants ---
const LATENT_DURATION = 10;
const CONTRACTION_DURATION = 40;
const RELAXATION_DURATION = 140; // Total ~190ms
const TOTAL_DURATION_MS = 3000; // 3 seconds for Tetanus

interface SimulationState {
    time: number;
    isRunning: boolean;
    data: { t: number; y: number }[];
    currentTension: number;
    stimuliEvents: number[];
}

// --- Physics Helper ---
const MAX_TENSION = 4.0;

const calculateSingleTwitch = (t: number): number => {
    if (t < 0) return 0;
    if (t < LATENT_DURATION) return 0;

    const activeTime = t - LATENT_DURATION;

    if (activeTime < CONTRACTION_DURATION) {
        const progress = activeTime / CONTRACTION_DURATION;
        return Math.sin(progress * (Math.PI / 2));
    } else if (activeTime < CONTRACTION_DURATION + RELAXATION_DURATION) {
        const relaxTime = activeTime - CONTRACTION_DURATION;
        const progress = relaxTime / RELAXATION_DURATION;
        return (1 + Math.cos(progress * Math.PI)) / 2;
    }
    return 0;
};

const calculateTension = (t: number, stimuli: number[]): number => {
    let rawSum = 0;
    const getTreppeFactor = (index: number) => Math.min(1.5, 1.0 + (index * 0.15));

    stimuli.forEach((sTime, index) => {
        if (t >= sTime) {
            const twitch = calculateSingleTwitch(t - sTime);
            rawSum += twitch * getTreppeFactor(index);
        }
    });

    return Math.min(MAX_TENSION, rawSum);
};

// --- 3D Components (Copied from SimpleMuscleTwitch) ---

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

const ElectrodeRod = ({ position, rotationTarget, slideTarget }: { position: [number, number, number], rotationTarget: number, slideTarget: number }) => {
    const rotGroupRef = useRef<THREE.Group>(null);
    const slideGroupRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (rotGroupRef.current) rotGroupRef.current.rotation.x = THREE.MathUtils.lerp(rotGroupRef.current.rotation.x, rotationTarget, delta * 5);
        if (slideGroupRef.current) slideGroupRef.current.position.y = THREE.MathUtils.lerp(slideGroupRef.current.position.y, slideTarget, delta * 5);
    });

    return (
        <group position={position}>
            <group position={[0, 0.15, 0]}>
                <Box args={[0.02, 0.3, 0.08]} position={[-0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Box args={[0.02, 0.3, 0.08]} position={[0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Cylinder args={[0.015, 0.015, 0.1]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.05, 0]}><meshStandardMaterial color="#c0c0c0" metalness={0.8} /></Cylinder>
            </group>
            <group ref={rotGroupRef} position={[0, 0.2, 0]}>
                <Sphere args={[0.035, 16, 16]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Sphere>
                <group ref={slideGroupRef}>
                    <Cylinder args={[0.015, 0.015, 0.9]} position={[0, 0.1, 0]}><meshStandardMaterial color="#b8860b" metalness={0.7} roughness={0.2} /></Cylinder>
                    <group position={[0, 0.55, 0]}>
                        <Cylinder args={[0.025, 0.02, 0.12]} position={[0, 0, 0]}><meshStandardMaterial color="#f0f0f0" roughness={0.3} /></Cylinder>
                        <Sphere args={[0.025, 16, 16]} position={[0, 0.06, 0]}><meshStandardMaterial color="#f0f0f0" roughness={0.3} /></Sphere>
                    </group>
                    <group position={[0, -0.35, 0]}>
                        <Cylinder args={[0.005, 0.015, 0.2]} position={[0, 0, 0]}><meshStandardMaterial color="#b8860b" metalness={0.7} roughness={0.2} /></Cylinder>
                        <Cylinder args={[0.004, 0.004, 0.15]} position={[0, -0.15, 0]}><meshStandardMaterial color="#e2e8f0" metalness={0.9} /></Cylinder>
                        <group position={[0, -0.22, 0]} rotation={[1.5, 0, 0]}>
                            <Cylinder args={[0.003, 0.003, 0.04]} position={[0, -0.02, 0.002]}><meshStandardMaterial color="#e2e8f0" metalness={0.9} /></Cylinder>
                        </group>
                    </group>
                </group>
            </group>
        </group>
    );
};

const LucasChamber = ({ muscleShortening, onHoverChange }: any) => {
    const nervePath = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.7, 0.2, 0),
            new THREE.Vector3(-0.7, 0.46, 0.3),
            new THREE.Vector3(-0.7, 0.45, 0.4),
            new THREE.Vector3(-0.90, 0.445, 0.4),
            new THREE.Vector3(-0.92, 0.3, 0.4),
        ]);
    }, []);
    // Tetanus is always Indirect stimulation (via nerve)
    const stimulationType = 'Indirect';

    return (
        <InteractiveObject label="Lucas Chamber & Muscle" onHoverChange={onHoverChange}>
            <group position={[-2, 0, 0]}>
                <group position={[0, -0.5, 0]}>
                    <Box args={[3.2, 0.2, 1.5]} position={[0, -0.1, 0]}><meshPhysicalMaterial color="#cbd5e1" roughness={0.1} transmission={0.2} thickness={0.5} /></Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, 0.7]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, -0.7]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[0.1, 1, 1.3]} position={[1.55, 0.5, 0]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[0.1, 1, 1.3]} position={[-1.55, 0.5, 0]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[3.0, 0.8, 1.3]} position={[0, 0.4, 0]}><meshPhysicalMaterial color="#a5f3fc" transmission={0.9} opacity={0.6} transparent roughness={0.1} ior={1.33} /></Box>
                </group>

                <group position={[0, 0.2, 0]}>
                    <Cylinder args={[0.05, 0.05, 0.8]} rotation={[0, 0, 1.57]} position={[-1.2, 0, 0]}><meshStandardMaterial color="#94a3b8" /></Cylinder>
                    <group position={[-1.2, 0, 0]}>
                        <group scale={[1 - (muscleShortening * 0.15), 1 + (muscleShortening * 0.3), 1 + (muscleShortening * 0.3)]} position={[1, 0, 0]}>
                            <Sphere args={[0.3, 16, 16]} scale={[3, 1, 1]} position={[0, 0, 0]}><meshStandardMaterial color="#be123c" roughness={0.6} /></Sphere>
                            <Box args={[1.2, 0.05, 0.05]} position={[1.4, 0, 0]}><meshStandardMaterial color="#f1f5f9" /></Box>
                        </group>
                    </group>
                </group>

                <InteractiveObject label="Stimulating Electrodes Assembly" onHoverChange={onHoverChange}>
                    <group position={[-0.8, 0.73, 0.7]}>
                        <group position={[0, -0.25, 0]}>
                            <group>
                                <Box args={[0.3, 0.08, 0.2]} position={[0, 0.06, 0]}><meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} /></Box>
                                <Box args={[0.3, 0.12, 0.06]} position={[0, -0.04, -0.07]}><meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} /></Box>
                                <Box args={[0.3, 0.12, 0.06]} position={[0, -0.04, 0.07]}><meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} /></Box>
                            </group>
                            <group position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                                <Cylinder args={[0.04, 0.04, 0.1]} position={[0, 0.05, 0]}><meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} /></Cylinder>
                                <Cylinder args={[0.06, 0.06, 0.05]} position={[0, 0.12, 0]}><meshStandardMaterial color="#111111" roughness={0.7} /></Cylinder>
                            </group>
                        </group>
                        <Box args={[0.6, 0.12, 0.2]} position={[0, -0.09, 0]}><meshStandardMaterial color="#1e1e1e" roughness={0.8} /></Box>
                        {[-0.22, 0.22].map((x, i) => (
                            <group key={`post-${i}`} position={[x, 0.05, 0]}>
                                <Cylinder args={[0.03, 0.03, 0.15]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Cylinder>
                                <Cylinder args={[0.045, 0.045, 0.06]} position={[0, 0.05, 0]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Cylinder>
                            </group>
                        ))}
                        {[-0.08, 0.08].map((x, i) => (
                            <ElectrodeRod key={`unit-${i}`} position={[x, 0, 0]} rotationTarget={0.9} slideTarget={0} />
                        ))}
                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.08, 0), new THREE.Vector3(-0.25, 0.2, 0.1), new THREE.Vector3(-0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#dc2626" />
                        </Tube>
                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0.22, 0.08, 0), new THREE.Vector3(0.25, 0.2, 0.1), new THREE.Vector3(0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#1f1f1f" />
                        </Tube>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Sciatic Nerve" onHoverChange={onHoverChange}>
                    <Tube args={[nervePath, 64, 0.012, 8, false]}><meshStandardMaterial color="#fefce8" emissive="#fefce8" emissiveIntensity={0.15} roughness={0.3} /></Tube>
                </InteractiveObject>
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
                        <Box args={[0.6, 0.1, 0.4]} position={[0, -0.05, 0]}><meshStandardMaterial color={darkBrassColor} metalness={0.7} roughness={0.3} /></Box>
                        <Cylinder args={[0.08, 0.1, 2.8]} position={[0, 1.35, 0]}><meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} /></Cylinder>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Adjustment Screw (Height Control)" onHoverChange={onHoverChange}>
                    <group position={[0, 1.35, 0]}>
                        <Cylinder args={[0.06, 0.06, 0.3]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                        <Cylinder args={[0.1, 0.1, 0.15]} position={[0, 0.22, 0]}><meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.3} /></Cylinder>
                    </group>
                </InteractiveObject>
            </group>

            <group position={[-0.4, -0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, -1.11]}><meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} /></Box>
                </InteractiveObject>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, 0.11]}><meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} /></Box>
                </InteractiveObject>
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.1, 1.3]} position={[0, 0.15, -0.5]}><meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} /></Box>
                </InteractiveObject>
                <InteractiveObject label="After Load Screw" onHoverChange={onHoverChange}>
                    <AnimatedThumbScrew mode={mode} />
                </InteractiveObject>
                <InteractiveObject label="Pivot Bolt (Fulcrum Axis)" onHoverChange={onHoverChange}>
                    <group>
                        <Cylinder args={[0.04, 0.04, 1.4]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                        <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.21]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Nut (Pivot Bolt)" onHoverChange={onHoverChange}>
                    <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.21]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                </InteractiveObject>

                <group rotation={[0, 0, -angle]}>
                    <InteractiveObject label="Long Arm (Writing Lever)" onHoverChange={onHoverChange}>
                        <group rotation={[0, Math.PI, -Math.PI / 2]}>
                            <group position={[0.55, 0, 1]}>
                                <Box args={[1.125, 0.08, 0.05]} position={[0, 0, 0]}><meshStandardMaterial color={brassColor} metalness={0.6} roughness={0.4} /></Box>
                                {[-0.3, -0.05, 0.2, 0.45].map((x, i) => (
                                    <Cylinder key={i} args={[0.02, 0.02, 0.052]} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, 0]}><meshStandardMaterial color="#1a1a1a" /></Cylinder>
                                ))}
                            </group>
                        </group>
                    </InteractiveObject>
                    <InteractiveObject label="Muscle Hook (S-shaped)" onHoverChange={onHoverChange}>
                        <group position={[0, 0, -0.15]} rotation={[0, 0, 1.7]}>
                            <Cylinder args={[0.015, 0.015, 0.6]} position={[0, -0.3, 0]}><meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} /></Cylinder>
                            <Cylinder args={[0.015, 0.015, 0.15]} position={[0.05, -0.6, 0]} rotation={[0, 0, 0.8]}><meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} /></Cylinder>
                        </group>
                    </InteractiveObject>
                    <InteractiveObject label="Writing Point (Stylus)" onHoverChange={onHoverChange}>
                        <group position={[0, -1.1, -1]}>
                            <Cylinder args={[0.012, 0.005, 2.8]} rotation={[0, 0, 0]} position={[0, -0.6, 0]}><meshStandardMaterial color="#1a1a1a" /></Cylinder>
                        </group>
                    </InteractiveObject>
                </group>
            </group>
        </group>
    );
};

const Kymograph = ({ simTime, tension, onHoverChange, isRunning }: any) => {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const lastDrawState = useRef<{ x: number, y: number } | null>(null);

    const WIDTH = 1024;
    const HEIGHT = 512;

    const texture = useMemo(() => {
        const canvas = canvasRef.current;
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#101010'; // Smoked paper color
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    useEffect(() => {
        if (simTime === 0 && canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx) { ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
            lastDrawState.current = null;
            texture.needsUpdate = true;
        }
    }, [simTime, texture]);

    useFrame(() => {
        if (!isRunning || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const x = (simTime / TOTAL_DURATION_MS) * WIDTH;
        const y = (HEIGHT * 0.8) - (tension * 80);

        if (lastDrawState.current) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(lastDrawState.current.x, lastDrawState.current.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            texture.needsUpdate = true;
        }
        lastDrawState.current = { x, y };
    });

    const drumRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (drumRef.current && isRunning) {
            const angle = (simTime / TOTAL_DURATION_MS) * (Math.PI * 1.8);
            drumRef.current.rotation.y = 1.5 - angle;
        }
    });

    return (
        <InteractiveObject label="Kymograph Drum" onHoverChange={onHoverChange}>
            <group position={[-2.07, 1.7, 4.1]}>
                <group ref={drumRef} rotation={[0, 1.5, 0]}>
                    <Cylinder args={[1.2, 1.2, 3, 64]}>
                        <meshBasicMaterial attach="material-0" map={texture} />
                        <meshBasicMaterial attach="material-1" color="#101010" />
                        <meshBasicMaterial attach="material-2" color="#101010" />
                    </Cylinder>
                </group>
                <Cylinder args={[0.1, 0.1, 4.5]} position={[0, -0.25, 0]}><meshStandardMaterial color="#333" /></Cylinder>
                <Box args={[1.5, 0.5, 2]} position={[0, -2.25, 0]}><meshStandardMaterial color="#222" /></Box>
            </group>
        </InteractiveObject>
    );
};


// --- Main Component ---

export const GenesisOfTetanus: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [frequency, setFrequency] = useState(5);
    const [isRunning, setIsRunning] = useState(false);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d'); // Toggle for mobile view
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const stateRef = useRef<SimulationState>({
        time: 0,
        isRunning: false,
        data: [],
        currentTension: 0,
        stimuliEvents: []
    });

    // We use a React state for the UI updates that don't need to happen every frame,
    // but we need high frequency updates for the Oscilloscope if we want it smooth.
    // However, Oscilloscope uses recharts which is heavy. We should throttle it or use the data ref if possible.
    // But Oscilloscope component takes `data` prop. Let's update it in a loop.
    const [simState, setSimState] = useState<SimulationState>(stateRef.current);
    const animationRef = useRef<number>();

    const startExperiment = () => {
        stateRef.current = {
            time: 0,
            isRunning: true,
            data: [],
            currentTension: 0,
            stimuliEvents: []
        };
        setIsRunning(true);
        setSimState({ ...stateRef.current });
        loop();
    };

    const stopExperiment = () => {
        stateRef.current.isRunning = false;
        setIsRunning(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setSimState({ ...stateRef.current });
    };

    const loop = () => {
        if (!stateRef.current.isRunning) return;

        const dt = 16;
        stateRef.current.time += dt;

        // Stimulus generation
        const interval = 1000 / frequency;
        if (stateRef.current.stimuliEvents.length === 0) {
            stateRef.current.stimuliEvents.push(0);
        }
        const lastStimTime = stateRef.current.stimuliEvents[stateRef.current.stimuliEvents.length - 1];
        if (stateRef.current.time >= lastStimTime + interval) {
            stateRef.current.stimuliEvents.push(lastStimTime + interval);
        }

        const tension = calculateTension(stateRef.current.time, stateRef.current.stimuliEvents);
        stateRef.current.currentTension = tension;

        if (stateRef.current.time >= TOTAL_DURATION_MS) {
            stopExperiment();
            return;
        }

        // Push data
        stateRef.current.data.push({ t: stateRef.current.time, y: tension });

        animationRef.current = requestAnimationFrame(loop);
    };

    // Update UI for Oscilloscope at 30fps
    useEffect(() => {
        if (!isRunning) return;
        const interval = setInterval(() => {
            setSimState({ ...stateRef.current });
        }, 30);
        return () => clearInterval(interval);
    }, [isRunning]);


    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent">
                            Genesis of Tetanus
                        </h1>
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
                            ? 'bg-slate-900 text-teal-400 border-b-2 border-teal-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-teal-400 border-b-2 border-teal-400'
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
                                <LucasChamber muscleShortening={simState.currentTension * 0.3} onHoverChange={setHoveredLabel} />
                                <StarlingLever angle={simState.currentTension * 0.05} onHoverChange={setHoveredLabel} />
                            </group>
                            <Kymograph
                                simTime={simState.time}
                                tension={simState.currentTension}
                                isRunning={isRunning}
                                onHoverChange={setHoveredLabel}
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

                {/* Right Panel: Controls & Oscilloscope */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none h-auto z-10">
                    {/* Oscilloscope View - Hidden on mobile if 3D is active */}
                    <div className={`flex-1 p-6 min-h-0 flex flex-col ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Oscilloscope View</h3>
                        <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative">
                            {/* Custom Oscilloscope Style Graph */}
                            <div className="w-full h-full bg-black border-4 border-slate-700 relative rounded-lg shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] overflow-hidden">
                                {/* Screen Grid Overlay Effect */}
                                <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,255,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(18,255,0,0.03)_1px,transparent_1px)] bg-[size:20px_20px] z-10"></div>

                                {/* CRT Info */}
                                <div className="absolute top-2 right-4 text-green-400 font-mono text-xs z-20 font-bold opacity-80">
                                    FREQ: {frequency}Hz
                                </div>
                                <div className="absolute top-6 right-4 text-green-400 font-mono text-xs z-20 font-bold opacity-80">
                                    TIME: 3s window
                                </div>

                                <svg className="w-full h-full overflow-visible z-0 relative" viewBox={`0 0 ${TOTAL_DURATION_MS} 5`} preserveAspectRatio="none">
                                    {/* Trace - Super Bright Neon Green with Double Glow */}
                                    <path
                                        d={`M 0 5 ${simState.data.map(p => `L ${p.t} ${5 - p.y}`).join(' ')}`}
                                        fill="none"
                                        stroke="#11ff11"
                                        strokeWidth="0.15"
                                        vectorEffect="non-scaling-stroke"
                                        style={{ filter: 'drop-shadow(0 0 5px rgba(50, 255, 50, 0.9)) drop-shadow(0 0 15px rgba(50, 255, 50, 0.6))' }}
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Controls Section - Always Visible */}
                    <div className="p-6 border-t border-slate-800 shrink-0 bg-slate-900 z-10">
                        {/* Frequency Control */}
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
                            <div className="flex items-center gap-3 mb-4 text-teal-300">
                                <Settings className="w-5 h-5" />
                                <h3 className="font-bold">Interrupter Settings</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-slate-300">Stimulation Frequency</label>
                                    <span className="font-mono text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-900">
                                        {frequency} Hz
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="5"
                                    max="40"
                                    step="5"
                                    value={frequency}
                                    onChange={(e) => {
                                        if (!isRunning) setFrequency(Number(e.target.value));
                                    }}
                                    disabled={isRunning}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500 disabled:opacity-50"
                                />
                                <div style={{ marginTop: '0.2rem' }}>
                                    {/* Frequencies Line */}
                                    <div className="relative w-full text-xs text-slate-500 font-mono h-4">
                                        <span className="absolute left-0">5 Hz</span>
                                        <span className="absolute left-[42%] -translate-x-1/2">20 Hz</span>
                                        <span className="absolute left-[71%] -translate-x-1/2">30 Hz</span>
                                        <span className="absolute right-0">40 Hz</span>
                                    </div>

                                    {/* Labels Line */}
                                    <div className="relative w-full text-sm font-medium h-12 mt-1 transition-colors duration-300">
                                        <button
                                            disabled={isRunning}
                                            onClick={() => setFrequency(5)}
                                            className={`absolute left-0 transition-colors leading-tight text-left disabled:cursor-not-allowed hover:text-teal-300 ${frequency <= 10 ? 'text-teal-400 font-bold' : 'text-slate-600'}`}>Treppe<br /><span className="text-[10px] font-normal text-slate-500">(5-10 Hz)</span></button>
                                        <button
                                            disabled={isRunning}
                                            onClick={() => setFrequency(15)}
                                            className={`absolute left-[28%] text-center transition-colors leading-tight disabled:cursor-not-allowed hover:text-teal-300 ${frequency > 10 && frequency <= 20 ? 'text-teal-400 font-bold' : 'text-slate-600'}`}>Clonus<br /><span className="text-[10px] font-normal text-slate-500">(15-20 Hz)</span></button>
                                        <button
                                            disabled={isRunning}
                                            onClick={() => setFrequency(30)}
                                            className={`absolute left-[65%] text-center leading-tight -translate-x-1/2 transition-colors disabled:cursor-not-allowed hover:text-teal-300 ${frequency > 20 && frequency <= 35 ? 'text-teal-400 font-bold' : 'text-slate-600'}`}>Incomplete<br />Tetanus<br /><span className="text-[10px] font-normal text-slate-500">(30 Hz)</span></button>
                                        <button
                                            disabled={isRunning}
                                            onClick={() => setFrequency(40)}
                                            className={`absolute right-0 text-right leading-tight transition-colors disabled:cursor-not-allowed hover:text-teal-300 ${frequency > 35 ? 'text-teal-400 font-bold' : 'text-slate-600'}`}>Complete<br />Tetanus<br /><span className="text-[10px] font-normal text-slate-500">(40+ Hz)</span></button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4">
                            {!isRunning && (simState.data.length > 0 || simState.time > 0) && (
                                <button
                                    onClick={() => {
                                        stateRef.current = {
                                            time: 0,
                                            isRunning: false,
                                            data: [],
                                            currentTension: 0,
                                            stimuliEvents: []
                                        };
                                        setSimState({ ...stateRef.current });
                                    }}
                                    className="flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600"
                                >
                                    <RotateCcw className="w-5 h-5" /> Reset
                                </button>
                            )}
                            <button
                                onClick={isRunning ? stopExperiment : startExperiment}
                                className={`
                                    flex-1 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all
                                    ${isRunning
                                        ? 'bg-rose-900/50 text-rose-400 border border-rose-800 hover:bg-rose-900/80'
                                        : 'bg-teal-600 text-white shadow-lg shadow-teal-900/50 hover:bg-teal-500 hover:scale-[1.02]'
                                    }
                                `}
                            >
                                {isRunning ? (
                                    <>
                                        <RotateCcw className="w-5 h-5" /> Stop
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-5 h-5 fill-current" /> Start Stimulation
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div >
    );
};
