import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Text, Environment, Tube, Torus, Ring } from '@react-three/drei';
import { ArrowLeft, Eye, LineChart, Zap, Pause, Play, Download, RotateCcw, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';
import { Controls } from './Controls';

// --- Simulation Constants ---
const MAX_AMPLITUDE = 60; // Max contraction height in graph units
const THRESHOLD_DISTANCE_MAKE = 12; // cm (Closer = Stronger)
const THRESHOLD_DISTANCE_BREAK = 14; // cm (Break is stronger, so threshold is at larger distance)
const MAXIMAL_DISTANCE = 5; // cm (Distance where max contraction is reached)

interface DataPoint {
    distance: number;
    make: number;
    break: number;
}

// --- Helper Physics ---

// Calculate contraction amplitude based on distance (inverse to strength)
// Break is always stronger than Make due to self-induction
const calculateAmplitude = (distance: number, type: 'Make' | 'Break') => {
    // Strength is roughly inversely proportional to distance
    // Let's model it with a sigmoid or linear ramp between threshold and maximal

    const threshold = type === 'Break' ? THRESHOLD_DISTANCE_BREAK : THRESHOLD_DISTANCE_MAKE;
    const maximal = MAXIMAL_DISTANCE;

    if (distance > threshold) return 0; // Subthreshold
    if (distance <= maximal) return MAX_AMPLITUDE; // Supramaximal

    // Between threshold and maximal: Linear increase
    // Distance goes from threshold -> maximal
    const range = threshold - maximal;
    let progress = (threshold - distance) / range;

    // Clamp progress to be safe
    progress = Math.max(0, Math.min(1, progress));

    // Add some curve for realism (sigmoid-like)
    // easeInOutQuad
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    // Fix: Ensure minimal visibility at threshold (instead of starting at 0)
    // Map progress 0 -> 1 to MIN_RESPONSE -> MAX_AMPLITUDE
    const MIN_RESPONSE = 5;
    return MIN_RESPONSE + (MAX_AMPLITUDE - MIN_RESPONSE) * eased;
};


// --- 3D Components (Reused from SimpleMuscleTwitch/EffectOfLoad) ---

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
                <Cylinder args={[0.025, 0.025, 0.25]} position={[0, 0.125, 0]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.15} /></Cylinder>
                <Cylinder args={[0.05, 0.05, 0.06]} position={[0, 0.28, 0]}><meshStandardMaterial color={metalColor} metalness={0.85} roughness={0.25} /></Cylinder>
                <Box args={[0.07, 0.01, 0.015]} position={[0, 0.311, 0]}><meshStandardMaterial color="#1a1a1a" /></Box>
            </group>
        </group>
    );
};

