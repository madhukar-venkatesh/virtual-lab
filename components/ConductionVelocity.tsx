import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Text, Environment, Tube } from '@react-three/drei';
import { ArrowLeft, Eye, LineChart, Zap, RotateCcw, Activity, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';

// --- Types & Constants ---
const TOTAL_WINDOW_MS = 300; // Wider window to show both curves fully

// M-curve: Close stimulation → shorter latent period
const M_LATENT_DURATION = 15;
const M_CONTRACTION_DURATION = 50;
const M_RELAXATION_DURATION = 70;
const M_PEAK = 1.4;

// V-curve: Far stimulation → longer latent period
const V_LATENT_DURATION = 35;
const V_CONTRACTION_DURATION = 55;
const V_RELAXATION_DURATION = 75;
const V_PEAK = 1.4;

interface SimulationState {
    time: number;
    isRunning: boolean;
    mData: { t: number; y: number }[];
    vData: { t: number; y: number }[];
    currentMHeight: number;
    currentVHeight: number;
}

// --- Helper Physics ---
const calculateCurveHeight = (
    t: number,
    peakHeight: number,
    latentDuration: number,
    contractionDuration: number,
    relaxationDuration: number
) => {
    if (t < 0) return 0;
    if (t < latentDuration) return 0;

    const activeTime = t - latentDuration;

    if (activeTime < contractionDuration) {
        const progress = activeTime / contractionDuration;
        return peakHeight * Math.sin(progress * (Math.PI / 2));
    } else if (activeTime < contractionDuration + relaxationDuration) {
        const relaxTime = activeTime - contractionDuration;
        const progress = relaxTime / relaxationDuration;
        return peakHeight * ((1 + Math.cos(progress * Math.PI)) / 2);
    }

    return 0;
};

// --- Custom Conduction Velocity Graph Component ---
const ConductionVelocityGraph: React.FC<{
    mData: { t: number; y: number }[];
    vData: { t: number; y: number }[];
    isRunning: boolean;
    simTime: number;
}> = ({ mData, vData, isRunning, simTime }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;

        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);

        // Grid overlay (subtle)
        ctx.strokeStyle = 'rgba(18, 255, 0, 0.04)';
        ctx.lineWidth = 0.5;
        const gridSize = 20;
        for (let x = 0; x < W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }

        // Graph area
        const padLeft = 50;
        const padRight = 30;
        const padTop = 40;
        const padBottom = 60;
        const graphW = W - padLeft - padRight;
        const graphH = H - padTop - padBottom;

        // Baseline Y position (bottom ~75% of graph area — curves go UP)
        const baselineY = padTop + graphH * 0.78;

        // Scale helpers
        const tToX = (t: number) => padLeft + (t / TOTAL_WINDOW_MS) * graphW;
        const yToScreen = (y: number) => baselineY - (y / 1.6) * (graphH * 0.7);

        // --- Draw Baseline ---
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, baselineY);
        ctx.lineTo(W - padRight, baselineY);
        ctx.stroke();

        // --- Draw Stimulus Artifact ---
        if (mData.length > 0 || vData.length > 0) {
            const stimX = tToX(0);
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(stimX, baselineY - 8);
            ctx.lineTo(stimX, baselineY + 8);
            ctx.stroke();

            // "PS" label above the tick
            ctx.fillStyle = '#94a3b8';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('PS', stimX, baselineY - 14);
        }

        // --- Draw Curves ---
        const drawCurve = (
            data: { t: number; y: number }[],
            color: string,
            glowColor: string
        ) => {
            if (data.length < 2) return;

            // Glow effect
            ctx.save();
            ctx.strokeStyle = glowColor;
            ctx.lineWidth = 5;
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = tToX(d.t);
                const y = yToScreen(d.y);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.restore();

            // Main line
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = tToX(d.t);
                const y = yToScreen(d.y);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        // V-curve first (background, lighter blue)
        drawCurve(vData, '#60a5fa', '#3b82f6');
        // M-curve on top (darker blue)
        drawCurve(mData, '#1d4ed8', '#1e40af');

        // --- Draw LP Arrows ---
        const drawLPArrow = (
            lpDuration: number,
            yOffset: number,
            label: string,
            color: string
        ) => {
            if (mData.length < 2 && vData.length < 2) return;

            const startX = tToX(0);
            const endX = tToX(lpDuration);
            const arrowY = baselineY + yOffset;

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = 1;

            // Left arrowhead
            ctx.beginPath();
            ctx.moveTo(startX + 5, arrowY - 3);
            ctx.lineTo(startX, arrowY);
            ctx.lineTo(startX + 5, arrowY + 3);
            ctx.stroke();

            // Line
            ctx.beginPath();
            ctx.moveTo(startX, arrowY);
            ctx.lineTo(endX, arrowY);
            ctx.stroke();

            // Right arrowhead
            ctx.beginPath();
            ctx.moveTo(endX - 5, arrowY - 3);
            ctx.lineTo(endX, arrowY);
            ctx.lineTo(endX - 5, arrowY + 3);
            ctx.stroke();

            // Vertical tick at latent period end
            ctx.beginPath();
            ctx.moveTo(endX, baselineY - 8);
            ctx.lineTo(endX, baselineY + 8);
            ctx.stroke();

            // Label — to the right of the arrow
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(label, endX + 4, arrowY + 4);
        };

        // Show LP arrows — well spaced vertically
        if (mData.length > 5) {
            drawLPArrow(M_LATENT_DURATION, 18, 'LP₁', '#93c5fd');
        }
        if (vData.length > 5) {
            drawLPArrow(V_LATENT_DURATION, 34, 'LP₂', '#60a5fa');
        }


        // --- Draw Curve Labels ---
        if (mData.length > 20) {
            // Find the peak of M-curve for label placement
            const mPeakIdx = mData.reduce((maxI, d, i, arr) => d.y > arr[maxI].y ? i : maxI, 0);
            const mPeakPoint = mData[mPeakIdx];
            if (mPeakPoint) {
                const labelX = tToX(mPeakPoint.t) - 30;
                const labelY = yToScreen(mPeakPoint.y) - 15;
                ctx.fillStyle = '#93c5fd';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('M-curve', labelX, labelY);
                // Arrow pointing to curve
                ctx.beginPath();
                ctx.moveTo(labelX + 25, labelY + 3);
                ctx.lineTo(tToX(mPeakPoint.t) - 5, yToScreen(mPeakPoint.y) - 3);
                ctx.strokeStyle = '#93c5fd';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        if (vData.length > 20) {
            // Find the peak of V-curve for label placement
            const vPeakIdx = vData.reduce((maxI, d, i, arr) => d.y > arr[maxI].y ? i : maxI, 0);
            const vPeakPoint = vData[vPeakIdx];
            if (vPeakPoint) {
                const labelX = tToX(vPeakPoint.t) + 30;
                const labelY = yToScreen(vPeakPoint.y) - 15;
                ctx.fillStyle = '#60a5fa';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('V-curve', labelX, labelY);
                // Arrow pointing to curve
                ctx.beginPath();
                ctx.moveTo(labelX - 25, labelY + 3);
                ctx.lineTo(tToX(vPeakPoint.t) + 5, yToScreen(vPeakPoint.y) - 3);
                ctx.strokeStyle = '#60a5fa';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        // --- Top-right info ---
        ctx.fillStyle = '#4ade80';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('CONDUCTION VELOCITY', W - padRight, padTop - 10);

        // Legend
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.fillText('PS = Point of stimulus', W - padRight, padTop + 5);
        ctx.fillText('LP = Latent period', W - padRight, padTop + 18);

        if (isRunning) {
            ctx.fillStyle = '#ef4444';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`t = ${simTime.toFixed(0)} ms`, W - padRight, padTop + 35);
        }
    }, [mData, vData, isRunning, simTime]);

    useEffect(() => {
        draw();
    }, [draw]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const resizeObs = new ResizeObserver(() => draw());
        resizeObs.observe(container);
        return () => resizeObs.disconnect();
    }, [draw]);

    return (
        <div ref={containerRef} className="w-full h-full">
            <canvas ref={canvasRef} className="w-full h-full" />
        </div>
    );
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

const ElectrodeRod = ({ position, rotationTarget, slideTarget }: { position: [number, number, number], rotationTarget: number, slideTarget: number }) => {
    const rotGroupRef = useRef<THREE.Group>(null);
    const slideGroupRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (rotGroupRef.current) rotGroupRef.current.rotation.x = THREE.MathUtils.lerp(rotGroupRef.current.rotation.x, rotationTarget, delta * 5);
        if (slideGroupRef.current) slideGroupRef.current.position.y = THREE.MathUtils.lerp(slideGroupRef.current.position.y, slideTarget, delta * 5);
    });

    return (
        <group position={position}>
            {/* U-Bracket Support */}
            <group position={[0, 0.15, 0]}>
                <Box args={[0.02, 0.3, 0.08]} position={[-0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Box args={[0.02, 0.3, 0.08]} position={[0.035, 0, 0]}><meshStandardMaterial color="#654321" metalness={0.7} roughness={0.4} /></Box>
                <Cylinder args={[0.015, 0.015, 0.1]} rotation={[0, 0, Math.PI / 2]} position={[0, 0.05, 0]}><meshStandardMaterial color="#c0c0c0" metalness={0.8} /></Cylinder>
            </group>
            {/* Rotating Assembly */}
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

const LucasChamber = ({ muscleShortening, onHoverChange }: { muscleShortening: number, onHoverChange?: (l: string | null) => void }) => {
    const nervePath = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.7, 0.2, 0),
            new THREE.Vector3(-0.7, 0.46, 0.3),
            new THREE.Vector3(-0.7, 0.45, 0.4),
            new THREE.Vector3(-0.90, 0.445, 0.4),
            new THREE.Vector3(-0.92, 0.3, 0.4),
        ]);
    }, []);

    return (
        <InteractiveObject label="Lucas Chamber & Muscle" onHoverChange={onHoverChange}>
            <group position={[-2, 0, 0]}>
                {/* Trough/Chamber */}
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

                {/* Electrode Assembly */}
                <InteractiveObject label="Stimulating Electrodes" onHoverChange={onHoverChange}>
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
                        <Box args={[0.6, 0.12, 0.2]} position={[0, -0.09, 0]}>
                            <meshStandardMaterial color="#1e1e1e" roughness={0.8} />
                        </Box>
                        {[-0.22, 0.22].map((x, i) => (
                            <group key={`post-${i}`} position={[x, 0.05, 0]}>
                                <Cylinder args={[0.03, 0.03, 0.15]} position={[0, 0, 0]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Cylinder>
                                <Cylinder args={[0.045, 0.045, 0.06]} position={[0, 0.05, 0]}><meshStandardMaterial color="#b8860b" metalness={0.8} roughness={0.2} /></Cylinder>
                            </group>
                        ))}
                        {[-0.08, 0.08].map((x, i) => (
                            <ElectrodeRod
                                key={`unit-${i}`}
                                position={[x, 0, 0]}
                                rotationTarget={0.52}
                                slideTarget={0}
                            />
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
                <InteractiveObject label="Adjustment Screw" onHoverChange={onHoverChange}>
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
                <InteractiveObject label="Pivot Bolt (Fulcrum)" onHoverChange={onHoverChange}>
                    <group>
                        <Cylinder args={[0.04, 0.04, 1.4]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.5]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                        <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.21]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                    </group>
                </InteractiveObject>
                <InteractiveObject label="Nut (Pivot Bolt)" onHoverChange={onHoverChange}>
                    <Cylinder args={[0.06, 0.06, 0.03]} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -1.21]}><meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.1} /></Cylinder>
                </InteractiveObject>

                <group rotation={[0, 0, -angle]}>
                    <InteractiveObject label="Writing Lever" onHoverChange={onHoverChange}>
                        <group rotation={[0, Math.PI, -Math.PI / 2]}>
                            <group position={[0.55, 0, 1]}>
                                <Box args={[1.125, 0.08, 0.05]} position={[0, 0, 0]}><meshStandardMaterial color={brassColor} metalness={0.6} roughness={0.4} /></Box>
                                {[-0.3, -0.05, 0.2, 0.45].map((x, i) => (
                                    <Cylinder key={i} args={[0.02, 0.02, 0.052]} rotation={[Math.PI / 2, 0, 0]} position={[x, 0, 0]}><meshStandardMaterial color="#1a1a1a" /></Cylinder>
                                ))}
                            </group>
                        </group>
                    </InteractiveObject>
                    <InteractiveObject label="Muscle Hook" onHoverChange={onHoverChange}>
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

export const ConductionVelocity: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [voltage, setVoltage] = useState(3.5);
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d');
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');
    const [stimPoint, setStimPoint] = useState<'muscle' | 'vertebral'>('muscle');

    const [simState, setSimState] = useState<SimulationState>({
        time: 0, isRunning: false, mData: [], vData: [], currentMHeight: 0, currentVHeight: 0
    });

    const animationFrameRef = useRef<number>();
    const activeStimRef = useRef<'muscle' | 'vertebral'>('muscle');

    const handleStimulate = () => {
        if (simState.isRunning) return;
        activeStimRef.current = stimPoint;
        // Preserve the other curve's data, only reset the active one
        setSimState(prev => ({
            time: 0, isRunning: true,
            mData: stimPoint === 'muscle' ? [] : prev.mData,
            vData: stimPoint === 'vertebral' ? [] : prev.vData,
            currentMHeight: 0, currentVHeight: 0
        }));
    };

    const handleReset = () => {
        setSimState({
            time: 0, isRunning: false, mData: [], vData: [],
            currentMHeight: 0, currentVHeight: 0
        });
        setResetKey(prev => prev + 1);
    };

    useEffect(() => {
        if (!simState.isRunning) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }

        let lastTime = Date.now();
        let simTime = simState.time;
        const currentStim = activeStimRef.current;

        // Scale peak based on voltage
        const voltageFactor = Math.min(voltage / 4.0, 1.0);
        const mPeak = M_PEAK * voltageFactor;
        const vPeak = V_PEAK * voltageFactor;

        const loop = () => {
            const now = Date.now();
            const dt = now - lastTime;
            lastTime = now;
            simTime += dt * 0.2;

            if (simTime > TOTAL_WINDOW_MS) {
                setSimState(prev => ({ ...prev, isRunning: false, time: TOTAL_WINDOW_MS, currentMHeight: 0, currentVHeight: 0 }));
                return;
            }

            const mH = currentStim === 'muscle' ? calculateCurveHeight(simTime, mPeak, M_LATENT_DURATION, M_CONTRACTION_DURATION, M_RELAXATION_DURATION) : 0;
            const vH = currentStim === 'vertebral' ? calculateCurveHeight(simTime, vPeak, V_LATENT_DURATION, V_CONTRACTION_DURATION, V_RELAXATION_DURATION) : 0;

            setSimState(prev => ({
                ...prev,
                time: simTime,
                currentMHeight: mH,
                currentVHeight: vH,
                mData: currentStim === 'muscle' ? [...prev.mData, { t: simTime, y: mH }] : prev.mData,
                vData: currentStim === 'vertebral' ? [...prev.vData, { t: simTime, y: vH }] : prev.vData,
            }));
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); }
    }, [simState.isRunning, voltage]);

    // Use M-curve height for 3D visualization (dominant response)
    const muscleHeight = Math.max(simState.currentMHeight, simState.currentVHeight);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-500 bg-clip-text text-transparent">Conduction Velocity</h1>
                        <p className="text-slate-500 text-xs">Sciatic Nerve — Frog</p>
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
                            ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-blue-400 border-b-2 border-blue-400'
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
                                <LucasChamber muscleShortening={muscleHeight} onHoverChange={setHoveredLabel} />
                                <StarlingLever angle={muscleHeight * 0.15} onHoverChange={setHoveredLabel} />
                            </group>
                            <Kymograph
                                simTime={simState.time}
                                tension={muscleHeight}
                                isRunning={simState.isRunning}
                                onHoverChange={setHoveredLabel}
                                resetKey={resetKey}
                            />
                        </group>

                        <OrbitControls makeDefault target={[-0.74, -0.60, 3.39]} minPolarAngle={0} />
                    </Canvas>

                    {/* Hover Label */}
                    {hoveredLabel && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 text-white px-3 py-1.5 rounded-full text-sm border border-slate-700 backdrop-blur-sm pointer-events-none animate-in fade-in duration-200">
                            {hoveredLabel}
                        </div>
                    )}
                </div>

                {/* Controls & Graph Panel */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none">
                    {/* Custom Conduction Velocity Graph - Top */}
                    <div className={`flex-1 p-6 min-h-0 flex flex-col border-b border-slate-800 ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">Kymograph Record</h3>
                        <div className="flex-1 bg-black rounded-lg border border-slate-800 overflow-hidden relative">
                            <ConductionVelocityGraph
                                mData={simState.mData}
                                vData={simState.vData}
                                isRunning={simState.isRunning}
                                simTime={simState.time}
                            />
                        </div>
                    </div>

                    {/* Controls - Bottom */}
                    <div className="p-6 bg-slate-900 z-10">

                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl">
                            <h2 className="text-slate-200 text-lg font-semibold mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-blue-400" />
                                Stimulator Control
                            </h2>

                            <div className="space-y-6">
                                {/* Stimulation Point Toggle */}
                                <div>
                                    <label className="text-slate-400 text-sm font-medium mb-2 block">Stimulation Point</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setStimPoint('muscle')}
                                            disabled={simState.isRunning}
                                            className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all border ${stimPoint === 'muscle'
                                                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                                : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                                                }`}
                                        >
                                            Muscle End
                                        </button>
                                        <button
                                            onClick={() => setStimPoint('vertebral')}
                                            disabled={simState.isRunning}
                                            className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all border ${stimPoint === 'vertebral'
                                                ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                                                : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                                                }`}
                                        >
                                            Vertebral End
                                        </button>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={handleStimulate}
                                        disabled={simState.isRunning}
                                        className={`
                                            flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all
                                            ${simState.isRunning
                                                ? 'bg-blue-900/50 text-blue-500/50 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] active:scale-95'}
                                        `}
                                    >
                                        <Zap className={`w-5 h-5 ${simState.isRunning ? '' : 'fill-current'}`} />
                                        {simState.isRunning ? 'Running...' : 'STIMULATE'}
                                    </button>

                                    <button
                                        onClick={handleReset}
                                        disabled={simState.isRunning}
                                        className="flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </div>


                    </div>
                </div>
            </main>
        </div>
    );
};
