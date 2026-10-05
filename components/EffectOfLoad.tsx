import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Text, Environment, useTexture, RoundedBox } from '@react-three/drei';
import { ArrowLeft, Activity, Scale, CheckCircle, Eye, LineChart, Moon, Sun, RotateCcw } from 'lucide-react';
import * as THREE from 'three';

// --- Types & Constants ---
const LATENT_DURATION = 10;
const CONTRACTION_DURATION = 40;
const RELAXATION_DURATION = 50;
const TOTAL_WINDOW_MS = 130;
const MAX_LOAD_G = 110;

interface DataPoint {
    t: number;
    y: number;
}

interface SimulationState {
    time: number;
    isRunning: boolean;
    data: DataPoint[];
    currentHeight: number;
    phase: 'Rest' | 'Latent' | 'Contraction' | 'Relaxation';
}

interface ExperimentHistory {
    load: number;
    mode: 'After-Loaded' | '-Loaded';
    maxHeight: number;
    work: number;
    id: number;
    baseLine?: number;
}

// --- Helper Components ---

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

// --- Physics Logic ---

const getExtension = (load: number, mode: 'After-Loaded' | '-Loaded') => {
    if (mode === 'After-Loaded') return 0;
    // -loaded: Extension proportional to load
    // Max load 100g -> max extension ~1.5cm visually
    return (load / MAX_LOAD_G) * 1.5;
};

const calculatePeakHeight = (load: number, mode: 'After-Loaded' | '-Loaded') => {
    // Base heights
    const h0_after = 5;
    const h0_ = 5.5; // Slightly higher base due to initial optimal stretch benefit? or similar.

    // Decay factors
    if (mode === 'After-Loaded') {
        // Linear decay
        return h0_after * Math.max(0, 1 - (load / 120)); // Fails around 120g
    } else {
        // -loaded
        // Starling's Law: Initial stretch INCREASES force up to a point, then decreases.
        // However, the load itself OPPOSEs shortening.
        // Net result in classic graph: -loaded height is often HIGHER than after-loaded for moderate loads because the muscle is longer.
        // But baseline is lower.
        // Let's model it:
        // Strength boost from extension: + (load * 0.02)
        // Drag from load: - (load * ... )

        // Simple approx to match image: 
        // -load curve is ABOVE After-load curve for height (amplitude).

        const extensionBenefit = (load / 100) * 1.5; // Benefit from stretch
        const loadDrag = (load / 120);

        // Resulting height relative to the NEW baseline (so pure contraction amount)
        // The image shows the Peak Absolute Position is higher? Or just the amplitude?
        // Inset shows: -load curve starts lower, but goes HIGHER than after-load peak?
        // No, Inset shows: -load starts lower (if baseline drop shown? Actually Inset diagram is ambiguous on baseline).
        // WAIT. The Inset shows them starting at SAME baseline. That might be "Isometric" vs "Isotonic"? 
        // PROMPT IMAGE 2 (Step 52): 
        // Inset: "-loaded condition" is the TALLER curve. "After-loaded" is SHORTER.
        // Both start at same line? No, drawn on same axis.
        // BUT Graph (B) -loaded shows dropping baseline.

        // Conclusion:
        // 1. Amplitude (Length of line): -load > After-load (due to Starling).
        // 2. Baseline: -load drops.

        const baseH = h0_ + extensionBenefit * 2;
        const finalH = baseH * Math.max(0, 1 - (load / 140)); // Stronger, fails later
        return finalH;
    }
};

const calculateInstantaneousHeight = (t: number, peakHeight: number, extension: number) => {
    // Baseline is -extension.
    const baseline = -extension;

    if (t < 0) return baseline;
    if (t < LATENT_DURATION) return baseline;

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

    return baseline + contraction;
};