// Du Bois-Reymond Induction Coil with animated secondary coil
const DuBoisReymondCoil = ({ distance, onHoverChange }: { distance: number, onHoverChange?: (l: string | null) => void }) => {
    const secondaryCoilRef = useRef<THREE.Group>(null);

    // Colors matching reference image
    const mahoganyWood = "#4A2C2A"; // Dark reddish-brown mahogany
    const lightMahogany = "#6B4423"; // Lighter mahogany for secondary rings
    const brassColor = "#C9A227"; // Rich golden brass
    const darkBrass = "#8B6914";
    const greenCoil = "#3D5C3D"; // Dark green insulated wire
    const creamBracket = "#E8DCC8"; // Cream/ivory support bracket
    const blackShell = "#1C1C1C"; // Black secondary shell
    const rulerYellow = "#E8D58C"; // Aged yellow ruler

    // Map distance (0-15 cm) to position offset
    // At distance 0, secondary overlaps primary (negative offset); at 15cm, they are far apart
    const targetOffset = -0.8 + (distance / 15) * 2.8;

    useFrame((_, delta) => {
        if (secondaryCoilRef.current) {
            secondaryCoilRef.current.position.x = THREE.MathUtils.lerp(
                secondaryCoilRef.current.position.x,
                targetOffset,
                delta * 5
            );
        }
    });

    return (
        <InteractiveObject label="Du Bois-Reymond Induction Coil" onHoverChange={onHoverChange}>
            <group position={[2.2, -0.6, 0.8]} rotation={[0, -Math.PI / 5, 0]} scale={0.9}>

                {/* === WOODEN BASE === */}
                <Box args={[5, 0.1, 0.85]} position={[0, 0, 0]}>
                    <meshStandardMaterial color={mahoganyWood} roughness={0.6} />
                </Box>
                {/* Base bottom trim */}
                <Box args={[5.1, 0.06, 0.9]} position={[0, -0.08, 0]}>
                    <meshStandardMaterial color="#2D1B1B" roughness={0.7} />
                </Box>

                {/* === RULER/SCALE === */}
                <Box args={[3.8, 0.015, 0.1]} position={[0.4, 0.058, 0.32]}>
                    <meshStandardMaterial color={rulerYellow} roughness={0.4} />
                </Box>
                {/* Ruler markings */}
                {[...Array(40)].map((_, i) => (
                    <Box key={i} args={[0.008, 0.02, i % 5 === 0 ? 0.06 : 0.03]} position={[-1.5 + i * 0.095, 0.07, 0.32]}>
                        <meshStandardMaterial color="#222" />
                    </Box>
                ))}

                {/* === RACK RAILS (dark toothed tracks) === */}
                <Box args={[4.0, 0.035, 0.05]} position={[0.3, 0.07, 0.2]}>
                    <meshStandardMaterial color="#1a1a1a" metalness={0.7} roughness={0.4} />
                </Box>
                <Box args={[4.0, 0.035, 0.05]} position={[0.3, 0.07, -0.2]}>
                    <meshStandardMaterial color="#1a1a1a" metalness={0.7} roughness={0.4} />
                </Box>

                {/* === PRIMARY COIL ASSEMBLY (Left, fixed) === */}
                <group position={[-1.9, 0.25, 0]}>
                    {/* Cream/White vertical support bracket */}
                    <Box args={[0.2, 0.45, 0.6]} position={[0, 0.05, 0]}>
                        <meshStandardMaterial color={creamBracket} roughness={0.35} />
                    </Box>

                    {/* Wooden ring/holder on bracket */}
                    <Cylinder args={[0.13, 0.13, 0.22]} rotation={[0, 0, Math.PI / 2]} position={[0.02, 0.1, 0]}>
                        <meshStandardMaterial color={lightMahogany} roughness={0.5} />
                    </Cylinder>

                    {/* Copper wire wound primary coil */}
                    <group position={[0.6, 0.1, 0]}>
                        {/* Inner core/bobbin */}
                        <Cylinder args={[0.06, 0.06, 1.0]} rotation={[0, 0, Math.PI / 2]}>
                            <meshStandardMaterial color="#2C2C2C" roughness={0.5} />
                        </Cylinder>
                        {/* Copper wire windings - thin wire wound tightly */}
                        {Array.from({ length: 100 }).map((_, i) => (
                            <Torus
                                key={`coil-${i}`}
                                args={[0.065, 0.009, 8, 24]}
                                rotation={[0, Math.PI / 2, 0]}
                                position={[-0.48 + i * 0.0096, 0, 0]}
                            >
                                <meshStandardMaterial
                                    color="#B87333"
                                    metalness={0.85}
                                    roughness={0.2}
                                />
                            </Torus>
                        ))}
                    </group>
                </group>

                {/* === BINDING POSTS (Left end) === */}
                <group position={[-2.15, 0.06, 0]}>
                    {/* Tall binding posts with caps */}
                    {[-0.18, 0.18].map((z, i) => (
                        <group key={`tall-${i}`} position={[0.08, 0, z]}>
                            <Cylinder args={[0.032, 0.032, 0.22]} position={[0, 0.11, 0]}>
                                <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                            </Cylinder>
                            <Cylinder args={[0.048, 0.048, 0.035]} position={[0, 0.23, 0]}>
                                <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                            </Cylinder>
                            <Cylinder args={[0.035, 0.02, 0.025]} position={[0, 0.26, 0]}>
                                <meshStandardMaterial color={darkBrass} metalness={0.75} roughness={0.25} />
                            </Cylinder>
                        </group>
                    ))}
                    {/* Shorter posts with ball tops */}
                    {[-0.12, 0.12].map((z, i) => (
                        <group key={`short-${i}`} position={[-0.08, 0, z]}>
                            <Cylinder args={[0.022, 0.022, 0.12]} position={[0, 0.06, 0]}>
                                <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                            </Cylinder>
                            <Sphere args={[0.032, 12, 12]} position={[0, 0.13, 0]}>
                                <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                            </Sphere>
                        </group>
                    ))}
                </group>

                {/* === SECONDARY COIL ASSEMBLY (Right, sliding) === */}
                <group ref={secondaryCoilRef} position={[0.3, 0.32, 0]}>
                    {/* Left end ring - thick Torus with actual hole */}
                    <Torus args={[0.23, 0.07, 16, 32]} rotation={[0, Math.PI / 2, 0]} position={[-0.48, 0, 0]}>
                        <meshStandardMaterial color={lightMahogany} roughness={0.5} />
                    </Torus>

                    {/* Right end ring - thick Torus with actual hole */}
                    <Torus args={[0.23, 0.07, 16, 32]} rotation={[0, Math.PI / 2, 0]} position={[0.48, 0, 0]}>
                        <meshStandardMaterial color={lightMahogany} roughness={0.5} />
                    </Torus>

                    {/* Black outer cylindrical shell - open ended for see-through */}
                    <Cylinder args={[0.27, 0.27, 0.9, 32, 1, true]} rotation={[0, 0, Math.PI / 2]}>
                        <meshStandardMaterial color={blackShell} roughness={0.25} metalness={0.15} side={2} />
                    </Cylinder>

                    {/* Brass binding post on top of right torus */}
                    <group position={[0.48, 0.30, 0]}>
                        <Cylinder args={[0.025, 0.025, 0.08]}>
                            <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                        </Cylinder>
                        <Cylinder args={[0.038, 0.038, 0.025]} position={[0, 0.05, 0]}>
                            <meshStandardMaterial color={brassColor} metalness={0.85} roughness={0.15} />
                        </Cylinder>
                    </group>

                    {/* Wooden support/sled underneath - positioned below the hollow */}
                    <Box args={[0.15, 0.08, 0.5]} position={[0, -0.35, 0]}>
                        <meshStandardMaterial color={mahoganyWood} roughness={0.6} />
                    </Box>
                    <Box args={[0.12, 0.04, 0.45]} position={[0, -0.4, 0]}>
                        <meshStandardMaterial color="#2D1B1B" roughness={0.7} />
                    </Box>
                </group>

                {/* Distance indicator */}
                <Text
                    position={[0.5, 0.9, 0]}
                    fontSize={0.13}
                    color="#22d3ee"
                    anchorX="center"
                    anchorY="middle"
                    fontWeight="bold"
                >
                    {`${distance} cm`}
                </Text>
            </group>
        </InteractiveObject>
    );
};

