import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Text, Environment, Tube, useProgress } from '@react-three/drei';
import { ArrowLeft, Eye, LineChart, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';
import { Controls } from './Controls';
import { Oscilloscope } from './Oscilloscope';

// --- Types & Constants ---
const LATENT_DURATION = 10;
const CONTRACTION_DURATION = 40;
const RELAXATION_DURATION = 50;
const TOTAL_WINDOW_MS = 200;

interface SimulationState {
    time: number;
    isRunning: boolean;
    data: { t: number; y: number }[];
    currentHeight: number;
    phase: 'Rest' | 'Latent' | 'Contraction' | 'Relaxation';
}

// --- Helper Physics ---

const calculateInstantaneousHeight = (t: number, peakHeight: number) => {
    if (t < 0) return 0;
    if (t < LATENT_DURATION) return 0;

    const activeTime = t - LATENT_DURATION;

    // Contraction adds to baseline
    let contraction = 0;

    if (activeTime < CONTRACTION_DURATION) {
        const progress = activeTime / CONTRACTION_DURATION;
        contraction = peakHeight * Math.sin(progress * (Math.PI / 2));
    } else if (activeTime < CONTRACTION_DURATION + RELAXATION_DURATION) {
        const relaxTime = activeTime - CONTRACTION_DURATION;
        const progress = relaxTime / RELAXATION_DURATION;
        contraction = peakHeight * ((1 + Math.cos(progress * Math.PI)) / 2);
    }

    return contraction;
};

// --- Scene Loading Notifier ---
const SceneReadyNotifier = ({ onReady }: { onReady: () => void }) => {
    const { progress, active } = useProgress();
    const hasNotified = useRef(false);

    useEffect(() => {
        if (progress === 100 && !active && !hasNotified.current) {
            // Small delay to ensure the first frame has rendered
            const timeout = setTimeout(() => {
                hasNotified.current = true;
                onReady();
            }, 400);
            return () => clearTimeout(timeout);
        }
    }, [progress, active, onReady]);

    return null;
};

// --- 3D Components (Ported from EffectOfLoad) ---

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
            {/* U-Bracket Support (Vertical Fork) */}
            <group position={[0, 0.15, 0]}>
                <Box args={[0.02, 0.3, 0.08]} position={[-0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Box args={[0.02, 0.3, 0.08]} position={[0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Cylinder args={[0.015, 0.015, 0.1]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.05, 0]}><meshStandardMaterial color="#c0c0c0" metalness={0.8} /></Cylinder>
            </group>

            {/* Rotating Assembly (Ball Joint + Rod) */}
            <group ref={rotGroupRef} position={[0, 0.2, 0]}>
                {/* Ball Joint */}
                <Sphere args={[0.035, 16, 16]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Sphere>

                {/* Sliding Rod Group */}
                <group ref={slideGroupRef}>
                    {/* Main Brass Rod */}
                    <Cylinder args={[0.015, 0.015, 0.9]} position={[0, 0.1, 0]}><meshStandardMaterial color="#b8860b" metalness={0.7} roughness={0.2} /></Cylinder>
                    {/* Handle */}
                    <group position={[0, 0.55, 0]}>
                        <Cylinder args={[0.025, 0.02, 0.12]} position={[0, 0, 0]}><meshStandardMaterial color="#f0f0f0" roughness={0.3} /></Cylinder>
                        <Sphere args={[0.025, 16, 16]} position={[0, 0.06, 0]}><meshStandardMaterial color="#f0f0f0" roughness={0.3} /></Sphere>
                    </group>
                    {/* Bottom Tip */}
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

const LucasChamber = ({ muscleShortening, onHoverChange, stimulationType }: { muscleShortening: number, onHoverChange?: (l: string | null) => void, stimulationType: 'Direct' | 'Indirect' }) => {
    // Generate Nerve Path
    const nervePath = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.7, 0.2, 0),    // Connects to muscle insertion
            new THREE.Vector3(-0.7, 0.46, 0.3),   // Arching up and forward
            new THREE.Vector3(-0.7, 0.45, 0.4), // Resting on Electrodes (aligned with Z=0.7 assembly)
            new THREE.Vector3(-0.90, 0.445, 0.4),   // Draping down
            new THREE.Vector3(-0.92, 0.3, 0.4),   // Trailing end in bath
        ]);
    }, []);

    return (
        <InteractiveObject label="Lucas Chamber & Muscle" onHoverChange={onHoverChange}>
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
                    <Box args={[3.0, 0.8, 1.3]} position={[0, 0.4, 0]}>
                        <meshPhysicalMaterial color="#a5f3fc" transmission={0.9} opacity={0.6} transparent roughness={0.1} ior={1.33} />
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

                {/* Highly Accurate Lucas Electrode Assembly */}
                <InteractiveObject label="Stimulating Electrodes Assembly" onHoverChange={onHoverChange}>
                    {/* Positioned on the back wall of the chamber, adjusted for new scale */}
                    <group position={[-0.8, 0.73, 0.7]} rotation={[0, 0, 0]}>

                        {/* 1. Bottom Brass Clamp (Rectangular block with screw and mounting groove) */}
                        <group position={[0, -0.25, 0]}>
                            {/* Composite Block with Groove (Parallel to X-axis) */}
                            <group>
                                {/* Top Bar */}
                                <Box args={[0.3, 0.08, 0.2]} position={[0, 0.06, 0]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} />
                                </Box>
                                {/* Back Leg */}
                                <Box args={[0.3, 0.12, 0.06]} position={[0, -0.04, -0.07]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} />
                                </Box>
                                {/* Front Leg */}
                                <Box args={[0.3, 0.12, 0.06]} position={[0, -0.04, 0.07]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} />
                                </Box>
                            </group>
                            {/* Clamp Screw on adjacent side (Front) */}
                            <group position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
                                <Cylinder args={[0.04, 0.04, 0.1]} position={[0, 0.05, 0]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.6} roughness={0.3} />
                                </Cylinder>
                                <Cylinder args={[0.06, 0.06, 0.05]} position={[0, 0.12, 0]}> {/* Black Knob */}
                                    <meshStandardMaterial color="#111111" roughness={0.7} />
                                </Cylinder>
                            </group>
                        </group>

                        {/* 2. Black Insulating Block (Ebonite Base) */}
                        <Box args={[0.6, 0.12, 0.2]} position={[0, -0.09, 0]}>
                            <meshStandardMaterial color="#1e1e1e" roughness={0.8} /> {/* Matte Black */}
                        </Box>

                        {/* 3. Binding Posts (Left and Right extremities) */}
                        {[-0.22, 0.22].map((x, i) => (
                            <group key={`post-${i}`} position={[x, 0.05, 0]}>
                                <Cylinder args={[0.03, 0.03, 0.15]} position={[0, 0, 0]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} />
                                </Cylinder>
                                {/* Knurled Nut */}
                                <Cylinder args={[0.045, 0.045, 0.06]} position={[0, 0.05, 0]}>
                                    <meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} />
                                </Cylinder>
                            </group>
                        ))}

                        {/* 4. Electrode Units (Left and Right) */}
                        {/* 4. Electrode Units (Left and Right) */}
                        {[-0.08, 0.08].map((x, i) => (
                            <ElectrodeRod
                                key={`unit-${i}`}
                                position={[x, 0, 0]}
                                rotationTarget={stimulationType === 'Direct' ? 0.9 : 0.52}
                                slideTarget={stimulationType === 'Direct' ? -0.25 : 0}
                            />
                        ))}

                        {/* Wires */}
                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.08, 0), new THREE.Vector3(-0.25, 0.2, 0.1), new THREE.Vector3(-0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#dc2626" /> {/* Red */}
                        </Tube>
                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0.22, 0.08, 0), new THREE.Vector3(0.25, 0.2, 0.1), new THREE.Vector3(0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#1f1f1f" /> {/* Black */}
                        </Tube>

                    </group>
                </InteractiveObject>

                {/* Sciatic Nerve */}
                <InteractiveObject label="Sciatic Nerve" onHoverChange={onHoverChange}>
                    <Tube args={[nervePath, 64, 0.012, 8, false]}>
                        <meshStandardMaterial color="#fefce8" emissive="#fefce8" emissiveIntensity={0.15} roughness={0.3} />
                    </Tube>
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

    // In Simple Twitch we treat it as -Loaded for visual clarity
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

        const MAX_ROTATION = Math.PI / 4;
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
            const angle = (simTime / TOTAL_WINDOW_MS) * (Math.PI / 4);
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

// --- Main Component ---

export const SimpleMuscleTwitch: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [voltage, setVoltage] = useState(3.5);
    const [stimulationType, setStimulationType] = useState<'Indirect' | 'Direct'>('Indirect');
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d');
    const [sceneReady, setSceneReady] = useState(false);
    const [fadeOut, setFadeOut] = useState(false);
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const handleSceneReady = React.useCallback(() => {
        setFadeOut(true);
        setTimeout(() => setSceneReady(true), 600);
    }, []);

    const [simState, setSimState] = useState<SimulationState>({
        time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest'
    });

    const animationFrameRef = useRef<number>();

    const calculateParameters = (v: number) => {
        // Physiological Parameters based on Stimulation Type
        let threshold = 0;
        let maximal = 0;

        if (stimulationType === 'Indirect') {
            // Indirect (nerve): Lower threshold, lower maximal voltage
            threshold = 0.3; // Range 0.2 - 0.5V
            maximal = 4.0;   // Range 3.0 - 5.0V
        } else {
            // Direct (muscle): Higher threshold, higher maximal
            threshold = 1.5; // Range 1.0 - 2.0V
            maximal = 8.0;
        }

        // Calculate Peak Height (0 to 1.5cm scale)
        let peakHeight = 0;
        if (v < threshold) {
            peakHeight = 0;
        } else if (v >= maximal) {
            peakHeight = 1.5;
        } else {
            // Linear recruitment between threshold and maximal
            const ratio = (v - threshold) / (maximal - threshold);
            peakHeight = 1.5 * ratio;
        }

        return peakHeight;
    };

    const handleStimulate = () => {
        if (simState.isRunning) return;
        setSimState({ time: 0, isRunning: true, data: [], currentHeight: 0, phase: 'Latent' });
        setResetKey(prev => prev + 1);
    };

    const handleReset = () => {
        setSimState({ time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest' });
        setResetKey(prev => prev + 1);
    };

    useEffect(() => {
        if (!simState.isRunning) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }

        let lastTime = Date.now();
        let simTime = simState.time;
        const peak = calculateParameters(voltage);

        const loop = () => {
            const now = Date.now();
            const dt = now - lastTime;
            lastTime = now;
            simTime += dt * 0.2; // Speed factor

            if (simTime > TOTAL_WINDOW_MS) {
                setSimState(prev => ({ ...prev, isRunning: false, time: TOTAL_WINDOW_MS, currentHeight: 0, phase: 'Rest' }));
                return;
            }

            const h = calculateInstantaneousHeight(simTime, peak);
            let phase: SimulationState['phase'] = 'Rest';
            if (simTime < LATENT_DURATION) phase = 'Latent';
            else if (simTime < LATENT_DURATION + CONTRACTION_DURATION) phase = 'Contraction';
            else phase = 'Relaxation';

            setSimState(prev => ({
                ...prev,
                time: simTime,
                currentHeight: h,
                phase,
                data: [...prev.data, { t: simTime, y: h, voltage }]
            }));
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
    }, [simState.isRunning, voltage, stimulationType]);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Simple Muscle Twitch</h1>
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
                {/* Mobile View Toggle - Only visible on small screens */}
                <div className="lg:hidden flex bg-slate-800 border-b border-slate-700">
                    <button
                        onClick={() => setMobileView('3d')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === '3d'
                            ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-emerald-400 border-b-2 border-emerald-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        <span>Graph View</span>
                    </button>
                </div>

                {/* 3D View - Hidden on mobile when graph is selected */}
                <div className={`flex-1 relative bg-black ${mobileView === 'graph' ? 'hidden lg:flex' : 'flex'}`}>
                    <Canvas shadows camera={{ position: [2.95, 4.04, 8.23], fov: 35 }}>
                        <color attach="background" args={[sceneBgColor]} />
                        <Environment preset="city" />
                        <ambientLight intensity={0.6} color="#ffffff" />
                        <spotLight position={[10, 10, 5]} angle={0.3} penumbra={0.5} intensity={2} castShadow />
                        <SceneReadyNotifier onReady={handleSceneReady} />

                        <group position={[0, -1, 0]}>
                            <group rotation={[0, Math.PI / 2, 0]}>
                                <LucasChamber muscleShortening={simState.currentHeight} onHoverChange={setHoveredLabel} stimulationType={stimulationType} />
                                <StarlingLever angle={simState.currentHeight * 0.15} onHoverChange={setHoveredLabel} />
                            </group>
                            {/* Kymograph positioned relative to lever */}
                            <Kymograph
                                simTime={simState.time}
                                tension={simState.currentHeight}
                                isRunning={simState.isRunning}
                                onHoverChange={setHoveredLabel}
                                resetKey={resetKey}
                            />
                        </group>

                        {(() => {
                            const orbitTarget: [number, number, number] = [-0.74, -0.60, 3.39];
                            return (
                                <OrbitControls makeDefault target={orbitTarget} minPolarAngle={0} />
                            );
                        })()}
                    </Canvas>

                    {/* 3D Loading Overlay */}
                    {!sceneReady && (
                        <div
                            className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
                        >
                            {/* Animated pulse ring */}
                            <div className="relative w-20 h-20 mb-6">
                                <div className="absolute inset-0 rounded-full border-2 border-emerald-500/30 animate-ping" />
                                <div className="absolute inset-2 rounded-full border-2 border-emerald-400/50 animate-ping" style={{ animationDelay: '0.3s' }} />
                                <div className="absolute inset-4 rounded-full border-2 border-emerald-300/70 animate-ping" style={{ animationDelay: '0.6s' }} />
                                {/* Center dot */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-4 h-4 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
                                </div>
                            </div>
                            <p className="text-emerald-400 text-sm font-semibold tracking-widest uppercase animate-pulse">
                                Loading 3D Scene
                            </p>
                            <p className="text-slate-500 text-xs mt-2">
                                Preparing the experiment apparatus…
                            </p>
                        </div>
                    )}

                    {/* Hover Label Overlay */}
                    {hoveredLabel && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 text-white px-3 py-1.5 rounded-full text-sm border border-slate-700 backdrop-blur-sm pointer-events-none animate-in fade-in duration-200">
                            {hoveredLabel}
                        </div>
                    )}

                </div>

                {/* Controls & Graph Panel */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none">
                    {/* Oscilloscope View - Top */}
                    <div className={`flex-1 p-6 min-h-0 flex flex-col border-b border-slate-800 ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Oscilloscope View</h3>
                        <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative">
                            <Oscilloscope
                                data={simState.data.map(d => ({ time: d.t, force: d.y * 4, voltage: voltage }))}
                                currentVoltage={voltage}
                            />
                        </div>
                    </div>

                    {/* Controls - Bottom */}
                    <div className="p-6 bg-slate-900 z-10">

                        {/* Stimulation Mode Toggle */}
                        <div className="mb-6 bg-slate-800 p-1 rounded-lg flex">
                            <button
                                onClick={() => setStimulationType('Indirect')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${stimulationType === 'Indirect' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Indirect (Nerve)
                            </button>
                            <button
                                onClick={() => setStimulationType('Direct')}
                                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${stimulationType === 'Direct' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                Direct (Muscle)
                            </button>
                        </div>

                        <Controls
                            voltage={voltage}
                            setVoltage={setVoltage}
                            onStimulate={handleStimulate}
                            onReset={handleReset}
                            isStimulating={simState.isRunning}
                            thresholdValue={stimulationType === 'Indirect' ? 0.3 : 1.5}
                            maximalValue={stimulationType === 'Indirect' ? 4.0 : 8.0}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};