// --- 3D Components (Ported & Adapted) ---

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

    // Target Y position (along the screw axis)
    // "Moved away" (-Loaded) -> Higher Y
    // "Inside" (After-Loaded) -> Lower Y (touching)
    // Note: Original position was Y=0 relative to the rotated group.
    // If -Loaded, move OUT (positive Y local).
    const targetY = mode === '-Loaded' ? 0.20 : 0.05;

    useFrame((state, delta) => {
        if (groupRef.current) {
            // Smooth lerp
            groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, targetY, delta * 5);
        }
    });

    return (
        <group position={[0.1, 0, -0.15]} rotation={[0, 0, Math.PI / 4]}>
            <group ref={groupRef}>
                {/* Threaded shaft - longer */}
                <Cylinder args={[0.025, 0.025, 0.25]} position={[0, 0.125, 0]}>
                    <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.15} />
                </Cylinder>
                {/* Knurled head */}
                <Cylinder args={[0.05, 0.05, 0.06]} position={[0, 0.28, 0]}>
                    <meshStandardMaterial color={metalColor} metalness={0.85} roughness={0.25} />
                </Cylinder>
                {/* Slot on top of screw head */}
                <Box args={[0.07, 0.01, 0.015]} position={[0, 0.311, 0]}>
                    <meshStandardMaterial color="#1a1a1a" />
                </Box>
            </group>
        </group>
    );
};