const StarlingLever = ({ angle, onHoverChange }: { angle: number, onHoverChange?: (l: string | null) => void }) => {
    const brassColor = "#b8860b";
    const darkBrassColor = "#8b6914";
    const metalColor = "#c0c0c0";
    const mode = '-Loaded';

    return (
        <group position={[-0.5, 1.5, 0.1]}>
            {/* Stand */}
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

            {/* Lever Assembly */}
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

                {/* Rotating Lever Arm */}
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

const Kymograph = ({
    data,
    muscleShortening,
    tracePhase,
    distance,
    onHoverChange,
}: {
    data: DataPoint[],
    muscleShortening: number,
    tracePhase: 'Idle' | 'Make' | 'Break',
    distance: number,
    onHoverChange?: (l: string | null) => void,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const lastYRef = useRef<number>(400); // Baseline Y
    const texture = useMemo(() => {
        const canvas = canvasRef.current;
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#111'; ctx.fillRect(0, 0, 1024, 512);
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    const drumRef = useRef<THREE.Group>(null);

    // Initial Draw & History Update
    useEffect(() => {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            // Clear & Draw History
            ctx.fillStyle = '#111';
            ctx.fillRect(0, 0, 1024, 512);

            const startX = 50;
            const spacing = 40;
            const baselineY = 400;
            const scaleY = 3;

            data.forEach((point, i) => {
                const x = startX + i * spacing;

                // Make Trace
                const hMake = point.make * scaleY;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, baselineY); ctx.lineTo(x, baselineY - hMake); ctx.stroke();

                // Break Trace 
                const hBreak = point.break * scaleY;
                ctx.beginPath(); ctx.moveTo(x + 10, baselineY); ctx.lineTo(x + 10, baselineY - hBreak); ctx.stroke();
            });
            texture.needsUpdate = true;
        }

        // Reset lastY
        lastYRef.current = 400;

    }, [data, texture]);

    // Animated Drawing
    useEffect(() => {
        if (tracePhase === 'Idle') return;

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const startX = 50;
        const spacing = 40;
        const baselineY = 400;
        const scaleY = 3;

        // Current index is after the last history item
        const currentIndex = data.length;
        const xBase = startX + currentIndex * spacing;
        const x = tracePhase === 'Make' ? xBase : xBase + 10;

        const currentY = baselineY - (muscleShortening * scaleY);

        // Draw segment
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, lastYRef.current);
        ctx.lineTo(x, currentY);
        ctx.stroke();

        lastYRef.current = currentY;
        texture.needsUpdate = true;

    }, [muscleShortening, tracePhase, data.length, texture]);

    // Rotate Drum to show active writing area
    useFrame(() => {
        if (drumRef.current) {
            // Target X based on current data length (or active writing index)
            const activeIndex = tracePhase === 'Idle' ? Math.max(0, data.length - 1) : data.length;
            const currentX = 50 + activeIndex * 40;
            const targetAngle = 1.5 - (currentX / 1024) * Math.PI * 2;
            drumRef.current.rotation.y = THREE.MathUtils.lerp(drumRef.current.rotation.y, targetAngle, 0.1);
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

const LucasChamber = ({ muscleShortening, onHoverChange }: { muscleShortening: number, onHoverChange?: (l: string | null) => void }) => {
    // Generate Nerve Path
    const nervePath = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.7, 0.2, 0),    // Connects to muscle insertion
            new THREE.Vector3(-0.7, 0.46, 0.3),   // Arching up and forward
            new THREE.Vector3(-0.7, 0.45, 0.4), // Resting on Electrodes
            new THREE.Vector3(-0.90, 0.445, 0.4),   // Draping down
            new THREE.Vector3(-0.92, 0.3, 0.4),   // Trailing end in bath
        ]);
    }, []);

    return (
        <InteractiveObject label="Lucas Chamber & Muscle" onHoverChange={onHoverChange}>
            <group position={[-2, 0, 0]}>
                {/* Trough/Chamber Structure */}
                <group position={[0, -0.5, 0]}>
                    <Box args={[3.2, 0.2, 1.5]} position={[0, -0.1, 0]}><meshPhysicalMaterial color="#cbd5e1" roughness={0.1} transmission={0.2} thickness={0.5} /></Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, 0.7]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[3.2, 1, 0.1]} position={[0, 0.5, -0.7]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[0.1, 1, 1.3]} position={[1.55, 0.5, 0]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[0.1, 1, 1.3]} position={[-1.55, 0.5, 0]}><meshPhysicalMaterial color="#ffffff" transmission={0.95} opacity={1} roughness={0} thickness={0.1} clearcoat={1} /></Box>
                    <Box args={[3.0, 0.8, 1.3]} position={[0, 0.4, 0]}><meshPhysicalMaterial color="#a5f3fc" transmission={0.9} opacity={0.6} transparent roughness={0.1} ior={1.33} /></Box>
                </group>

                {/* Muscle */}
                <group position={[0, 0.2, 0]}>
                    <Cylinder args={[0.05, 0.05, 0.8]} rotation={[0, 0, 1.57]} position={[-1.2, 0, 0]}><meshStandardMaterial color="#94a3b8" /></Cylinder>
                    <group position={[-1.2, 0, 0]}>
                        <group scale={[1 - (muscleShortening * 0.15), 1 + (muscleShortening * 0.3), 1 + (muscleShortening * 0.3)]} position={[1, 0, 0]}>
                            <Sphere args={[0.3, 16, 16]} scale={[3, 1, 1]} position={[0, 0, 0]}><meshStandardMaterial color="#be123c" roughness={0.6} /></Sphere>
                            <Box args={[1.2, 0.05, 0.05]} position={[1.4, 0, 0]}><meshStandardMaterial color="#f1f5f9" /></Box>
                        </group>
                    </group>
                </group>

                {/* Electrode Assembly */}
                <InteractiveObject label="Stimulating Electrodes Assembly" onHoverChange={onHoverChange}>
                    <group position={[-0.8, 0.73, 0.7]} rotation={[0, 0, 0]}>
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
                            <ElectrodeRod key={`unit-${i}`} position={[x, 0, 0]} rotationTarget={0.52} slideTarget={0} />
                        ))}

                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-0.22, 0.08, 0), new THREE.Vector3(-0.25, 0.2, 0.1), new THREE.Vector3(-0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#dc2626" />
                        </Tube>
                        <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0.22, 0.08, 0), new THREE.Vector3(0.25, 0.2, 0.1), new THREE.Vector3(0.35, 0.2, 0.3)]), 20, 0.008, 8, false]}>
                            <meshStandardMaterial color="#1f1f1f" />
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