const StarlingLever = ({ angle, load, onHoverChange, mode }: { angle: number, load: number, onHoverChange?: (l: string | null) => void, mode: 'After-Loaded' | '-Loaded' }) => {
    const brassColor = "#b8860b"; // Dark goldenrod - brass color
    const darkBrassColor = "#8b6914";
    const metalColor = "#c0c0c0"; // Silver metal

    return (
        <group position={[-0.5, 1.5, 0.1]}>
            {/* Stand and Adjustment Screw Group - move together by changing this position */}
            <group position={[0.3, -1.9, 0]}>
                {/* Upright Stand with base */}
                <InteractiveObject label="Stand (Upright Post)" onHoverChange={onHoverChange}>
                    <group position={[0, -1.5, 0]}>
                        {/* Base plate */}
                        <Box args={[0.6, 0.1, 0.4]} position={[0, -0.05, 0]}>
                            <meshStandardMaterial color={darkBrassColor} metalness={0.7} roughness={0.3} />
                        </Box>
                        {/* Upright post */}
                        <Cylinder args={[0.08, 0.1, 2.8]} position={[0, 1.35, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                        </Cylinder>
                    </group>
                </InteractiveObject>

                {/* Threaded adjustment screw at top */}
                <InteractiveObject label="Adjustment Screw (Height Control)" onHoverChange={onHoverChange}>
                    <group position={[0, 1.35, 0]}>
                        {/* Screw threads */}
                        <Cylinder args={[0.06, 0.06, 0.3]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        {/* Knurled knob */}
                        <Cylinder args={[0.1, 0.1, 0.15]} position={[0, 0.22, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.3} />
                        </Cylinder>
                    </group>
                </InteractiveObject>
            </group>

            {/* Square U-shaped Fulcrum/Support Bracket (brass) - Fixed Orientation */}
            <group position={[-0.4, -0.8, 0]} rotation={[0, 0, -Math.PI / 2]}>
                {/* STATIONARY FRAME PARTS */}

                {/* Left vertical arm of U */}
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, -1.11]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                {/* Right vertical arm of U - matches left limb */}
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.3, 0.08]} position={[0, 0.05, 0.11]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                {/* Horizontal top piece connecting the two arms */}
                <InteractiveObject label="Frame Support" onHoverChange={onHoverChange}>
                    <Box args={[0.12, 0.1, 1.3]} position={[0, 0.15, -0.5]}>
                        <meshStandardMaterial color={brassColor} metalness={0.7} roughness={0.3} />
                    </Box>
                </InteractiveObject>
                {/* Thumb Screw on top of connecting bar for lever arm attachment */}
                <InteractiveObject label="After Load Screw" onHoverChange={onHoverChange}>
                    <AnimatedThumbScrew mode={mode} />
                </InteractiveObject>
                {/* Pivot bolt going through both arms */}
                <InteractiveObject label="Pivot Bolt (Fulcrum Axis)" onHoverChange={onHoverChange}>
                    <group>
                        <Cylinder args={[0.04, 0.04, 1.4]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        {/* Bolt head (front) */}
                        <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.21]}>
                            <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                        </Cylinder>
                    </group>
                </InteractiveObject>
                {/* Bolt nut (back) */}
                <InteractiveObject label="Nut (Pivot Bolt)" onHoverChange={onHoverChange}>
                    <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.21]}>
                        <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} />
                    </Cylinder>
                </InteractiveObject>

                {/* ROTATING LEVER GROUP */}
                {/* This group rotates relative to the fixed frame */}
                <group rotation={[0, 0, -angle]}>

                    {/* Main lever arm - Long Arm */}
                    <InteractiveObject label="Long Arm (Writing Lever)" onHoverChange={onHoverChange}>
                        <group rotation={[0, Math.PI, -Math.PI / 2]}>
                            {/* Position this group to move both arm and holes together */}
                            <group position={[0.55, 0, 1]}>
                                <Box args={[1.125, 0.08, 0.05]} position={[0, 0, 0]}>
                                    <meshStandardMaterial color={brassColor} metalness={0.6} roughness={0.4} />
                                </Box>
                                {/* Holes along the lever arm - positions relative to arm center */}
                                {[-0.3, -0.05, 0.2, 0.45].map((x, i) => (
                                    <Cylinder key={i} args={[0.02, 0.02, 0.052]} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, 0]}>
                                        <meshStandardMaterial color="#1a1a1a" />
                                    </Cylinder>
                                ))}

                                {/* Attach Weights to the furthest hole (0.45) */}
                                {load > 0 && (
                                    <InteractiveObject label={`Weights (${load}g)`} onHoverChange={onHoverChange}>
                                        <group position={[0.45, 0, 0]}> {/* At hole position */}
                                            {/* Wire/Hook for weights - rotates with lever naturally as it's child */}
                                            <group rotation={[0, Math.PI / 2, 0]} position={[0, 0, 0]}>
                                                <Cylinder args={[0.005, 0.005, 0.3]} position={[0, -0.15, 0]}>
                                                    <meshStandardMaterial color="#333" />
                                                </Cylinder>
                                                {/* Weight Stack */}
                                                <group position={[0, -0.3, 0]}>
                                                    {Array.from({ length: Math.ceil(load / 10) }).map((_, i) => (
                                                        <Cylinder key={i} args={[0.12, 0.12, 0.04, 16]} position={[0, -i * 0.045, 0]}>
                                                            <meshStandardMaterial color="#475569" metalness={0.8} />
                                                        </Cylinder>
                                                    ))}
                                                    <group position={[0, -(Math.ceil(load / 10) * 0.045) - 0.02, 0]}>
                                                        <Sphere args={[0.02]}><meshStandardMaterial color="#333" /></Sphere>
                                                    </group>
                                                </group>
                                            </group>
                                        </group>
                                    </InteractiveObject>
                                )}
                            </group>
                        </group>
                    </InteractiveObject>

                    {/* Muscle Hook - curved wire going down */}
                    <InteractiveObject label="Muscle Hook (S-shaped)" onHoverChange={onHoverChange}>
                        <group position={[0, 0, -0.15]} rotation={[0, 0, 1.7]}> {/* Adjust rotation here [x, y, z] */}
                            {/* Vertical part of hook */}
                            <Cylinder args={[0.015, 0.015, 0.6]} position={[0, -0.3, 0]}>
                                <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                            </Cylinder>
                            {/* Curved hook end */}
                            <Cylinder args={[0.015, 0.015, 0.15]} position={[0.05, -0.6, 0]} rotation={[0, 0, 0.8]}>
                                <meshStandardMaterial color={metalColor} metalness={0.8} roughness={0.2} />
                            </Cylinder>
                        </group>
                    </InteractiveObject>

                    {/* Writing stylus/pointer tip */}
                    <InteractiveObject label="Writing Point (Stylus)" onHoverChange={onHoverChange}>
                        <group position={[0, -1.1, -1]}>
                            {/* Thin writing arm extends downward (vertical) */}
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
    resetKey,
    drumMode,
    drumOffset,
    historyLength
}: {
    simTime: number,
    tension: number,
    isRunning: boolean,
    onHoverChange?: (l: string | null) => void,
    resetKey: number,
    drumMode: 'Moving' | 'Stationary',
    drumOffset: number,
    historyLength: number
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const lastDrawState = useRef<{ x: number, y: number } | null>(null);
    const strokePoints = useRef<{ x: number, y: number }[]>([]);

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

    // Draw horizontal line when drum rotates (offset changes)
    const prevOffsetRef = useRef(drumOffset);
    useEffect(() => {
        if (prevOffsetRef.current !== drumOffset) {
            // Only draw if we have at least 2 history entries (need a previous bar to connect from)
            if (historyLength > 1) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    const prevX = 50 + (prevOffsetRef.current * 30);
                    const currX = 50 + (drumOffset * 30);
                    const y = (512 * 0.5) - (tension * 40);

                    // Stop slightly short of the next bar position to create a gap
                    const gap = 5;

                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(prevX, y);
                    ctx.lineTo(currX - gap, y);
                    ctx.stroke();
                    texture.needsUpdate = true;
                }
            }
            prevOffsetRef.current = drumOffset;
        }
    }, [drumOffset, tension, texture, historyLength]);

    useFrame(() => {
        if (!isRunning) {
            if (strokePoints.current.length >= 2) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                    const pts = strokePoints.current;
                    const p1 = pts[pts.length - 2];
                    const p2 = pts[pts.length - 1];
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    ctx.beginPath();
                    ctx.moveTo(midX, midY);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                    texture.needsUpdate = true;
                }
            }
            strokePoints.current = [];
            lastDrawState.current = null;
            return;
        }

        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const MAX_ROTATION = Math.PI / 1.5; // Broader trace (120 degrees)
        const PIXELS = 1024 * (MAX_ROTATION / (2 * Math.PI));

        let x = 50;

        if (drumMode === 'Moving') {
            // Normal moving trace, but adding drumOffset to starting position to support manual shifts
            const offsetPx = drumOffset * 30;
            x = 50 + offsetPx + (simTime / TOTAL_WINDOW_MS) * PIXELS;
        } else {
            // Stationary: Fixed X position on the canvas, updated by drumOffset
            x = 50 + (drumOffset * 30);
        }

        // Reduced scaling from 80 to 40 to accommodate larger peaks in Effect of Load (up to ~6cm)
        const y = (512 * 0.5) - (tension * 40);

        strokePoints.current.push({ x, y });
        const pts = strokePoints.current;

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (pts.length >= 3) {
            const p0 = pts[pts.length - 3];
            const p1 = pts[pts.length - 2];
            const p2 = pts[pts.length - 1];

            const mid1X = (p0.x + p1.x) / 2;
            const mid1Y = (p0.y + p1.y) / 2;
            const mid2X = (p1.x + p2.x) / 2;
            const mid2Y = (p1.y + p2.y) / 2;

            ctx.beginPath();
            ctx.moveTo(mid1X, mid1Y);
            ctx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
            ctx.stroke();

            if (pts.length === 3) {
                // Draw connecting segment from the very first point to the first midpoint
                ctx.beginPath();
                ctx.moveTo(p0.x, p0.y);
                ctx.lineTo(mid1X, mid1Y);
                ctx.stroke();
            }

            texture.needsUpdate = true;
        } else if (pts.length === 2 && drumMode === 'Stationary') {
            // In stationary mode, we just draw lines straight up and down, so midpoints don't matter as much,
            // but we can just draw the segment directly if it's perfectly vertical, or wait. 
            // Better to just wait for 3 points for all curves.

            // Wait, for stationary mode, if length is small, maybe just draw it.
            // When moving very fast, drawing 3 points is fine.
        }

        lastDrawState.current = { x, y };
    });

    const drumRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (drumRef.current) {
            // Base rotation
            let baseRotation = 1.5;

            // Adjust for offset (Manual/Auto rotation applied between runs)
            // If x increased on texture, we must rotate drum so that new spot is under stylus.
            // x = 50 + offset*30.
            // 1024px = 2PI. 
            // Rotation change = (offset * 30 / 1024) * 2PI
            const offsetRotation = (drumOffset * 30 / 1024) * (2 * Math.PI);

            // "Rotating drum forward" means decreasing Y rotation usually?
            // If X moves right on texture, texture must move LEFT relative to camera to keep spot?
            // Wait, if X increases, we are drawing further 'around' the drum.
            // To bring that new spot under the stylus (which is fixed), we must rotate the drum.
            // Let's just sync it: 

            if (drumMode === 'Moving') {
                const angle = (simTime / TOTAL_WINDOW_MS) * (Math.PI / 1.5);
                drumRef.current.rotation.y = baseRotation - offsetRotation - angle;
            } else {
                // Stationary or just holding position
                drumRef.current.rotation.y = baseRotation - offsetRotation;
            }
        }
    });

    return (
        <InteractiveObject label="Kymograph" onHoverChange={onHoverChange}>
            <group position={[-2.09, 0.7, 4.195]}>
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

export const EffectOfLoad: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [load, setLoad] = useState(10);
    const [mode, setMode] = useState<'After-Loaded' | '-Loaded'>('After-Loaded');
    const [drumMode, setDrumMode] = useState<'Moving' | 'Stationary'>('Moving');
    const [drumOffset, setDrumOffset] = useState(0);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [history, setHistory] = useState<ExperimentHistory[]>([]);
    const [simReseter, setSimReseter] = useState(0);
    const [clearKey, setClearKey] = useState(0);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d'); // Toggle for mobile view
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const [simState, setSimState] = useState<SimulationState>({
        time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest'
    });

    const animationFrameRef = useRef<number>();
    const idleAnimationFrameRef = useRef<number>();

    const handleStimulate = () => {
        if (simState.isRunning) return;
        // Stop idle loop if running (though effect handles it, explicit safety is good)
        if (idleAnimationFrameRef.current) cancelAnimationFrame(idleAnimationFrameRef.current);

        const extension = getExtension(load, mode);
        const peak = calculatePeakHeight(load, mode);
        const work = load * peak;

        setSimState({ time: 0, isRunning: true, data: [], currentHeight: -extension, phase: 'Latent' });
        setHistory(prev => [...prev, { load, mode, maxHeight: peak, work, id: Date.now(), baseLine: -extension }]);
        // Do NOT auto-clear or increment resetter for Kymograph anymore
        setSimReseter(prev => prev + 1); // We can still trace this for other effects if needed, but not for clearing
    };

    const handleClear = () => {
        setHistory([]);
        setClearKey(prev => prev + 1);
        setSimState({ time: 0, isRunning: false, data: [], currentHeight: 0, phase: 'Rest' });
        setDrumOffset(0);
    };

    // Optimized Idle Animation Loop
    useEffect(() => {
        if (simState.isRunning) return;

        const loop = () => {
            setSimState(prev => {
                const extension = getExtension(load, mode);  // Capture latest from closure? 
                // Wait, closures might be stale if effect doesn't re-run.
                // But effect depends on [load, mode]. So it restarts on change.
                // WE also need it to run if it wasn't finished yet.
                // Ideally, we just check bounds.

                const targetHeight = -extension;
                const diff = targetHeight - prev.currentHeight;

                if (Math.abs(diff) < 0.005) {
                    // Close enough, stop loop (by not requesting next frame? No, we need to cancel outside or return same state)
                    // If we return same state, re-render might not happen, but loop continues?
                    // Better: If close, snap and don't request frame? 
                    // We can't cancel the frame from inside the state setter easily.
                    return { ...prev, currentHeight: targetHeight };
                }

                const dt = 0.016; // Approx 60fps fixed delta for simplicity or use real time
                const speed = 5;
                const move = diff * Math.min(1, speed * dt);
                return { ...prev, currentHeight: prev.currentHeight + move };
            });

            // We need to decide whether to continue looping.
            // Using a predictable condition outside setter is hard without Ref.
            // Let's just run it 'a bit' or always? 
            // Always running loop in background is OK for this page.
            idleAnimationFrameRef.current = requestAnimationFrame(loop);
        };

        // Delay lever animation only when going TO After-Loaded (Screw pushing lever)
        // When going TO -Loaded, drop immediately (Gravity)
        const delay = mode === 'After-Loaded' ? 400 : 0;

        const timerId = setTimeout(() => {
            idleAnimationFrameRef.current = requestAnimationFrame(loop);
        }, delay);

        return () => {
            clearTimeout(timerId);
            if (idleAnimationFrameRef.current) cancelAnimationFrame(idleAnimationFrameRef.current);
        }
    }, [load, mode, simState.isRunning]);
    // This will start a loop whenever load/mode changes or simulation stops.
    // Takes advantage of the fact that we WANT to animate to the new target.
    // It keeps running even when settled, which is a bit wasteful (setting state to same value), 
    // but React bails out on same-value updates usually.
    // To be cleaner, we can check a Ref or use a specialized hook, but this is sufficient.


    useEffect(() => {
        if (!simState.isRunning) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }
        let lastTime = Date.now();
        let simTime = simState.time;
        const extension = getExtension(load, mode);
        const peak = calculatePeakHeight(load, mode);

        const loop = () => {
            const now = Date.now();
            const dt = now - lastTime;
            lastTime = now;
            simTime += dt * 0.2;

            if (simTime > TOTAL_WINDOW_MS) {
                const restingHeight = -extension;
                setSimState(prev => ({ ...prev, isRunning: false, time: TOTAL_WINDOW_MS, currentHeight: restingHeight, phase: 'Rest' }));
                return;
            }

            const h = calculateInstantaneousHeight(simTime, peak, extension);
            let phase: SimulationState['phase'] = 'Rest';
            if (simTime < LATENT_DURATION) phase = 'Latent';
            else if (simTime < LATENT_DURATION + CONTRACTION_DURATION) phase = 'Contraction';
            else phase = 'Relaxation';

            setSimState(prev => ({ ...prev, time: simTime, currentHeight: h, phase, data: [...prev.data, { t: simTime, y: h }] }));
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
    }, [simState.isRunning, load, mode]);

    // Auto-advance drum in Stationary + Automatic mode
    useEffect(() => {
        if (!simState.isRunning && simState.time >= TOTAL_WINDOW_MS &&
            drumMode === 'Stationary') {
            // Experiment finished naturally (didn't just start or reset)
            // We can use history length to check if we already added a run
            // Or simpler: check if we are in 'Rest' phase after having been running.
            // Relying on simState transition: when it goes to Rest at TOTAL_WINDOW_MS
            setDrumOffset(prev => prev + 1);
        }
    }, [simState.isRunning, simState.time, drumMode]);
    // 2D History Canvas - stores completed curves for smooth redrawing
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const completedCurvesRef = useRef<{ data: DataPoint[], color: string }[]>([]);

    // Clear completed curves when history is cleared
    useEffect(() => {
        if (history.length === 0) {
            completedCurvesRef.current = [];
        }
    }, [history.length]);

    // Save completed curve when simulation ends
    useEffect(() => {
        if (!simState.isRunning && simState.data.length > 2) {
            const currentHistoryEntry = history[history.length - 1];
            const strokeColor = currentHistoryEntry && currentHistoryEntry.mode === '-Loaded' ? '#f472b6' : '#4ade80';
            completedCurvesRef.current.push({ data: [...simState.data], color: strokeColor });
        }
    }, [simState.isRunning]);

    // Helper to draw a smooth curve on canvas
    const drawSmoothCurve = (ctx: CanvasRenderingContext2D, data: DataPoint[], color: string, w: number, h: number) => {
        if (data.length < 2) return;
        const mapX = (t: number) => (t / TOTAL_WINDOW_MS) * w;
        const mapY = (y: number) => {
            const zeroY = h - 50;
            const scale = 30;
            return zeroY - (y * scale);
        };

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(mapX(data[0].t), mapY(data[0].y));

        // Draw smooth curve using quadratic bezier through midpoints
        for (let i = 1; i < data.length - 1; i++) {
            const xc = (mapX(data[i].t) + mapX(data[i + 1].t)) / 2;
            const yc = (mapY(data[i].y) + mapY(data[i + 1].y)) / 2;
            ctx.quadraticCurveTo(mapX(data[i].t), mapY(data[i].y), xc, yc);
        }
        // Draw the last segment
        const lastPt = data[data.length - 1];
        ctx.lineTo(mapX(lastPt.t), mapY(lastPt.y));
        ctx.stroke();
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width; const h = canvas.height;

        // Clear canvas
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);

        // Draw baseline
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.beginPath();
        const zeroY = h - 50;
        ctx.moveTo(0, zeroY); ctx.lineTo(w, zeroY); ctx.stroke();

        // Redraw all completed curves smoothly
        for (const curve of completedCurvesRef.current) {
            drawSmoothCurve(ctx, curve.data, curve.color, w, h);
        }

        // Draw current active curve smoothly
        if (simState.data.length > 2) {
            const currentHistoryEntry = history[history.length - 1];
            const strokeColor = currentHistoryEntry && currentHistoryEntry.mode === '-Loaded' ? '#f472b6' : '#4ade80';
            drawSmoothCurve(ctx, simState.data, strokeColor, w, h);
        }
    }, [simState.data, clearKey]); // Re-run when data changes or clearKey triggers a clear

    // Rest of component...
    // ...
    // Note: I will inject the Clear button next to Stimulate button.

    // ... Kymograph calls ...
    // <Kymograph ... resetKey={clearKey} ... />



    // Stationary Renderer
    const renderStationary = () => {
        const maxH = 8; // cm visual scale
        const heightToPx = (h: number) => (h / maxH) * 200;

        return (
            <div className="flex items-end h-full gap-4 overflow-x-auto pb-8 px-4 relative bg-black w-full min-w-full">
                {/* Zero Line */}
                <div className="absolute left-0 right-0 bottom-12 h-px bg-slate-600 border-t border-dashed border-slate-500 z-0"></div>

                {history.map((h, i) => {
                    const heightPixels = heightToPx(h.maxHeight);

                    return (
                        <div key={i} className="flex flex-col items-center group relative z-10 shrink-0">
                            {/* Straight Line/Bar */}
                            <div
                                className={`w-1 rounded-t ${h.mode === 'After-Loaded' ? 'bg-green-500' : 'bg-pink-500'}`}
                                style={{ height: `${heightPixels}px` }}
                            />

                            <span className="text-[10px] text-slate-500 mt-2 font-mono block">{h.load}g</span>

                            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-slate-800 text-xs p-2 rounded z-20 whitespace-nowrap border border-slate-600 w-32 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                                <strong>{h.mode}</strong><br />
                                Load: {h.load}g<br />
                                Height: {h.maxHeight.toFixed(2)}cm<br />
                                Ext: {Math.abs(h.baseLine || 0).toFixed(2)}cm
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const optimalLoad = useMemo(() => {
        const afterLoads = history.filter(h => h.mode === 'After-Loaded');
        if (afterLoads.length === 0) return 0;
        return afterLoads.reduce((max, curr) => curr.work > max.work ? curr : max, afterLoads[0]).load;
    }, [history]);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">Effect of Load</h1>

                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="flex gap-4 text-right">
                        <div><div className="text-xs text-slate-400">Current Load</div><div className="text-xl font-mono font-bold">{load}g</div></div>
                        <div className="h-8 w-px bg-slate-700"></div>
                        <div><div className="text-xs text-slate-400">Mode</div><div className={`text-sm font-bold ${mode === 'After-Loaded' ? 'text-green-400' : 'text-pink-400'}`}>{mode}</div></div>
                    </div>
                    <button
                        onClick={() => setSceneBgColor(prev => prev === '#CBD5E1' ? '#2F3E46' : '#CBD5E1')}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700 transition-colors flex items-center justify-center h-10 w-10 shrink-0"
                        title="Toggle Canvas Background"
                    >
                        {sceneBgColor === '#CBD5E1' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </button>
                </div>
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
                        <pointLight position={[-5, 5, -5]} intensity={1} color="#38bdf8" />

                        <group position={[0, -1, 0]}>
                            <group rotation={[0, Math.PI / 2, 0]}>
                                <LucasChamber muscleShortening={simState.currentHeight} onHoverChange={setHoveredLabel} />
                                <StarlingLever angle={simState.currentHeight * 0.08} load={load} onHoverChange={setHoveredLabel} mode={mode} />
                            </group>
                            <Kymograph simTime={simState.time} tension={simState.currentHeight} isRunning={simState.isRunning} onHoverChange={setHoveredLabel} resetKey={clearKey} drumMode={drumMode} drumOffset={drumOffset} historyLength={history.length} />
                        </group>
                        <OrbitControls makeDefault target={[-0.74, -0.60, 3.39]} minPolarAngle={0} />
                    </Canvas>
                    {hoveredLabel && <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-white font-bold text-sm pointer-events-none">{hoveredLabel}</div>}
                </div>

                {/* Right Panel: Graph (Top) & Controls (Bottom) */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none">
                    {/* Graph/History View - Top (Hidden in Mobile 3D View) */}
                    <div className={`flex-1 p-4 bg-black relative border-b border-slate-800 min-h-[250px] ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        {drumMode === 'Moving' ? (
                            <canvas ref={canvasRef} width={420} height={250} className="w-full h-full rounded border border-slate-800" />
                        ) : (
                            renderStationary()
                        )}
                    </div>

                    {/* Controls - Bottom (Always Visible) */}
                    <div className="p-6 space-y-6 overflow-y-auto z-10 bg-slate-900 border-t lg:border-t-0 border-slate-800">
                        <div className="flex gap-2 p-1 bg-slate-800 rounded-lg">
                            <button
                                onClick={() => { if (drumMode !== 'Moving') { setDrumMode('Moving'); handleClear(); } }}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${drumMode === 'Moving' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                Curve Mode
                            </button>
                            <button
                                onClick={() => { if (drumMode !== 'Stationary') { setDrumMode('Stationary'); handleClear(); } }}
                                className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${drumMode === 'Stationary' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                Line Mode
                            </button>
                        </div>

                        <div className="flex gap-2 p-1 bg-slate-800 rounded-lg">
                            <button onClick={() => setMode('After-Loaded')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${mode === 'After-Loaded' ? 'bg-green-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>After-Loaded</button>
                            <button onClick={() => setMode('-Loaded')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${mode === '-Loaded' ? 'bg-pink-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>-Loaded</button>
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center"><label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Scale className="w-4 h-4" /> Load (grams)</label><span className="text-xs text-slate-500">Max: 100g</span></div>
                            <div className="flex items-center gap-4">
                                <button onClick={() => setLoad(l => Math.max(0, l - 10))} className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50" disabled={load <= 0}>-</button>
                                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${(load / 110) * 100}%` }}></div></div>
                                <button onClick={() => setLoad(l => Math.min(100, l + 10))} className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-50" disabled={load >= 100}>+</button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={handleStimulate} disabled={simState.isRunning} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all">
                                {simState.isRunning ? 'In Progress...' : <><Activity className="w-5 h-5" /> Stimulate</>}
                            </button>

                            <button onClick={handleClear} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all">
                                <RotateCcw className="w-4 h-4" /> Reset
                            </button>
                        </div>


                    </div>
                </div>
            </main>
        </div>
    );
};