// --- Custom Graph Component for Stationary Drum ---

const StationaryDrumGraph = ({ data }: { data: DataPoint[] }) => {
    // Canvas size
    const width = 600;
    const height = 300;
    const padding = { top: 40, right: 30, bottom: 60, left: 60 };

    // Render
    // Render
    return (
        <div className="w-full h-full bg-slate-950 rounded-xl overflow-hidden shadow-inner relative select-none border border-slate-800">


            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
                {/* Background Grid - Darker, Greenish */}
                <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#064e3b" strokeWidth="1" opacity="0.5" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="#020617" /> {/* Very dark slate/black */}
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Axis Labels */}
                <text x={width / 2} y={height - 5} fill="#94a3b8" textAnchor="middle" fontSize="16" fontFamily="monospace">
                    Distance Between Coils (cm)
                </text>
                <text x={20} y={height / 2} fill="#94a3b8" textAnchor="middle" transform={`rotate(-90, 20, ${height / 2})`} fontSize="16" fontFamily="monospace">
                    Amplitude
                </text>

                {/* Legend */}
                <g transform={`translate(${width - 150}, ${padding.top})`}>
                    <rect x="0" y="0" width="10" height="10" fill="#facc15" />
                    <text x="15" y="9" fill="#94a3b8" fontSize="16" fontFamily="monospace">Make (M)</text>
                    <rect x="0" y="20" width="10" height="10" fill="#f87171" />
                    <text x="15" y="29" fill="#94a3b8" fontSize="16" fontFamily="monospace">Break (B)</text>
                </g>

                {/* Spikes */}
                <g transform={`translate(${padding.left + 20}, ${padding.top})`}>
                    {/* Baseline */}
                    <line x1="-20" y1={height - padding.bottom - padding.top} x2={width - padding.left - padding.right} y2={height - padding.bottom - padding.top} stroke="#059669" strokeWidth="2" />

                    {data.map((point, index) => {
                        const spacing = 70; // Increased spacing between measurements
                        const x = index * spacing;
                        const baselineY = height - padding.bottom - padding.top;
                        const gapBetweenLines = 20; // Increased gap between M and B lines

                        const scaleY = 3;
                        const hMake = point.make * scaleY;
                        const hBreak = point.break * scaleY;

                        return (
                            <g key={index} transform={`translate(${x}, 0)`}>
                                {/* Make Line/Spike */}
                                <line
                                    x1={0}
                                    y1={baselineY}
                                    x2={0}
                                    y2={baselineY - hMake}
                                    stroke="#facc15"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                />

                                {/* Break Line/Spike */}
                                <line
                                    x1={gapBetweenLines}
                                    y1={baselineY}
                                    x2={gapBetweenLines}
                                    y2={baselineY - hBreak}
                                    stroke="#f87171"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                />

                                {/* Label (Distance) */}
                                <text
                                    x={gapBetweenLines / 2}
                                    y={baselineY + 20}
                                    fill="#e2e8f0"
                                    fontSize="20"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    fontFamily="monospace"
                                >
                                    {point.distance}
                                </text>

                                <text
                                    x={0}
                                    y={baselineY + 40}
                                    fill="#facc15"
                                    fontSize="16"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    fontFamily="monospace"
                                >
                                    M
                                </text>
                                <text
                                    x={gapBetweenLines}
                                    y={baselineY + 40}
                                    fill="#f87171"
                                    fontSize="16"
                                    fontWeight="bold"
                                    textAnchor="middle"
                                    fontFamily="monospace"
                                >
                                    B
                                </text>
                            </g>
                        );
                    })}
                </g>
            </svg>
        </div>
    );
};


export const EffectOfStimulusStrength: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
    const [distance, setDistance] = useState(15); // Start far away (weak)
    const [history, setHistory] = useState<DataPoint[]>([]);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d');
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    // Animation state for 3D muscle
    const [muscleShortening, setMuscleShortening] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const animationRef = useRef<number>(0);

    const [tracePhase, setTracePhase] = useState<'Idle' | 'Make' | 'Break'>('Idle');
    const [recordingData, setRecordingData] = useState<{ make: number, break: number } | null>(null);

    const triggerAnimation = (targetAmp: number, callback?: () => void) => {
        if (targetAmp <= 0) {
            if (callback) callback();
            return;
        }

        setIsAnimating(true);
        let startTime = performance.now();
        const duration = 200; // ms for a quick twitch

        const animate = (time: number) => {
            const elapsed = time - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Simple twitch curve: 0 -> 1 -> 0
            const curve = Math.sin(progress * Math.PI);
            setMuscleShortening(curve * (targetAmp / MAX_AMPLITUDE)); // Normalize 0-1

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                setMuscleShortening(0);
                if (callback) callback();
            }
        };
        animationRef.current = requestAnimationFrame(animate);
    };

    const handleStimulate = () => {
        // Calculate responses
        const makeAmp = calculateAmplitude(distance, 'Make');
        const breakAmp = calculateAmplitude(distance, 'Break');

        // Start Cycle
        setRecordingData({ make: makeAmp, break: breakAmp });
        setTracePhase('Make');

        // 1. Trigger Make Animation
        triggerAnimation(makeAmp, () => {
            // 2. Delay between Make and Break
            setTimeout(() => {
                setTracePhase('Break');
                // 3. Trigger Break Animation
                triggerAnimation(breakAmp, () => {
                    // 4. End Cycle
                    setHistory(prev => [...prev, { distance, make: makeAmp, break: breakAmp }]);
                    setTracePhase('Idle');
                    setRecordingData(null);
                    setIsAnimating(false);
                });
            }, 300);
        });
    };



    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            {/* Header */}
            <div className="h-14 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 relative z-20 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col">
                        <h1 className="text-lg font-bold bg-gradient-to-r from-teal-400 to-cyan-400 bg-clip-text text-transparent">
                            Effect of Stimulus Strength
                        </h1>
                        <span className="text-xs text-slate-500">Recruitment of Motor Units • Make vs Break</span>
                    </div>
                </div>

                <button
                    onClick={() => setSceneBgColor(prev => prev === '#CBD5E1' ? '#2F3E46' : '#CBD5E1')}
                    className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700 transition-colors flex items-center justify-center shrink-0"
                    title="Toggle Canvas Background"
                >
                    {sceneBgColor === '#CBD5E1' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Mobile View Toggle */}
                <div className="lg:hidden flex bg-slate-800 border-b border-slate-700 shrink-0">
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
                        <span>Graph</span>
                    </button>
                </div>

                {/* 3D View (Left) */}
                <div className={`flex-1 relative bg-gradient-to-b from-slate-900 to-slate-950 ${mobileView === 'graph' ? 'hidden lg:flex' : 'flex'}`}>
                    {hoveredLabel && (
                        <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-cyan-400/30">
                            <p className="text-sm font-semibold text-cyan-300">
                                {hoveredLabel}
                            </p>
                        </div>
                    )}

                    <Canvas shadows camera={{ position: [2.95, 4.04, 8.23], fov: 35 }}>
                        <color attach="background" args={[sceneBgColor]} />
                        <Environment preset="city" />
                        <ambientLight intensity={0.6} color="#ffffff" />
                        <spotLight position={[10, 10, 5]} angle={0.3} penumbra={0.5} intensity={2} castShadow />

                        <group position={[0, -1, 0]}>
                            <group rotation={[0, Math.PI / 2, 0]}>
                                <LucasChamber muscleShortening={muscleShortening} onHoverChange={setHoveredLabel} />
                                <StarlingLever angle={muscleShortening * 0.5} onHoverChange={setHoveredLabel} />
                            </group>

                            {/* Du Bois-Reymond Induction Coil */}
                            <DuBoisReymondCoil distance={distance} onHoverChange={setHoveredLabel} />

                            {/* Kymograph positioned relative to lever */}
                            <Kymograph
                                data={history}
                                muscleShortening={muscleShortening * MAX_AMPLITUDE} // Convert normalized 0-1 back to amplitude for drawing (roughly)
                                tracePhase={tracePhase}
                                distance={distance}
                                onHoverChange={setHoveredLabel}
                            />
                        </group>

                        <OrbitControls makeDefault target={[-0.74, -0.60, 3.39]} minPolarAngle={0} />
                    </Canvas>
                </div>

                {/* Right Panel: Graph & Controls */}
                <div className="w-full lg:w-[450px] flex flex-col border-l border-slate-800 bg-slate-950 shrink-0 lg:flex-none">
                    {/* Graph Area - TOP */}
                    <div className={`flex-1 p-8 relative flex-col min-h-0 bg-slate-900 border-b border-slate-800 ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Oscilloscope View</h3>
                        <div className="flex-1 h-full border border-slate-800 rounded-xl overflow-hidden relative">
                            <div className="relative z-10 w-full h-full bg-black">
                                <StationaryDrumGraph data={history} />
                            </div>
                        </div>
                    </div>

                    {/* Controls - BOTTOM */}
                    <div className="flex-1 p-8 bg-slate-900/40 flex flex-col justify-center">
                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" /> Experiment Controls
                        </h3>

                        <div className="space-y-6">
                            {/* Distance Slider & Voltage */}
                            <div>
                                <div className="flex justify-between items-end mb-2">
                                    <label className="text-sm font-medium text-slate-300">
                                        Stimulus Strength (Coil Distance)
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Voltage</span>
                                            <span className="text-amber-400 font-mono text-base">
                                                {((15 - distance) * 0.33).toFixed(1)} V
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Distance</span>
                                            <span className="text-cyan-400 font-mono text-base bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-900/50">
                                                {distance} cm
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <input
                                    type="range"
                                    min="0"
                                    max="15"
                                    step="1"
                                    value={15 - distance}
                                    onChange={(e) => setDistance(15 - parseFloat(e.target.value))}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 mb-1"
                                />
                                <div className="flex justify-between px-1 mb-4">
                                    <span className="text-[10px] text-slate-500 font-medium">15 cm</span>
                                    <span className="text-[10px] text-slate-500 font-medium">0 cm</span>
                                </div>

                                {/* Preset Buttons */}
                                <div className="grid grid-cols-5 gap-2">
                                    {[
                                        { label: 'Sub-Threshold', val: 15, active: 'bg-slate-600 border-slate-400 text-white', inactive: 'text-slate-400 hover:bg-slate-700' },
                                        { label: 'Threshold', val: 14, active: 'bg-cyan-600 border-cyan-400 text-white', inactive: 'text-cyan-400 hover:bg-cyan-900/30 border-cyan-900/50' },
                                        { label: 'Sub-Maximal', val: 9, active: 'bg-blue-600 border-blue-400 text-white', inactive: 'text-blue-400 hover:bg-blue-900/30 border-blue-900/50' },
                                        { label: 'Maximal', val: 5, active: 'bg-emerald-600 border-emerald-400 text-white', inactive: 'text-emerald-400 hover:bg-emerald-900/30 border-emerald-900/50' },
                                        { label: 'Supra-Maximal', val: 0, active: 'bg-purple-600 border-purple-400 text-white', inactive: 'text-purple-400 hover:bg-purple-900/30 border-purple-900/50' },
                                    ].map((preset) => (
                                        <button
                                            key={preset.label}
                                            onClick={() => setDistance(preset.val)}
                                            className={`
                                                flex flex-col items-center justify-center p-2 rounded border transition-all duration-200 h-10 active:scale-95
                                                ${distance === preset.val
                                                    ? `${preset.active} shadow-lg ring-1 ring-white/20 scale-105 z-10`
                                                    : `bg-slate-800/40 border-slate-700/50 ${preset.inactive}`
                                                }
                                            `}
                                        >
                                            <span className="text-[10px] font-bold uppercase text-center leading-tight">
                                                {preset.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {/* Stimulate Button */}
                                <button
                                    onClick={handleStimulate}
                                    disabled={isAnimating}
                                    className={`
                                        flex-1 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all duration-200
                                        flex items-center justify-center gap-2
                                        ${isAnimating
                                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                            : 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black border border-yellow-500/50 shadow-yellow-500/20 hover:shadow-yellow-500/40 active:scale-[0.98]'
                                        }
                                    `}
                                >
                                    <Zap className={`w-4 h-4 ${isAnimating ? '' : 'fill-black'}`} />
                                    {isAnimating ? 'Stimulating...' : 'Stimulate (Make & Break)'}
                                </button>

                                {/* Reset Button */}
                                <button
                                    onClick={() => setHistory([])}
                                    className="px-4 py-3 rounded-xl font-bold text-sm tracking-wide shadow-lg transition-all duration-200 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 flex items-center gap-2"
                                    title="Clear Graph"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Reset
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
