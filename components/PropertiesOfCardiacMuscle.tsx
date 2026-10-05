import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Cylinder, Box, Sphere, Environment, Tube, Torus, Circle, Cone } from '@react-three/drei';
import { ArrowLeft, Eye, LineChart, Thermometer, Zap, RefreshCw, Play, Square, Droplets, Activity, Volume2, VolumeX, Moon, Sun } from 'lucide-react';
import * as THREE from 'three';
import { useHeartbeatSound } from './useHeartbeatSound';

// --- Types & Constants ---

interface CardiogramState {
    time: number;
    isRecording: boolean;
    data: { t: number; y: number }[];
    currentContraction: number; // 0–1 normalized heart contraction
    heartRate: number; // bpm
    temperature: number; // °C
    ligature1?: boolean; // 1st Stannius Ligature (Sinus-Atrial)
    ligature2?: boolean; // 2nd Stannius Ligature (Atrio-Ventricular)
}

// Temperature presets matching textbook values
const TEMPERATURE_PRESETS = [
    { label: 'Cold (15°C)', value: 15, hr: 18, amplitude: 1.3, color: '#3b82f6', bgColor: 'bg-blue-600', borderColor: 'border-blue-400' },
    { label: 'Normal (25°C)', value: 25, hr: 24, amplitude: 1.0, color: '#22c55e', bgColor: 'bg-green-600', borderColor: 'border-green-400' },
    { label: 'Warm (35°C)', value: 35, hr: 36, amplitude: 0.7, color: '#ef4444', bgColor: 'bg-red-600', borderColor: 'border-red-400' },
];

function getTemperatureParams(temp: number, experiment?: string) {
    const preset = TEMPERATURE_PRESETS.find(p => p.value === temp) || TEMPERATURE_PRESETS[1];
    const hr = (experiment === 'heart-block') ? 36 : preset.hr;
    const periodMs = (60 / hr) * 1000; // ms per beat
    return { hr, amplitude: preset.amplitude, periodMs, color: preset.color };
}

// Cardiogram waveform — one full cardiac cycle mapped to phase 0..1
// Atrial Systole:      3 → 1  (contraction, downward deflection)
// Atrial Diastole:     1 → 2  (relaxation, partial recovery)
// AV Delay:            2      (flat pause)
// Ventricular Systole: 2 → 0  (contraction, deep downward deflection)
// Ventricular Diastole:0 → 3  (relaxation, full recovery to baseline)
function cardiogramWaveform(phase: number, amplitude: number, cycleIndex: number = 0, experiment: string = 'extra-systole'): number {
    const smooth = (p: number) => (1 - Math.cos(p * Math.PI)) / 2; // 0→1 smooth

    const getNormalY = (p: number) => {
        if (p < 0.16) return 3.0 - 2.0 * smooth(p / 0.16);
        if (p < 0.32) return 1.0 + 1.0 * smooth((p - 0.16) / 0.16);
        if (p < 0.40) return 2.0;
        if (p < 0.56) return 2.0 - 2.0 * smooth((p - 0.40) / 0.16);
        return 3.0 * smooth((p - 0.56) / 0.44);
    };

    let y: number;

    if (experiment === 'extra-systole') {
        // Special behavior for the 3rd wave (index 2): Deep Atrial Systole (3 -> -2)
        if (cycleIndex === 2) {
            if (phase < 0.16) {
                // Atrial Systole: 3 → -2 (Deeper deflection)
                y = 3.0 - 5.0 * smooth(phase / 0.16);
            } else if (phase < 0.32) {
                // Atrial Diastole: -2 → 3 (Recover from deep trough)
                y = -2.0 + 5.0 * smooth((phase - 0.16) / 0.16);
            } else if (phase < 0.40) {
                // AV Delay: hold at 3
                y = 3.0;
            } else if (phase < 0.56) {
                // Ventricular Systole: 3 → 3 (No contraction)
                y = 3.0;
            } else {
                // Ventricular Diastole: Hold baseline
                y = 3.0;
            }
        } else {
            // Normal waveform shape
            y = getNormalY(phase);

            // Progressive scaling for waves 4–7 (cycleIndex 3–6)
            // Scale factors: 1/3 → 5/9 → 7/9 → 1 (full size)
            const scaleMap: Record<number, number> = { 3: 1 / 3, 4: 5 / 9, 5: 7 / 9, 6: 1 };
            if (cycleIndex in scaleMap) {
                const scale = scaleMap[cycleIndex];
                // Scale deviation from baseline (3.0)
                y = 3.0 - (3.0 - y) * scale;
            }
        }
    } else if (experiment === 'staircase') {
        // Staircase / Treppe Phenomenon
        // Progressive increase in amplitude for the first few beats
        const scaleMap: Record<number, number> = { 0: 0.4, 1: 0.6, 2: 0.8, 3: 0.9 };
        y = getNormalY(phase);

        const scale = scaleMap[cycleIndex] ?? 1.0;
        y = 3.0 - (3.0 - y) * scale;

    } else if (experiment === 'summation') {
        // Summation of Subliminal Stimuli
        // User Request: 
        // 1. Threshold Stimulus (Cycle 0) -> Contraction
        // 2. Gap (Cycle 1, 2, 3 suppressed) -> Flat (3 cycles gap)
        //    * Single sub-threshold stimulus after 1st gap cycle (at Cycle 1 start)
        // 3. Summation (Cycle 4 & 5) -> Contraction
        // 4. Flatline (Cycle 6+)

        if (cycleIndex >= 1 && cycleIndex <= 3) {
            y = 3.0; // Gap for 3 cycles
        } else if (cycleIndex >= 6) {
            y = 3.0; // Stop after Cycle 5
        } else {
            y = getNormalY(phase); // Cycle 0 (Threshold) and Cycle 4,5 (Summation)
        }

    } else if (experiment === 'heart-block') {
        // Stannius ligatures: 
        // 1st Ligature: Pause cycles 4-7 (4 cycles)
        // 2nd Ligature: Pause cycles 12-15 (4 cycles)
        if ((cycleIndex >= 4 && cycleIndex <= 7) || (cycleIndex >= 12 && cycleIndex <= 15)) {
            y = 3.0; // Flat line (Enforced Diastole/Pause)
        } else {
            y = getNormalY(phase);
        }
    } else if (experiment === 'all-or-none') {
        // All or None Law:
        // Cycle 0: Sub-threshold (No response)
        // Others: Full response
        // phase < 0 indicates a pause between beats
        if (cycleIndex === 0 || phase < 0) {
            y = 3.0;
        } else {
            y = getNormalY(phase);
        }

        // Add Stimulus Artifact (Only at the very start of the recording to show it has begun)
        if (cycleIndex === 0 && phase >= 0 && phase < 0.02) {
            y -= 0.6; // Sharp upward spike
        }
    } else {
        // All other experiments start with normal behavior
        y = getNormalY(phase);
    }

    return y * amplitude;
}

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
            onPointerOut={() => {
                if (onHoverChange) { onHoverChange(null); document.body.style.cursor = 'auto'; }
            }}
        >
            {children}
        </group>
    );
};

// --- Myograph Board ---
const MyographBoard = ({ onHoverChange }: { onHoverChange?: (l: string | null) => void }) => {
    return (
        <InteractiveObject label="Myograph Board" onHoverChange={onHoverChange}>
            <group position={[0, -0.9, 0]}>
                {/* Main wooden board */}
                <Box args={[4, 0.15, 2.5]} position={[0, 0, 0]}>
                    <meshStandardMaterial color="#8B7355" roughness={0.8} />
                </Box>
                {/* Cork surface layer */}
                <Box args={[3.6, 0.05, 2.1]} position={[0, 0.1, 0]}>
                    <meshStandardMaterial color="#D2B48C" roughness={0.9} />
                </Box>
                {/* Board legs */}
                {[[-1.7, -0.2, -1], [1.7, -0.2, -1], [-1.7, -0.2, 1], [1.7, -0.2, 1]].map((pos, i) => (
                    <Cylinder key={`leg-${i}`} args={[0.06, 0.08, 0.3]} position={pos as [number, number, number]}>
                        <meshStandardMaterial color="#5C4033" roughness={0.7} />
                    </Cylinder>
                ))}
                {/* Pins on the board for holding the frog */}
                {[[-1.2, 0.15, -0.6], [-1.2, 0.15, 0.6], [1.2, 0.15, -0.6], [1.2, 0.15, 0.6],
                [-0.6, 0.15, -0.8], [-0.6, 0.15, 0.8], [0.6, 0.15, -0.8], [0.6, 0.15, 0.8]].map((pos, i) => (
                    <group key={`pin-${i}`} position={pos as [number, number, number]}>
                        <Cylinder args={[0.015, 0.015, 0.15]} position={[0, 0.075, 0]}>
                            <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
                        </Cylinder>
                        <Sphere args={[0.02, 8, 8]} position={[0, 0.15, 0]}>
                            <meshStandardMaterial color="#e0e0e0" metalness={0.8} roughness={0.2} />
                        </Sphere>
                    </group>
                ))}
            </group>
        </InteractiveObject>
    );
};

// --- Frog Heart (3-chambered: 2 atria + 1 ventricle) ---
// Procedural model: Lathe geometry for ventricle, deformed spheres for atria
const FrogHeart = ({ contraction, temperature, onHoverChange, showLigature1, isTight1, showLigature2, isTight2 }: {
    contraction: number,
    temperature: number,
    onHoverChange?: (l: string | null) => void,
    showLigature1?: boolean,
    isTight1?: boolean,
    showLigature2?: boolean,
    isTight2?: boolean
}) => {
    const heartRef = useRef<THREE.Group>(null);
    const ventricleRef = useRef<THREE.Group>(null);
    const leftAtriumRef = useRef<THREE.Group>(null);
    const rightAtriumRef = useRef<THREE.Group>(null);
    const truncusRef = useRef<THREE.Group>(null);
    const ligature2Ref = useRef<THREE.Group>(null);
    const sinusRef = useRef<THREE.Mesh>(null);
    const ligature1Ref = useRef<THREE.Group>(null);

    // Heart color changes with temperature - wet tissue look
    const heartColor = useMemo(() => {
        if (temperature <= 15) return '#8B0000'; // Darker red when cold
        if (temperature >= 35) return '#FF4444'; // Brighter red when warm
        return '#be123c'; // Normal red
    }, [temperature]);

    const atrialColor = useMemo(() => {
        // Atria are usually darker/thinner walled
        return new THREE.Color(heartColor).multiplyScalar(0.8).getHexString();
    }, [heartColor]);

    useFrame(() => {
        if (ventricleRef.current) {
            const deflection = 3.0 - contraction; // 0 at baseline, 3 at max systole
            const squeeze = Math.max(0.4, 1 - deflection * 0.05);
            const shorten = Math.max(0.5, 1 - deflection * 0.05);
            ventricleRef.current.scale.set(squeeze, shorten, squeeze);

            // Animate 2nd Ligature to follow the AV groove
            if (ligature2Ref.current) {
                // Determine new Y position based on ventricle shortening
                // Initial Y is -0.3. As ventricle shortens (scale Y < 1), this point moves up towards 0.
                const newY = -0.3 * shorten;
                ligature2Ref.current.position.set(0, newY, 0.05 * squeeze);

                // Scale the ligature ring to match ventricle squeezing
                ligature2Ref.current.scale.set(squeeze, 1, squeeze);
            }

            // Animate Sinus Venosus (pulsing slightly with systole)
            // Sinus should contract as Atria contract. For simplicity, we link it to general contraction with a small phase or just direct scaling.
            const sinusSqueeze = Math.max(0.8, 1 - deflection * 0.04);
            if (sinusRef.current) {
                sinusRef.current.scale.set(sinusSqueeze, sinusSqueeze, sinusSqueeze);
            }
            if (ligature1Ref.current) {
                // Ligature 1 follows Sinus contraction
                ligature1Ref.current.scale.set(sinusSqueeze * (isTight1 ? 0.9 : 1.05), sinusSqueeze * (isTight1 ? 0.9 : 1.05), 1);
            }
        }
        if (leftAtriumRef.current && rightAtriumRef.current) {
            leftAtriumRef.current.scale.set(1, 1, 1);
            rightAtriumRef.current.scale.set(1, 1, 1);
        }
        if (truncusRef.current) {
            const deflection = 3.0 - contraction;
            const pulse = 1 + deflection * 0.05;
            truncusRef.current.scale.set(pulse, 1, pulse);
        }
    });

    const ventricleGeometry = useMemo(() => {
        const curve = new THREE.SplineCurve([
            new THREE.Vector2(0, -0.6),
            new THREE.Vector2(0.15, -0.4),
            new THREE.Vector2(0.28, -0.1),
            new THREE.Vector2(0.32, 0.2),
            new THREE.Vector2(0.25, 0.5),
            new THREE.Vector2(0.15, 0.6),
            new THREE.Vector2(0, 0.65),
        ]);
        const geom = new THREE.LatheGeometry(curve.getPoints(20), 32);
        geom.computeVertexNormals();
        return geom;
    }, []);

    const truncusMainPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.6, 0.1), new THREE.Vector3(0, 0.85, 0.15),
    ]), []);
    const leftArchPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.85, 0.15), new THREE.Vector3(-0.25, 1.0, 0.05), new THREE.Vector3(-0.4, 1.05, -0.1),
    ]), []);
    const rightArchPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.85, 0.15), new THREE.Vector3(0.25, 1.0, 0.05), new THREE.Vector3(0.4, 1.05, -0.1),
    ]), []);
    // Sinus Venosus Dimensions (used for geometry and collecting veins)
    const SINUS_W = 0.18;
    const SINUS_H = 0.18;
    const SINUS_R = 0.12;
    const SINUS_Z = 0.3;
    const SINUS_Y_OFFSET = 0;

    // Vena Cavae Paths (Refined to match Sinus Venosus geometry)
    const leftSuperiorVenaCavaPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.4, 0.6, 0.1), // Start (far out)
        new THREE.Vector3(-0.3, 0.4, 0.15),
        new THREE.Vector3(-SINUS_W, SINUS_Y_OFFSET + SINUS_H - 0.05, SINUS_Z), // Connect to Top-Left corner of Sinus
    ]), []);

    const rightSuperiorVenaCavaPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.4, 0.6, 0.1), // Start (far out)
        new THREE.Vector3(0.3, 0.4, 0.15),
        new THREE.Vector3(SINUS_W, SINUS_Y_OFFSET + SINUS_H - 0.05, SINUS_Z), // Connect to Top-Right corner of Sinus
    ]), []);

    const inferiorVenaCavaPath = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, SINUS_Y_OFFSET - SINUS_H + 0.05, SINUS_Z), // Connect to Bottom tip of Sinus
        new THREE.Vector3(0, -0.6, 0.1),
        new THREE.Vector3(0, -0.7, 0.1), // End (downwards)
    ]), []);

    const sinusGeometry = useMemo(() => {
        const shape = new THREE.Shape();
        const w = SINUS_W;
        const h = SINUS_H;
        const r = SINUS_R;

        // Rounded Triangle pointing UP (relative to shape coords)
        // Start bottom-left
        shape.moveTo(-w + r, -h);

        // Bottom edge
        shape.lineTo(w - r, -h);
        // Bottom-right corner smoother
        shape.quadraticCurveTo(w, -h, w - 0.06, -h + 0.1);

        // Right edge
        shape.lineTo(0.06, h - 0.1);
        // Top corner smoother
        shape.quadraticCurveTo(0, h, -0.06, h - 0.1);

        // Left edge
        shape.lineTo(-w + 0.06, -h + 0.1);
        // Bottom-left corner smoother
        shape.quadraticCurveTo(-w, -h, -w + r, -h);

        const extrudeSettings = {
            depth: 0.08,
            bevelEnabled: true,
            bevelSegments: 8,
            steps: 2,
            bevelSize: 0.05,
            bevelThickness: 0.05
        };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geom.center(); // Center the geometry
        return geom;
    }, []);

    const ligaturePath = useMemo(() => {
        const w = SINUS_W + 0.08; // Expanded to wrap around the sinus
        const h = SINUS_H + 0.08;
        const r = SINUS_R;

        // More control points for a tighter rounded triangle
        const pts = [
            new THREE.Vector3(0, -h, 0),             // Bottom Center
            new THREE.Vector3(w - 0.1, -h, 0),       // Bottom Right
            new THREE.Vector3(w, -h + 0.1, 0),       // Bottom Right Corner
            new THREE.Vector3(w - 0.05, 0, 0),       // Right Side
            new THREE.Vector3(0, h + 0.02, 0),       // Top Tip
            new THREE.Vector3(-(w - 0.05), 0, 0),    // Left Side
            new THREE.Vector3(-w, -h + 0.1, 0),      // Bottom Left Corner
            new THREE.Vector3(-(w - 0.1), -h, 0),    // Bottom Left
        ];
        return new THREE.CatmullRomCurve3(pts, true);
    }, []);

    // Loose ends of the knot
    const threadEnd1 = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, SINUS_H + 0.08, 0),       // Start at knot
        new THREE.Vector3(0.08, SINUS_H + 0.18, 0.1),  // Curve right & out
        new THREE.Vector3(0.12, SINUS_H + 0.28, 0.15), // End
    ]), []);

    const threadEnd2 = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, SINUS_H + 0.08, 0),       // Start at knot
        new THREE.Vector3(-0.08, SINUS_H + 0.18, 0.1), // Curve left & out
        new THREE.Vector3(-0.12, SINUS_H + 0.28, 0.15),// End
    ]), []);

    const threadEnd2_1 = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.21, 0, 0),       // Start at knot
        new THREE.Vector3(0.35, 0.1, 0.05),  // Out and up/down? Knot is at x=0.21. 
        new THREE.Vector3(0.40, 0.2, 0.1), // End
    ]), []);

    const threadEnd2_2 = useMemo(() => new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.21, 0, 0),       // Start at knot
        new THREE.Vector3(0.35, -0.1, 0.05), // Out and down
        new THREE.Vector3(0.40, -0.2, 0.1),// End
    ]), []);

    return (
        <InteractiveObject label="Frog Heart (Sinus Venosus → Atria → Ventricle)" onHoverChange={onHoverChange}>
            <group ref={heartRef} position={[0, -0.2, 0]} rotation={[0, 0, Math.PI]}>

                {/* Atria - Sitting on top */}
                <group position={[0, 0.55, 0]}>
                    {/* Right Atrium (Larger) */}
                    <group ref={rightAtriumRef} position={[0.18, 0, -0.05]} rotation={[0, 0, -0.2]}>
                        <InteractiveObject label="Right Atrium" onHoverChange={onHoverChange}>
                            <Sphere args={[0.22, 32, 32]} scale={[1, 1.1, 0.9]}>
                                <meshPhysicalMaterial
                                    color={'#' + atrialColor}
                                    roughness={0.4}
                                    metalness={0.1}
                                    clearcoat={1}
                                    clearcoatRoughness={0.2}
                                />
                            </Sphere>
                        </InteractiveObject>
                    </group>

                    {/* Left Atrium (Smaller) */}
                    <group ref={leftAtriumRef} position={[-0.18, 0.05, -0.05]} rotation={[0, 0, 0.2]}>
                        <InteractiveObject label="Left Atrium" onHoverChange={onHoverChange}>
                            <Sphere args={[0.16, 32, 32]} scale={[1, 1.1, 0.9]}>
                                <meshPhysicalMaterial
                                    color={'#' + atrialColor}
                                    roughness={0.4}
                                    metalness={0.1}
                                    clearcoat={1}
                                    clearcoatRoughness={0.2}
                                />
                            </Sphere>
                        </InteractiveObject>
                    </group>
                </group>

                {/* Ventricle - Procedural Organic Shape */}
                <group ref={ventricleRef} position={[0, 0, 0.05]}>
                    <InteractiveObject label="Ventricle" onHoverChange={onHoverChange}>
                        <mesh geometry={ventricleGeometry}>
                            <meshPhysicalMaterial
                                color={heartColor}
                                roughness={0.5}
                                metalness={0.1}
                                clearcoat={1}
                                clearcoatRoughness={0.3}
                            />
                        </mesh>
                    </InteractiveObject>
                </group>

                {/* Truncus Arteriosus - Branching */}
                <group ref={truncusRef}>
                    <InteractiveObject label="Truncus Arteriosus (Branching)" onHoverChange={onHoverChange}>
                        {/* Main Trunk */}
                        <Tube args={[truncusMainPath, 16, 0.06, 12, false]}>
                            <meshPhysicalMaterial color="#d64949" roughness={0.4} clearcoat={1} />
                        </Tube>
                        {/* Left Arch */}
                        <Tube args={[leftArchPath, 16, 0.045, 8, false]}>
                            <meshPhysicalMaterial color="#d64949" roughness={0.4} clearcoat={1} />
                        </Tube>
                        {/* Right Arch */}
                        <Tube args={[rightArchPath, 16, 0.045, 8, false]}>
                            <meshPhysicalMaterial color="#d64949" roughness={0.4} clearcoat={1} />
                        </Tube>
                    </InteractiveObject>
                </group>

                {/* Major Veins */}
                <InteractiveObject label="Vena Cavae" onHoverChange={onHoverChange}>
                    <Tube args={[leftSuperiorVenaCavaPath, 12, 0.035, 8, false]}>
                        <meshPhysicalMaterial color="#5e4b8b" roughness={0.6} />
                    </Tube>
                    <Tube args={[rightSuperiorVenaCavaPath, 12, 0.035, 8, false]}>
                        <meshPhysicalMaterial color="#5e4b8b" roughness={0.6} />
                    </Tube>
                    <Tube args={[inferiorVenaCavaPath, 12, 0.035, 8, false]}>
                        <meshPhysicalMaterial color="#5e4b8b" roughness={0.6} />
                    </Tube>
                </InteractiveObject>

                {/* Sinus Venosus (Simulated posterior dark mass) */}
                <InteractiveObject label="Sinus Venosus (Posterior)" onHoverChange={onHoverChange}>
                    <mesh ref={sinusRef} geometry={sinusGeometry} position={[0, SINUS_Y_OFFSET, SINUS_Z]} rotation={[0, 0, Math.PI]}>
                        <meshPhysicalMaterial color="#4a2c2c" roughness={0.8} />
                    </mesh>
                </InteractiveObject>

                {showLigature1 && (
                    <InteractiveObject label="1st Stannius Ligature" onHoverChange={onHoverChange}>
                        {/* Wrap around the triangular Sinus Venosus */}
                        {/* Use same position/rotation as Sinus to align the triangle */}
                        <group ref={ligature1Ref} position={[0, SINUS_Y_OFFSET, SINUS_Z]} rotation={[0, 0, Math.PI]}>
                            {/* Main Loop */}
                            <Tube args={[ligaturePath, 64, isTight1 ? 0.025 : 0.035, 8, true]} scale={[isTight1 ? 0.9 : 1.05, isTight1 ? 0.9 : 1.05, 1]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Tube>
                            {/* Knot - Positioned at top corner (which is technically bottom in world due to rotation, but let's place it) */}
                            <Sphere args={[0.05, 8, 8]} position={[0, SINUS_H + 0.08, 0]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Sphere>
                            {/*  Ends of the Knot */}
                            <Tube args={[threadEnd1, 12, 0.025, 6, false]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Tube>
                            <Tube args={[threadEnd2, 12, 0.025, 6, false]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Tube>
                        </group>
                    </InteractiveObject>
                )}

                {showLigature2 && (
                    <InteractiveObject label="2nd Stannius Ligature" onHoverChange={onHoverChange}>
                        <group ref={ligature2Ref} position={[0, -0.3, 0.05]}>
                            {/* Thread wrapping around the atrio-ventricular junction */}
                            <Torus args={[isTight2 ? 0.2 : 0.2, 0.03, 8, 24]} rotation={[Math.PI / 2, 0, 0]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Torus>
                            {/* Knot */}
                            <Sphere args={[0.05, 8, 8]} position={[isTight2 ? 0.21 : 0.21, 0, 0]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Sphere>
                            {/*  Ends of the Knot */}
                            <Tube args={[threadEnd2_1, 12, 0.02, 6, false]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Tube>
                            <Tube args={[threadEnd2_2, 12, 0.02, 6, false]}>
                                <meshStandardMaterial color="#ffffff" roughness={0.9} />
                            </Tube>
                        </group>
                    </InteractiveObject>
                )}

            </group>
        </InteractiveObject>
    );
};

// --- Ringer's Solution Dropper ---
const RingerDropper = ({ temperature, isActive, onHoverChange }: {
    temperature: number,
    isActive: boolean,
    onHoverChange?: (l: string | null) => void
}) => {
    const dropRef = useRef<THREE.Mesh>(null);
    const [dropVisible, setDropVisible] = useState(false);

    const dropperColor = useMemo(() => {
        if (temperature <= 15) return '#6699FF';
        if (temperature >= 35) return '#FF6644';
        return '#88CCAA';
    }, [temperature]);

    useFrame((_, delta) => {
        if (isActive && dropRef.current) {
            dropRef.current.position.y -= delta * 2;
            if (dropRef.current.position.y < -0.5) {
                dropRef.current.position.y = 0.3;
            }
            setDropVisible(true);
        } else {
            setDropVisible(false);
        }
    });

    return (
        <InteractiveObject label={`Ringer's Solution Dropper (${temperature}°C)`} onHoverChange={onHoverChange}>
            <group position={[0.5, 1.8, 0.3]}>
                {/* Dropper body */}
                <Cylinder args={[0.04, 0.04, 0.6]} position={[0, 0, 0]}>
                    <meshPhysicalMaterial color="#f0f0f0" transmission={0.7} roughness={0} thickness={0.5} />
                </Cylinder>
                {/* Rubber bulb */}
                <Sphere args={[0.06, 16, 16]} position={[0, 0.35, 0]}>
                    <meshStandardMaterial color="#333333" roughness={0.8} />
                </Sphere>
                {/* Dropper tip */}
                <Cylinder args={[0.015, 0.035, 0.15]} position={[0, -0.35, 0]}>
                    <meshPhysicalMaterial color="#f0f0f0" transmission={0.6} roughness={0} thickness={0.3} />
                </Cylinder>
                {/* Liquid inside dropper */}
                <Cylinder args={[0.03, 0.03, 0.4]} position={[0, -0.05, 0]}>
                    <meshPhysicalMaterial color={dropperColor} transmission={0.5} roughness={0} opacity={0.7} transparent />
                </Cylinder>
                {/* Falling drop */}
                {dropVisible && (
                    <Sphere ref={dropRef} args={[0.02, 8, 8]} position={[0, -0.45, 0]}>
                        <meshPhysicalMaterial color={dropperColor} transmission={0.4} roughness={0} />
                    </Sphere>
                )}
            </group>
        </InteractiveObject>
    );
};

// --- Frog Body (Procedural) ---
const FrogBody = ({ onHoverChange }: { onHoverChange?: (l: string | null) => void }) => {
    return (
        <InteractiveObject label="Frog (Pithed)" onHoverChange={onHoverChange}>
            <group position={[0, -0.4, 0.2]} rotation={[-0.1, 0, 0]}>
                {/* Main Torso - Flatter and wider */}
                <Sphere args={[0.5, 32, 32]} scale={[2.2, 1.0, 3.0]} position={[0, 0, 0]}>
                    <meshStandardMaterial color="#556b2f" roughness={0.6} />
                </Sphere>

                {/* Chest Cavity - Open Incision */}
                {/* Moved up to Y=0.46 to sit on surface, and Z=0.6 to align with Heart X position */}
                <group position={[0, 0.45, -0.5]} rotation={[0.1, 0, 0]}>

                    {/* Rough tissue/muscle edges around the hole (Reddish ring) */}
                    <Torus args={[0.28, 0.05, 16, 24]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1.2]} position={[0, 0.02, 0]}>
                        <meshStandardMaterial color="#661111" roughness={0.5} />
                    </Torus>

                    {/* Skin Flaps (pulled back) */}
                    {/* Left Flap */}
                    <group position={[-0.4, 0.02, 0]} rotation={[0, 0, 0.3]}>
                        <Box args={[0.3, 0.03, 0.6]}>
                            <meshStandardMaterial color="#556b2f" roughness={0.6} />
                        </Box>
                        <Box args={[0.28, 0.031, 0.58]} position={[0.05, -0.005, 0]}>
                            <meshStandardMaterial color="#4a1c1c" roughness={0.7} />
                        </Box>
                    </group>

                    {/* Right Flap */}
                    <group position={[0.4, 0.02, 0]} rotation={[0, 0, -0.3]}>
                        <Box args={[0.3, 0.03, 0.6]}>
                            <meshStandardMaterial color="#556b2f" roughness={0.6} />
                        </Box>
                        <Box args={[0.28, 0.031, 0.58]} position={[-0.05, -0.005, 0]}>
                            <meshStandardMaterial color="#4a1c1c" roughness={0.7} />
                        </Box>
                    </group>

                    {/* Top Flap */}
                    <group position={[0, 0.05, -0.4]} rotation={[0.4, 0, 0]}>
                        <Box args={[0.5, 0.03, 0.25]}>
                            <meshStandardMaterial color="#556b2f" roughness={0.6} />
                        </Box>
                        <Box args={[0.48, 0.031, 0.23]} position={[0, -0.005, 0.05]}>
                            <meshStandardMaterial color="#4a1c1c" roughness={0.7} />
                        </Box>
                    </group>
                    {/* Bottom Flap */}
                    <group position={[0, 0.05, 0.4]} rotation={[-0.4, 0, 0]}>
                        <Box args={[0.5, 0.03, 0.25]}>
                            <meshStandardMaterial color="#556b2f" roughness={0.6} />
                        </Box>
                        <Box args={[0.48, 0.031, 0.23]} position={[0, -0.005, -0.05]}>
                            <meshStandardMaterial color="#4a1c1c" roughness={0.7} />
                        </Box>
                    </group>
                </group>

                {/* Head */}
                <group position={[0, 0.1, -1.6]}>
                    <Sphere args={[0.4, 32, 32]} scale={[1.5, 0.8, 1.2]}>
                        <meshStandardMaterial color="#556b2f" roughness={0.6} />
                    </Sphere>
                    {/* Eyes */}
                    <Sphere args={[0.1, 16, 16]} position={[0.3, 0.2, -0.1]}>
                        <meshStandardMaterial color="#111" roughness={0.2} />
                    </Sphere>
                    <Sphere args={[0.1, 16, 16]} position={[-0.3, 0.2, -0.1]}>
                        <meshStandardMaterial color="#111" roughness={0.2} />
                    </Sphere>
                </group>

                {/* Legs (Thighs) */}
                <group position={[0.9, -0.1, 1.0]} rotation={[0, 0.5, 0]}>
                    <Cylinder args={[0.2, 0.15, 1.2]} rotation={[0, 0, 1.2]}>
                        <meshStandardMaterial color="#556b2f" roughness={0.6} />
                    </Cylinder>
                </group>
                <group position={[-0.9, -0.1, 1.0]} rotation={[0, -0.5, 0]}>
                    <Cylinder args={[0.2, 0.15, 1.2]} rotation={[0, 0, -1.2]}>
                        <meshStandardMaterial color="#556b2f" roughness={0.6} />
                    </Cylinder>
                </group>

                {/* Arms */}
                <group position={[0.8, -0.1, -0.8]} rotation={[0, -0.3, 0]}>
                    <Cylinder args={[0.12, 0.1, 1.0]} rotation={[0, 0, 1.3]}>
                        <meshStandardMaterial color="#8da399" roughness={0.8} />
                    </Cylinder>
                </group>
                <group position={[-0.8, -0.1, -0.8]} rotation={[0, 0.3, 0]}>
                    <Cylinder args={[0.12, 0.1, 1.0]} rotation={[0, 0, -1.3]}>
                        <meshStandardMaterial color="#8da399" roughness={0.8} />
                    </Cylinder>
                </group>
            </group>
        </InteractiveObject>
    );
};

// --- Procedural Spring Component ---
// --- Optimized Helical Spring ---
const HelicalSpring = ({ length, radius, coils, color, thickness }: { length: number, radius: number, coils: number, color: string, thickness: number }) => {
    // Create geometry ONCE based on a default length of 1.0
    // We will scale the mesh in Y to match the desired length.
    const baseLength = 1.0;

    // Check if we can reuse geometry or if props changed (except length)
    const geometry = useMemo(() => {
        const points = [];
        // High resolution for smooth curve
        const segments = coils * 12;

        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = t * Math.PI * 2 * coils;
            const x = radius * Math.cos(angle);
            const z = radius * Math.sin(angle);
            const y = -t * baseLength; // Hangs down to -1.0
            points.push(new THREE.Vector3(x, y, z));
        }

        const curve = new THREE.CatmullRomCurve3(points);
        return new THREE.TubeGeometry(curve, segments, thickness, 8, false);
    }, [radius, coils, thickness]); // removed length from dependencies

    return (
        <group scale={[1, length / baseLength, 1]}>
            <mesh geometry={geometry}>
                <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
            </mesh>
        </group>
    );
};

// --- Spring Loaded Lever (Starling Heart Lever) ---
const SpringLoadedLever = ({ angle, onHoverChange }: { angle: number, onHoverChange?: (l: string | null) => void }) => {
    const metalColor = "#e2e8f0";
    const standColor = "#94a3b8";
    const knobColor = "#475569";
    const leverColor = "#f1f5f9";
    const standX = -1.5;
    const pivotY = 0.7;
    const pivotPosition = [standX, pivotY, 0.15];
    const rotation = -angle;
    const baseSpringLen = 0.75;
    const currentSpringLength = baseSpringLen + angle * 0.9;
    const leverPivotOffset: [number, number, number] = [0.6, 0, 0];

    return (
        <group position={[0, 0.5, 0.5]}>
            <InteractiveObject label="Starling Lever (Stand Post)" onHoverChange={onHoverChange}>
                <Cylinder args={[0.06, 0.06, 4.5]} position={[standX, 0, 0]}>
                    <meshStandardMaterial color={standColor} metalness={0.6} roughness={0.4} />
                </Cylinder>
            </InteractiveObject>

            <InteractiveObject label="Starling Lever (Tension Adjuster)" onHoverChange={onHoverChange}>
                <group position={[-0.75, 0.4, 0]} rotation={[0, 0, 1.57]}>
                    <Cylinder args={[0.025, 0.025, 1]} position={[0.8, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <meshStandardMaterial color={metalColor} metalness={0.6} />
                    </Cylinder>
                    <group position={[1.1, 0.05, 0]}>
                        <Box args={[0.1, 0.15, 0.1]}><meshStandardMaterial color={metalColor} /></Box>
                        <Cylinder args={[0.015, 0.015, 0.6]} position={[0, -0.17, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.5} />
                        </Cylinder>
                        <Cylinder args={[0.05, 0.05, 0.04]} position={[0, 0.13, 0]}>
                            <meshStandardMaterial color={knobColor} roughness={0.8} />
                        </Cylinder>
                        <Torus args={[0.025, 0.005, 8, 16]} position={[0, -0.47, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <meshStandardMaterial color={metalColor} />
                        </Torus>
                    </group>
                </group>
            </InteractiveObject>

            <group position={pivotPosition as [number, number, number]}>
                <group position={[0.3, 0, -0.14]}>
                    <InteractiveObject label="Starling Lever (Mounting Clamp)" onHoverChange={onHoverChange}>
                        <group>
                            <Box args={[0.85, 0.13, 0.4]}>
                                <meshStandardMaterial color={metalColor} metalness={0.7} />
                            </Box>
                            <group position={[-0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                                <Cylinder args={[0.03, 0.03, 0.1]}><meshStandardMaterial color={knobColor} /></Cylinder>
                                <Cylinder args={[0.07, 0.07, 0.02]} position={[0, 0.05, 0]}><meshStandardMaterial color={knobColor} /></Cylinder>
                            </group>
                        </group>
                    </InteractiveObject>

                    <group position={[0.55, 0, 0]}>
                        <Box args={[0.05, 0.13, 0.35]} position={[-0.1, 0, 0]}>
                            <meshStandardMaterial color={metalColor} metalness={0.7} />
                        </Box>
                        <Box args={[0.25, 0.13, 0.04]} position={[0, 0, 0.18]}>
                            <meshStandardMaterial color={metalColor} metalness={0.7} />
                        </Box>
                        <Box args={[0.25, 0.13, 0.04]} position={[0, 0, -0.18]}>
                            <meshStandardMaterial color={metalColor} metalness={0.7} />
                        </Box>
                    </group>

                    <group rotation={[0, 0, rotation]} position={leverPivotOffset}>
                        <Cylinder args={[0.02, 0.02, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
                            <meshStandardMaterial color={knobColor} />
                        </Cylinder>

                        <InteractiveObject label="Starling Lever (Lever Arm)" onHoverChange={onHoverChange}>
                            <group position={[0.5, 0, 0]}>
                                <Box args={[1.2, 0.12, 0.03]}>
                                    <meshStandardMaterial color={leverColor} roughness={0.3} metalness={0.2} />
                                </Box>
                                {[-0.4, -0.2, 0.0, 0.2, 0.4].map((x, i) => (
                                    <group key={i} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                        <Cylinder args={[0.025, 0.025, 0.032]}>
                                            <meshBasicMaterial color="#1e293b" />
                                        </Cylinder>
                                    </group>
                                ))}
                            </group>
                        </InteractiveObject>

                        <InteractiveObject label="Starling Lever (Writing Stylus)" onHoverChange={onHoverChange}>
                            <group position={[1.18, 0, 0]}>
                                <Box args={[0.08, 0.08, 0.08]} position={[-0.04, 0, 0]}>
                                    <meshStandardMaterial color={metalColor} />
                                </Box>
                                <Cylinder args={[0.012, 0.012, 2.9]} position={[1.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                                    <meshStandardMaterial color="#222" roughness={0.6} />
                                </Cylinder>
                                <Cone args={[0.012, 0.06, 8]} position={[2.9, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                                    <meshStandardMaterial color="#111" />
                                </Cone>
                            </group>
                        </InteractiveObject>
                    </group>
                </group>

                {/* Spring Element */}
                {/* Positioned to connect top hook (at x=1.1 relative to stand) to lever hole */}
                {/* Lever hole at x = 1.1 + offset_from_pivot ~ 0.85 = (1.1 - 0.25). 
                    Let's align it visually. 
                    Top Hook X relative to Pivot Group = (standX + 1.1) - standX = 1.1.
                    Spring x position = 1.1. 
                 */}
                <InteractiveObject label="Starling Lever (Spring)" onHoverChange={onHoverChange}>
                    <group position={[1.15, 0.8, -0.15]}>
                        <HelicalSpring
                            length={currentSpringLength}
                            radius={0.04}
                            coils={14}
                            color="#cbd5e1"
                            thickness={0.01}
                        />
                    </group>
                </InteractiveObject>

            </group>
        </group>
    );
};

// --- Thread connecting heart to lever ---
const HeartThread = ({ contraction }: { contraction: number }) => {
    // Lever angle multiplier — must match the value used in <SpringLoadedLever>
    const LEVER_ANGLE_SCALE = 0.036;

    // Calculate thread start and end points
    const { start, end, len, midpoint, quaternion } = useMemo(() => {
        const localX = 0;
        const localZ = 0;
        // Lever pivot-to-thread distance
        const r = 1.0;
        // Lever deflection relative to baseline (3.0 = horizontal, 0 = max deflection)
        const deflection = (3.0 - contraction) * LEVER_ANGLE_SCALE;
        const theta = -deflection;
        const leverY = 1.16 + Math.sin(theta) * r;

        const startVec = new THREE.Vector3(localX, 0.06 - (3.0 - contraction) * 0.03, localZ);
        const endVec = new THREE.Vector3(localX, leverY, localZ);

        const length = startVec.distanceTo(endVec);
        const mid = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);

        // Calculate rotation to align cylinder with start->end vector
        const up = new THREE.Vector3(0, 1, 0);
        const dir = new THREE.Vector3().subVectors(endVec, startVec).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);

        return { start: startVec, end: endVec, len: length, midpoint: mid, quaternion: quat };
    }, [contraction]);

    // Define Hook Shape (J-Curve) - Static geometry
    const hookCurve = useMemo(() => {
        return new THREE.CatmullRomCurve3([
            new THREE.Vector3(0, -0.015, 0),    // Below Eye
            new THREE.Vector3(0, -0.12, 0),     // Shank Bottom
            new THREE.Vector3(-0.01, -0.14, 0), // Curve Start
            new THREE.Vector3(-0.04, -0.14, 0), // Curve Bottom
            new THREE.Vector3(-0.05, -0.10, 0), // Point Tip Base
        ]);
    }, []);

    return (
        /* ADJUST POSITION OF THREAD AND HOOK TOGETHER HERE [X, Y, Z] */
        <group position={[0, 0.1, 0.5]}>
            {/* The Thread - Optimized from Tube to Cylinder */}
            <mesh position={midpoint} quaternion={quaternion} scale={[1, len, 1]}>
                <cylinderGeometry args={[0.003, 0.003, 1, 8]} />
                <meshStandardMaterial color="#f0f0f0" roughness={0.5} />
            </mesh>

            {/* The Metal Hook (J-Shape) - Attached to start point */}
            <group position={start} rotation={[0, 0, 0.1]}>
                <Torus args={[0.015, 0.003, 8, 16]} rotation={[0, Math.PI / 2, 0]}>
                    <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
                </Torus>
                <Tube args={[hookCurve, 32, 0.003, 8, false]}>
                    <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
                </Tube>
                <Cylinder args={[0.001, 0.003, 0.02]} position={[-0.052, -0.09, 0]} rotation={[0, 0, -0.2]}>
                    <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
                </Cylinder>
                <Cone args={[0.002, 0.01, 8]} position={[-0.052, -0.10, 0]} rotation={[0, 0, 2.8]}>
                    <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
                </Cone>
            </group>
        </group>
    );
};

// --- Kymograph Drum ---
const CardiogramKymograph = ({
    simTime,
    waveformValue,
    isRecording,
    onHoverChange,
    resetKey,
    drumSpeed,
}: {
    simTime: number,
    waveformValue: number,
    isRecording: boolean,
    onHoverChange?: (l: string | null) => void,
    resetKey: number,
    drumSpeed: number,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const lastDrawState = useRef<{ x: number, y: number } | null>(null);
    const texture = useMemo(() => {
        const canvas = canvasRef.current;
        canvas.width = 2048;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 2048, 512);
            // Soot coating effect
            ctx.fillStyle = '#0d0d0d';
            for (let i = 0; i < 200; i++) {
                ctx.fillRect(Math.random() * 2048, Math.random() * 512, Math.random() * 4, Math.random() * 4);
            }
        }
        return new THREE.CanvasTexture(canvas);
    }, []);

    useEffect(() => {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, 2048, 512);
            ctx.fillStyle = '#0d0d0d';
            for (let i = 0; i < 200; i++) {
                ctx.fillRect(Math.random() * 2048, Math.random() * 512, Math.random() * 4, Math.random() * 4);
            }
            texture.needsUpdate = true;
        }
        lastDrawState.current = null;
    }, [resetKey, texture]);

    useFrame(() => {
        if (!isRecording) { lastDrawState.current = null; return; }
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const SPEED_SCALE = 15.0;
        const x = 80 + ((simTime / 1000) * drumSpeed * SPEED_SCALE);
        const y = (512 * 0.50) - (waveformValue * 30); // Baseline centered on drum

        if (lastDrawState.current) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 1;
            ctx.beginPath();
            ctx.moveTo(lastDrawState.current.x, lastDrawState.current.y);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.shadowBlur = 0;
            texture.needsUpdate = true;
        }
        lastDrawState.current = { x, y };
    });

    const drumRef = useRef<THREE.Group>(null);
    useFrame(() => {
        if (drumRef.current && isRecording) {
            // Calculate current X position again to sync rotation exactly
            const SPEED_SCALE = 15.0;
            const x = 80 + ((simTime / 1000) * drumSpeed * SPEED_SCALE);

            // Map X position (0 to 2048) to Angle (0 to 2*PI)
            const angle = ((x - 80) / 2048) * (2 * Math.PI);

            const baseRotation = 1.8 + Math.PI;
            drumRef.current.rotation.y = baseRotation - angle;
        }
    });

    return (
        <InteractiveObject label="Kymograph Drum" onHoverChange={onHoverChange}>
            <group position={[0, 0, 0]}>
                {/* Drum */}
                <group ref={drumRef} rotation={[0, 1.8 + Math.PI, 0]}>
                    <Cylinder args={[1.0, 1.0, 2.5, 64]}>
                        <meshBasicMaterial attach="material-0" map={texture} />
                        <meshStandardMaterial attach="material-1" color="#111" />
                        <meshStandardMaterial attach="material-2" color="#111" />
                    </Cylinder>
                </group>
                {/* Central shaft */}
                <Cylinder args={[0.06, 0.06, 3.5]} position={[0, -0.15, 0]}>
                    <meshStandardMaterial color="#1e293b" metalness={0.8} />
                </Cylinder>
                {/* Motor base */}
                <Box args={[1.2, 0.45, 1.5]} position={[0, -1.75, 0]}>
                    <meshStandardMaterial color="#0f172a" metalness={0.3} roughness={0.6} />
                </Box>

            </group>
        </InteractiveObject>
    );
};

// --- Ringer's Solution Tray ---
const SolutionTray = ({ temperature, onHoverChange }: { temperature: number, onHoverChange?: (l: string | null) => void }) => {
    const liquidColor = useMemo(() => {
        if (temperature <= 15) return '#a5d8ff';
        if (temperature >= 35) return '#ffb3b3';
        return '#a5f3fc';
    }, [temperature]);

    return (
        <InteractiveObject label={`Ringer's Solution Tray (${temperature}°C)`} onHoverChange={onHoverChange}>
            <group position={[0, -0.42, 0]}>
                {/* Tray */}
                <Box args={[1.0, 0.08, 0.8]} position={[0, 0, 0]}>
                    <meshPhysicalMaterial color="#cbd5e1" roughness={0.1} transmission={0.2} thickness={0.3} />
                </Box>
                {/* Walls */}
                <Box args={[1.0, 0.15, 0.05]} position={[0, 0.07, 0.375]}>
                    <meshPhysicalMaterial color="#ffffff" transmission={0.85} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                </Box>
                <Box args={[1.0, 0.15, 0.05]} position={[0, 0.07, -0.375]}>
                    <meshPhysicalMaterial color="#ffffff" transmission={0.85} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                </Box>
                <Box args={[0.05, 0.15, 0.7]} position={[0.475, 0.07, 0]}>
                    <meshPhysicalMaterial color="#ffffff" transmission={0.85} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                </Box>
                <Box args={[0.05, 0.15, 0.7]} position={[-0.475, 0.07, 0]}>
                    <meshPhysicalMaterial color="#ffffff" transmission={0.85} opacity={1} roughness={0} thickness={0.1} clearcoat={1} />
                </Box>
                {/* Liquid */}
                <Box args={[0.9, 0.06, 0.65]} position={[0, 0.06, 0]}>
                    <meshPhysicalMaterial color={liquidColor} transmission={0.85} opacity={0.6} transparent roughness={0.05} ior={1.33} />
                </Box>
            </group>
        </InteractiveObject>
    );
};

// --- Cardiogram Graph Component (Oscilloscope Style) ---
const CardiogramGraph = ({
    data,
    temperature,
    isRecording,
    selectedExperiment,
    drumSpeed,
    heartRate,
}: {
    data: { t: number; y: number }[];
    temperature: number;
    isRecording: boolean;
    selectedExperiment: string;
    drumSpeed: number;
    heartRate: number;
}) => {
    const preset = TEMPERATURE_PRESETS.find(p => p.value === temperature) || TEMPERATURE_PRESETS[1];

    // Oscilloscope Colors
    const traceColor = "#4ade80"; // Bright Green (Tailwind green-400)
    const gridColor = "#14532d"; // Dark Green (green-900)
    const gridColorMajor = "#166534"; // Slightly lighter (green-800)
    const bgColor = "#020617"; // Very dark slate/black (slate-950)

    const svgWidth = 900;
    const svgHeight = 320;
    const margin = { top: 110, right: 20, bottom: 40, left: 40 };
    const plotW = svgWidth - margin.left - margin.right;
    const plotH = svgHeight - margin.top - margin.bottom;

    // Y range: -2.5 to 3.5
    const yMin = -2.5;
    const yMax = 3.5;
    const yScale = (y: number) => margin.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // X range: show a scrolling window of ~24 seconds for compressed view (more waves visible) at regular speed (2.5mm/s)
    // Adjust window size inversely to drum speed: Slower drum = More time visible (squashed waves)
    const BASE_SPEED = 2.5;
    const BASE_WINDOW = 24000;
    const WINDOW_MS = BASE_WINDOW * (BASE_SPEED / Math.max(0.5, drumSpeed));

    const latestT = data.length > 0 ? data[data.length - 1].t : 0;
    const windowStart = Math.max(0, latestT - WINDOW_MS);
    const windowEnd = Math.max(WINDOW_MS, latestT + 200);
    const xScale = (t: number) => margin.left + ((t - windowStart) / (windowEnd - windowStart)) * plotW;

    // Filter visible data
    const visibleData = data.filter(d => d.t >= windowStart - 500);

    // Create path
    const pathD = visibleData.length > 1
        ? `M ${visibleData.map(d => `${xScale(d.t)},${yScale(d.y)}`).join(' L ')}`
        : '';

    // Graticule (Grid)
    // Vertical: Time (every 0.5s)
    const timeMarkers: number[] = [];
    const startTick = Math.ceil(windowStart / 500) * 500;
    // Limit grid lines to avoid lagging if window is huge
    const gridStep = WINDOW_MS > 60000 ? 5000 : (WINDOW_MS > 30000 ? 1000 : 500);

    for (let t = startTick; t <= windowEnd; t += gridStep) {
        timeMarkers.push(t);
    }
    // Horizontal: Voltage
    const hGridValues = [0, 1.0, 2.0, 3.0];

    return (
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* Background (Phosphor Screen) */}
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill={bgColor} rx={8} />

            {/* CRT Scanline Effect (subtle overlay) */}
            <pattern id="scanlines" patternUnits="userSpaceOnUse" width="4" height="4">
                <line x1="0" y1="0" x2="4" y2="0" stroke="#000" strokeOpacity="0.2" strokeWidth="1" />
            </pattern>
            <rect x={0} y={0} width={svgWidth} height={svgHeight} fill="url(#scanlines)" pointerEvents="none" />

            {/* Scale Grid (Graticule) */}
            {/* Horizontal */}
            {hGridValues.map((val, i) => (
                <line key={`hgrid-${i}`} x1={margin.left} y1={yScale(val)} x2={svgWidth - margin.right} y2={yScale(val)}
                    stroke={val === 0 ? gridColorMajor : gridColor} strokeWidth={1} />
            ))}
            {/* Vertical */}
            {timeMarkers.map((t, i) => (
                <line key={`tmark-${i}`} x1={xScale(t)} y1={margin.top} x2={xScale(t)} y2={svgHeight - margin.bottom}
                    stroke={t % 1000 === 0 ? gridColorMajor : gridColor} strokeWidth={1} />
            ))}

            {/* Trace with Glow */}
            <defs>
                <filter id="oscilloscopeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
                <marker id="arrowAmber" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
                <marker id="arrowBlue" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
                </marker>
            </defs>
            <path d={pathD} fill="none" stroke={traceColor} strokeWidth={2} filter="url(#oscilloscopeGlow)" />

            {/* Wave Labels */}
            {(() => {
                const params = getTemperatureParams(temperature, selectedExperiment);
                const periodMs = params.periodMs;

                // Wave 3 (cycleIndex 2) — Extra Systole label
                const wave3MidT = periodMs * 2 + periodMs * 0.16; // Peak of atrial systole dip
                const wave3X = xScale(wave3MidT);
                // Compensatory Pause — flat section of wave 3 (from ~0.4 to 1.0 of the cycle)
                const pauseMidT = periodMs * 2 + periodMs * 0.7;
                const pauseX = xScale(pauseMidT);
                // Treppe — waves 4-7 (cycleIndex 3-6), label centered
                const treppeMidT = periodMs * 3 + periodMs * 2; // middle of waves 4-7
                const treppeStartT = periodMs * 3;
                const treppeEndT = periodMs * 7;
                const treppeStartX = xScale(treppeStartT);
                const treppeEndX = xScale(treppeEndT);
                const treppeMidX = (treppeStartX + treppeEndX) / 2;

                if (data.length === 0) return null;

                // For most experiments, show labels only after recording is done
                // But for Summation, we want live stimulus ticks
                if (isRecording && selectedExperiment !== 'summation') return null;

                if (selectedExperiment === 'extra-systole') {
                    return (
                        <>
                            {/* Extra Systole: label BELOW → arrow pointing UP to dip */}
                            <g>
                                <text x={wave3X} y={yScale(-2) + 110} textAnchor="middle" fill="#f59e0b" fontSize={24} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                    Extra Systole
                                </text>
                                {/* Manual Arrow UP */}
                                <line x1={wave3X} y1={yScale(-2) + 85} x2={wave3X} y2={yScale(-2) + 12}
                                    stroke="#f59e0b" strokeWidth={3} />
                                <path d={`M ${wave3X - 10} ${yScale(-2) + 22} L ${wave3X} ${yScale(-2) + 8} L ${wave3X + 10} ${yScale(-2) + 22}`}
                                    fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinejoin="round" />
                            </g>

                            {/* Compensatory Pause: Label ABOVE → arrow pointing DOWN */}
                            <g>
                                <text x={pauseX} y={yScale(3.0) - 90} textAnchor="middle" fill="#38bdf8" fontSize={24} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                    Compensatory Pause
                                </text>
                                {/* Manual Arrow DOWN */}
                                <line x1={pauseX} y1={yScale(3.0) - 65} x2={pauseX} y2={yScale(3.0) - 10}
                                    stroke="#38bdf8" strokeWidth={3} />
                                <path d={`M ${pauseX - 10} ${yScale(3.0) - 22} L ${pauseX} ${yScale(3.0) - 8} L ${pauseX + 10} ${yScale(3.0) - 22}`}
                                    fill="none" stroke="#38bdf8" strokeWidth={3} strokeLinejoin="round" />
                            </g>

                            {/* Treppe: bracket + label below */}
                            <g>
                                <line x1={treppeStartX} y1={svgHeight - margin.bottom + 15} x2={treppeEndX} y2={svgHeight - margin.bottom + 15}
                                    stroke="#c084fc" strokeWidth={3} />
                                <line x1={treppeStartX} y1={svgHeight - margin.bottom + 5} x2={treppeStartX} y2={svgHeight - margin.bottom + 25}
                                    stroke="#c084fc" strokeWidth={3} />
                                <line x1={treppeEndX} y1={svgHeight - margin.bottom + 5} x2={treppeEndX} y2={svgHeight - margin.bottom + 25}
                                    stroke="#c084fc" strokeWidth={3} />
                                <text x={treppeMidX} y={svgHeight - margin.bottom + 65} textAnchor="middle" fill="#c084fc" fontSize={26} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                    Treppe (Staircase)
                                </text>
                            </g>
                        </>
                    );
                }

                if (selectedExperiment === 'summation') {
                    // Summation Labels & Signal Marker
                    const params = getTemperatureParams(temperature, selectedExperiment); // Ensure we have params
                    const periodMs = params.periodMs;

                    const t0 = 0; // Cycle 0
                    const tSingleSub = periodMs * 2; // Cycle 2 Start (Sub-threshold)
                    const tSummationStart = periodMs * 4; // Cycle 4 Start (Summation)

                    const x0 = xScale(t0);

                    // Signal Marker Trace Y position
                    const markerY = svgHeight - margin.bottom + 40;

                    // Ticks for Stimuli
                    const ticks = [];
                    // 1. Initial Threshold Tick
                    ticks.push(0);

                    // 2. Single Sub-threshold Tick (at Cycle 2)
                    ticks.push(tSingleSub);

                    // 3. Burst Ticks (5 ticks before tSummationStart)
                    for (let i = 0; i < 5; i++) {
                        ticks.push(tSummationStart - 1250 + (i * 250));
                    }

                    // Filter ticks: Only show those that have occurred (t <= latestT)
                    const visibleTicks = ticks.filter(t => !isRecording || t <= latestT);

                    // Signal Line: visible portion baseline
                    // If recording, draw line up to latestT
                    const lineEndX = isRecording ? Math.min(svgWidth - margin.right, xScale(latestT)) : svgWidth - margin.right;
                    const lineStartX = margin.left;

                    return (
                        <>
                            {/* Signal Marker Line */}
                            {(lineEndX > lineStartX) &&
                                <line x1={lineStartX} y1={markerY} x2={lineEndX} y2={markerY} stroke="#ef4444" strokeWidth={2} />
                            }

                            {/* Ticks */}
                            {visibleTicks.map((t, i) => (
                                <line key={i} x1={xScale(t)} y1={markerY - 10} x2={xScale(t)} y2={markerY + 10} stroke="#ef4444" strokeWidth={2} />
                            ))}

                            {/* Label: Threshold Stimulus */}
                            {(!isRecording || latestT >= t0) && (
                                <g>
                                    <text x={x0} y={markerY + 100} textAnchor="start" fill="#22c55e" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                        Threshold
                                    </text>
                                    {/* Arrow pointing UP to tick */}
                                    <line x1={x0 + 5} y1={markerY + 75} x2={x0} y2={markerY + 15} stroke="#22c55e" strokeWidth={2} strokeDasharray="4 2" />
                                    <path d={`M ${x0 - 4} ${markerY + 20} L ${x0} ${markerY + 12} L ${x0 + 4} ${markerY + 20}`} fill="none" stroke="#22c55e" strokeWidth={2} />
                                </g>
                            )}

                            {/* Label: Sub-threshold (Staggered Down) */}
                            {(!isRecording || latestT >= tSingleSub) && (
                                <g>
                                    <text x={xScale(tSingleSub)} y={markerY + 100} textAnchor="middle" fill="#fbbf24" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                        Sub-threshold
                                    </text>
                                    {/* Arrow pointing UP to tick */}
                                    <line x1={xScale(tSingleSub)} y1={markerY + 75} x2={xScale(tSingleSub)} y2={markerY + 15} stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 2" />
                                    <path d={`M ${xScale(tSingleSub) - 4} ${markerY + 20} L ${xScale(tSingleSub)} ${markerY + 12} L ${xScale(tSingleSub) + 4} ${markerY + 20}`} fill="none" stroke="#fbbf24" strokeWidth={2} />
                                </g>
                            )}

                            {/* Label: Summation (Bracket and Label) */}
                            {(!isRecording || latestT >= (tSummationStart - 1250)) && (
                                <g>
                                    {/* Bracket under the 5 ticks */}
                                    {/* Ticks span from (tSummationStart - 1250) to (tSummationStart - 250) approx */}
                                    <line x1={xScale(tSummationStart - 1250)} y1={markerY + 15} x2={xScale(tSummationStart - 250)} y2={markerY + 15} stroke="#ef4444" strokeWidth={2} />
                                    <line x1={xScale(tSummationStart - 1250)} y1={markerY + 10} x2={xScale(tSummationStart - 1250)} y2={markerY + 20} stroke="#ef4444" strokeWidth={2} />
                                    <line x1={xScale(tSummationStart - 250)} y1={markerY + 10} x2={xScale(tSummationStart - 250)} y2={markerY + 20} stroke="#ef4444" strokeWidth={2} />

                                    <text x={xScale(tSummationStart - 1250)} y={markerY + 40} textAnchor="start" fill="#ef4444" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                        Summation (5 subthreshold)
                                    </text>
                                </g>
                            )}
                        </>
                    );
                }

                if (selectedExperiment === 'staircase') {
                    // Treppe: bracket + label below
                    const treppeStartT = 0;
                    const treppeEndT = periodMs * 4;
                    const treppeStartX = xScale(treppeStartT);
                    const treppeEndX = xScale(treppeEndT);
                    const treppeMidX = (treppeStartX + treppeEndX) / 2;

                    return (
                        <g>
                            <line x1={treppeStartX} y1={svgHeight - margin.bottom + 15} x2={treppeEndX} y2={svgHeight - margin.bottom + 15}
                                stroke="#c084fc" strokeWidth={3} />
                            <line x1={treppeStartX} y1={svgHeight - margin.bottom + 5} x2={treppeStartX} y2={svgHeight - margin.bottom + 25}
                                stroke="#c084fc" strokeWidth={3} />
                            <line x1={treppeEndX} y1={svgHeight - margin.bottom + 5} x2={treppeEndX} y2={svgHeight - margin.bottom + 25}
                                stroke="#c084fc" strokeWidth={3} />
                            <text x={treppeMidX} y={svgHeight - margin.bottom + 65} textAnchor="middle" fill="#c084fc" fontSize={26} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                Treppe (Staircase)
                            </text>
                        </g>
                    );
                }

                if (selectedExperiment === 'heart-block') {
                    // Stannius Ligatures Labels
                    const lig1Start = 6666;
                    const lig1End = 13333;
                    const lig1Mid = (lig1Start + lig1End) / 2;
                    const lig1X = xScale(lig1Mid);

                    const lig2Start = 23333;
                    const lig2End = 33333;
                    const lig2Mid = (lig2Start + lig2End) / 2;
                    const lig2X = xScale(lig2Mid);

                    return (
                        <>
                            {/* 1st Ligature Label - Moved Up */}
                            <g>
                                <text x={lig1X} y={yScale(3.0) - 130} textAnchor="middle" fill="#f59e0b" fontSize={24} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                    1st Stannius Ligature
                                </text>
                                <line x1={lig1X} y1={yScale(3.0) - 105} x2={lig1X} y2={yScale(3.0) - 12}
                                    stroke="#f59e0b" strokeWidth={3} />
                                <path d={`M ${lig1X - 10} ${yScale(3.0) - 22} L ${lig1X} ${yScale(3.0) - 8} L ${lig1X + 10} ${yScale(3.0) - 22}`}
                                    fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinejoin="round" />
                            </g>

                            {/* 2nd Ligature Label - Moved Down */}
                            <g>
                                <text x={lig2X} y={yScale(3.0) - 70} textAnchor="middle" fill="#38bdf8" fontSize={24} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                    2nd Stannius Ligature
                                </text>
                                <line x1={lig2X} y1={yScale(3.0) - 45} x2={lig2X} y2={yScale(3.0) - 12}
                                    stroke="#38bdf8" strokeWidth={3} />
                                <path d={`M ${lig2X - 10} ${yScale(3.0) - 22} L ${lig2X} ${yScale(3.0) - 8} L ${lig2X + 10} ${yScale(3.0) - 22}`}
                                    fill="none" stroke="#38bdf8" strokeWidth={3} strokeLinejoin="round" />
                            </g>

                            {/* Heart Rate Labels */}
                            <text x={xScale(3333)} y={svgHeight - 15} textAnchor="middle" fill="#a3e635" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                36 BPM
                            </text>
                            <text x={xScale(18333)} y={svgHeight - 15} textAnchor="middle" fill="#a3e635" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                24 BPM
                            </text>
                            <text x={xScale(45000)} y={svgHeight - 15} textAnchor="middle" fill="#a3e635" fontSize={18} fontFamily="monospace" fontWeight="bold">
                                12 BPM
                            </text>
                        </>
                    );
                }

                if (selectedExperiment === 'all-or-none') {
                    const cycleDuration = params.periodMs + 4000;
                    const labels = ["Sub threshold", "Threshold", "Maximal", "Supramaximal"];
                    return (
                        <>
                            {labels.map((label, i) => {
                                const x = xScale(i * cycleDuration);
                                const isAlt = i % 2 === 1;
                                const yPos = isAlt ? 35 : 75;
                                const lineY1 = isAlt ? 50 : 90;
                                return (
                                    <g key={`all-none-${i}`}>
                                        <text x={x} y={yPos} textAnchor={i === 0 ? "start" : "middle"} fill="#facc15" fontSize={22} fontFamily="monospace" fontWeight="bold" style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))' }}>
                                            {label}
                                        </text>
                                        <line x1={i === 0 ? x + 10 : x} y1={lineY1} x2={i === 0 ? x + 10 : x} y2={yScale(3.0) - 12} stroke="#facc15" strokeWidth={3} />
                                        {/* Downward Arrowhead */}
                                        <path d={`M ${(i === 0 ? x + 10 : x) - 7} ${yScale(3.0) - 24} L ${i === 0 ? x + 10 : x} ${yScale(3.0) - 10} L ${(i === 0 ? x + 10 : x) + 7} ${yScale(3.0) - 24}`} fill="none" stroke="#facc15" strokeWidth={3} />
                                    </g>
                                );
                            })}
                        </>
                    );
                }

                return null;
            })()}

            {/* Rate Info */}
            <text x={svgWidth - margin.right - 10} y={margin.top + 20} textAnchor="end" fill={traceColor} fontSize={14} fontFamily="monospace" fontWeight="bold">
                HR: {heartRate} BPM
            </text>
            <text x={svgWidth - margin.right - 10} y={margin.top + 40} textAnchor="end" fill={gridColorMajor} fontSize={12} fontFamily="monospace">
                T: {temperature}°C
            </text>

            {/* Recording Indicator */}
            {
                isRecording && (
                    <text x={margin.left + 10} y={margin.top + 20} fill="#ef4444" fontSize={14} fontFamily="monospace" fontWeight="bold">
                        ● REC
                    </text>
                )
            }
        </svg >
    );
};



// --- Tap Key (for Summation Experiment) ---
const TapKey = ({ isPressed, onHoverChange }: { isPressed: boolean, onHoverChange?: (l: string | null) => void }) => {
    const leverRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (leverRef.current) {
            // Animate key press
            // Resting: rotation.z = 0.2 (up) - restored per user request
            // Pressed: rotation.z = 0.05 (down, touching contact)
            const targetRot = isPressed ? 0.05 : 0.2;
            // Smoother response (delta * 10)
            leverRef.current.rotation.z = THREE.MathUtils.lerp(leverRef.current.rotation.z, targetRot, delta * 10);
        }
    });

    return (
        <InteractiveObject label="Tap Key (Stimulus)" onHoverChange={onHoverChange}>
            {/* Positioned on the table, to the right of the board */}
            {/* Adjusted position to be clearer */}
            <group position={[2.8, -0.68, 0.8]} rotation={[0, -0.2, 0]}>

                {/* Base (Black Bakelite Rectangular Block) */}
                <Box args={[1.4, 0.12, 0.7]} position={[0, 0.06, 0]}>
                    <meshStandardMaterial color="#111" roughness={0.2} metalness={0.1} />
                </Box>

                {/* Terminals (Black Binding Posts) */}
                {/* Left Post */}
                <group position={[-0.5, 0.12, 0.15]}>
                    {/* Base washer/nut */}
                    <Cylinder args={[0.05, 0.05, 0.02]} position={[0, 0, 0]}> <meshStandardMaterial color="#d4af37" metalness={0.8} /> </Cylinder>
                    {/* Post body (Black plastic cone/cylinder) */}
                    <Cylinder args={[0.05, 0.07, 0.25]} position={[0, 0.12, 0]}>
                        <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
                    </Cylinder>
                    {/* Top screw head */}
                    <Cylinder args={[0.02, 0.02, 0.05]} position={[0, 0.26, 0]}> <meshStandardMaterial color="#d4af37" metalness={0.8} /> </Cylinder>
                </group>

                {/* Right Post */}
                <group position={[0.5, 0.12, 0.15]}>
                    <Cylinder args={[0.05, 0.05, 0.02]} position={[0, 0, 0]}> <meshStandardMaterial color="#d4af37" metalness={0.8} /> </Cylinder>
                    <Cylinder args={[0.05, 0.07, 0.25]} position={[0, 0.12, 0]}>
                        <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
                    </Cylinder>
                    <Cylinder args={[0.02, 0.02, 0.05]} position={[0, 0.26, 0]}> <meshStandardMaterial color="#d4af37" metalness={0.8} /> </Cylinder>
                </group>

                {/* Metal Strip Lever Mechanism */}
                {/* Attached at left side */}
                <group position={[-0.4, 0.12, -0.1]}>
                    {/* Mounting Plate */}
                    <Box args={[0.2, 0.01, 0.3]} position={[0, 0, 0]}>
                        <meshStandardMaterial color="#c0c0c0" metalness={0.8} />
                    </Box>
                    {/* Screw holding the strip */}
                    <Cylinder args={[0.02, 0.02, 0.05]} position={[0, 0.02, 0]}>
                        <meshStandardMaterial color="#c0c0c0" metalness={0.8} />
                    </Cylinder>

                    {/* The Lever Arm */}
                    <group ref={leverRef} rotation={[0, 0, 0.2]}>
                        {/* The Metal Strip itself */}
                        <Box args={[1.1, 0.015, 0.12]} position={[0.55, 0, 0]}>
                            <meshStandardMaterial color="#e2e8f0" metalness={0.7} roughness={0.3} />
                        </Box>

                        {/* Knob Assembly at the end */}
                        <group position={[1.0, 0.01, 0]}>
                            {/* Stem */}
                            <Cylinder args={[0.015, 0.015, 0.15]} position={[0, 0.08, 0]}>
                                <meshStandardMaterial color="#111" />
                            </Cylinder>
                            {/* The Big Knob (Black, serrated) */}
                            <Cylinder args={[0.15, 0.15, 0.08]} position={[0, 0.16, 0]}>
                                <meshStandardMaterial color="#111" roughness={0.6} />
                            </Cylinder>
                            {/* Contact Point underneath strip */}
                            <Cylinder args={[0.02, 0.02, 0.06]} position={[0, -0.04, 0]}>
                                <meshStandardMaterial color="#d4af37" metalness={0.8} />
                            </Cylinder>
                        </group>
                    </group>
                </group>

                {/* Contact Anvil on Base (where the key hits) */}
                <group position={[0.6, 0.12, -0.1]}>
                    {/* Base plate */}
                    <Box args={[0.15, 0.01, 0.15]} position={[0, 0, 0]}>
                        <meshStandardMaterial color="#d4af37" metalness={0.8} />
                    </Box>
                    {/* Contact stud */}
                    <Cylinder args={[0.03, 0.03, 0.06]} position={[0, 0.03, 0]}>
                        <meshStandardMaterial color="#d4af37" metalness={0.8} />
                    </Cylinder>
                </group>

                {/* Wires (simplified visual connection) */}
                <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(-0.5, 0.12, 0.15), new THREE.Vector3(-0.6, 0.12, 0.3)]), 8, 0.01, 8, false]}>
                    <meshStandardMaterial color="#333" />
                </Tube>
                <Tube args={[new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, 0.12, 0.15), new THREE.Vector3(0.6, 0.12, 0.3)]), 8, 0.01, 8, false]}>
                    <meshStandardMaterial color="#333" />
                </Tube>

            </group>
        </InteractiveObject>
    );
};

// --- Main Component ---
export const PropertiesOfCardiacMuscle: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [temperature, setTemperature] = useState(25);
    const [selectedExperiment, setSelectedExperiment] = useState('heart-block');
    const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
    const [resetKey, setResetKey] = useState(0);
    const [drumSpeed, setDrumSpeed] = useState(2.5); // mm/sec
    const [mobileView, setMobileView] = useState<'3d' | 'graph'>('3d');
    const [isDropperActive, setIsDropperActive] = useState(false);
    const [soundMuted, setSoundMuted] = useState(false);
    const [currentPhase, setCurrentPhase] = useState(0);
    const [heartSilent, setHeartSilent] = useState(false);
    const [sceneBgColor, setSceneBgColor] = useState('#CBD5E1');

    const [simState, setSimState] = useState<CardiogramState>({
        time: 0,
        isRecording: false,
        data: [],
        currentContraction: 3.0,
        heartRate: 24,
        temperature: 25
    });

    const animationFrameRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    const dataRef = useRef<{ t: number; y: number }[]>([]);

    const SAMPLE_INTERVAL = 20; // ms between data points (50 samples/sec)
    const lastSampleTimeRef = useRef<number>(0);
    const temperatureRef = useRef(temperature);

    // Heartbeat sound hook
    const { ensureAudioContext } = useHeartbeatSound({
        isRecording: simState.isRecording,
        phase: currentPhase,
        volume: 1.0,
        muted: soundMuted,
        silent: heartSilent,
    });

    // Keep temperature ref in sync
    useEffect(() => {
        temperatureRef.current = temperature;
    }, [temperature]);

    // Handle temperature change
    const handleTemperatureChange = (newTemp: number) => {
        setTemperature(newTemp);
        // Show dropper animation briefly
        setIsDropperActive(true);
        setTimeout(() => setIsDropperActive(false), 2000);
    };

    // Enforce specific drum speeds for experiments
    useEffect(() => {
        if (selectedExperiment === 'heart-block') {
            setDrumSpeed(1.0);
        } else if (selectedExperiment === 'all-or-none') {
            setDrumSpeed(1.5);
        } else {
            setDrumSpeed(2.5); // Default for Summation, Staircase, etc.
        }
    }, [selectedExperiment]);

    const handleStartRecording = () => {
        if (simState.isRecording) return;
        ensureAudioContext(); // Initialize audio on user gesture
        dataRef.current = [];
        lastSampleTimeRef.current = 0;
        setSimState({
            time: 0,
            isRecording: true,
            data: [],
            currentContraction: 3.0,
            heartRate: getTemperatureParams(temperature, selectedExperiment).hr,
            temperature
        });
        setResetKey(prev => prev + 1);
        startTimeRef.current = 0;
    };

    const handleStopRecording = () => {
        setSimState(prev => ({ ...prev, isRecording: false }));
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };

    const handleReset = () => {
        dataRef.current = [];
        lastSampleTimeRef.current = 0;
        setSimState({
            time: 0,
            isRecording: false,
            data: [],
            currentContraction: 3.0,
            heartRate: getTemperatureParams(temperature, selectedExperiment).hr,
            temperature
        });
        setResetKey(prev => prev + 1);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };

    // Simulation loop
    useEffect(() => {
        if (!simState.isRecording) {
            setSimState(prev => ({
                ...prev,
                heartRate: getTemperatureParams(temperature, selectedExperiment).hr
            }));
            return;
        }

        let lastTime = Date.now();
        let simTime = 0;
        startTimeRef.current = Date.now();

        const loop = () => {
            const now = Date.now();
            const dt = now - lastTime;
            lastTime = now;
            simTime += dt;

            const params = getTemperatureParams(temperatureRef.current, selectedExperiment);

            // Custom time/phase logic for Heart Block (Variable HR)
            let cycleIndex = 0;
            let phase = 0;
            let currentHr = params.hr;

            if (selectedExperiment === 'heart-block') {
                const period1 = (60 / 36) * 1000; // 36 BPM
                const limit1 = 8; // Cycles 0-7 (4 beat + 4 pause)
                const splitTime1 = limit1 * period1;

                const period2 = (60 / 24) * 1000; // 24 BPM
                const limit2 = 8; // Cycles 8-15 (4 beat + 4 pause)
                const splitTime2 = splitTime1 + (limit2 * period2);

                if (simTime < splitTime1) {
                    cycleIndex = Math.floor(simTime / period1);
                    phase = (simTime % period1) / period1;
                    currentHr = 36;
                } else if (simTime < splitTime2) {
                    const relTime = simTime - splitTime1;
                    cycleIndex = limit1 + Math.floor(relTime / period2);
                    phase = (relTime % period2) / period2;
                    currentHr = 24;
                } else {
                    const period3 = (60 / 12) * 1000; // 12 BPM
                    const relTime = simTime - splitTime2;
                    cycleIndex = limit1 + limit2 + Math.floor(relTime / period3);
                    phase = (relTime % period3) / period3;
                    currentHr = 12;
                }

                if (cycleIndex >= 25) {
                    setSimState(prev => ({ ...prev, isRecording: false }));
                    return;
                }
            } else if (selectedExperiment === 'all-or-none') {
                const beatMs = params.periodMs;
                const pauseMs = 4000;
                const cycleDuration = beatMs + pauseMs;

                cycleIndex = Math.floor(simTime / cycleDuration);
                const timeInCycle = simTime % cycleDuration;

                if (timeInCycle < beatMs) {
                    phase = timeInCycle / beatMs;
                } else {
                    phase = -1; // Signal pause
                }

                if (cycleIndex >= 4) {
                    setSimState(prev => ({ ...prev, isRecording: false }));
                    return;
                }
            } else {
                // Standard logic
                cycleIndex = Math.floor(simTime / params.periodMs);
                phase = (simTime % params.periodMs) / params.periodMs;

                let maxCycles = 10;
                if (selectedExperiment === 'summation') {
                    maxCycles = 5; // Stop after cycle 4
                }

                if (cycleIndex >= maxCycles) {
                    setSimState(prev => ({ ...prev, isRecording: false }));
                    return;
                }
            }

            const waveValue = cardiogramWaveform(phase, params.amplitude, cycleIndex, selectedExperiment);
            const contraction = Math.max(0, waveValue);

            // Update phase and silent flag for heartbeat sound
            setCurrentPhase(phase);

            // Determine if heart is in a silent/flatline period
            let isSilent = false;
            if (selectedExperiment === 'heart-block') {
                // Stannius ligatures: pause during cycles 4-7 (1st ligature) and 12-15 (2nd ligature)
                isSilent = (cycleIndex >= 4 && cycleIndex <= 7) || (cycleIndex >= 12 && cycleIndex <= 15);
            } else if (selectedExperiment === 'summation') {
                // Gap cycles 1-3 and after cycle 5
                isSilent = (cycleIndex >= 1 && cycleIndex <= 3) || cycleIndex >= 6;
            } else if (selectedExperiment === 'all-or-none') {
                // Sub-threshold cycle 0 produces no contraction
                isSilent = cycleIndex === 0 || phase < 0;
            }
            setHeartSilent(isSilent);

            // Sample data at fixed intervals to avoid overwhelming the graph
            if (simTime - lastSampleTimeRef.current >= SAMPLE_INTERVAL) {
                lastSampleTimeRef.current = simTime;
                dataRef.current.push({ t: simTime, y: waveValue });
            }

            setSimState(prev => ({
                ...prev,
                time: simTime,
                currentContraction: contraction,
                heartRate: currentHr,
                data: dataRef.current,
                ligature1: selectedExperiment === 'heart-block' && cycleIndex >= 4,
                ligature2: selectedExperiment === 'heart-block' && cycleIndex >= 12
            }));

            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
        return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
    }, [simState.isRecording]); // Removed temperature from dependency array

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
            <header className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><ArrowLeft className="w-5 h-5" /></button>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent">Properties of Cardiac Muscle</h1>
                        <p className="text-slate-400 text-xs">Amphibian / Frog Heart — Effect of Temperature</p>
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
                            ? 'bg-slate-900 text-red-400 border-b-2 border-red-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <Eye className="w-4 h-4" />
                        <span>3D View</span>
                    </button>
                    <button
                        onClick={() => setMobileView('graph')}
                        className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 font-medium transition-all ${mobileView === 'graph'
                            ? 'bg-slate-900 text-red-400 border-b-2 border-red-400'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        <LineChart className="w-4 h-4" />
                        <span>Cardiogram</span>
                    </button>
                </div>

                {/* 3D View */}
                <div className={`flex-1 relative bg-black ${mobileView === 'graph' ? 'hidden lg:flex' : 'flex'}`}>
                    <Canvas shadows camera={{ position: [-3.82, 2.79, -4.95], fov: 38 }}>
                        <color attach="background" args={[sceneBgColor]} />
                        <Environment preset="city" />
                        <ambientLight intensity={0.6} color="#ffffff" />
                        <spotLight position={[10, 10, 5]} angle={0.3} penumbra={0.5} intensity={2} castShadow />
                        <pointLight position={[-5, 5, -3]} intensity={0.5} color="#ffeedd" />

                        <group position={[0, -1.2, 0]}>
                            {/* Frog & Board Assembly - Moved as a whole */}
                            <group position={[-0.5, 0, 0]}>
                                {/* Rotated Sub-Assembly: Board, Body, Heart */}
                                <group rotation={[0, -Math.PI * 0.5, 0]} position={[-0.01, -0.84, 0.25]}>
                                    {/* Myograph Board */}
                                    <MyographBoard onHoverChange={setHoveredLabel} />

                                    {/* Frog Body - Shifted Left to align with new Spring position (-0.8) */}
                                    <group position={[-0.2, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
                                        <FrogBody onHoverChange={setHoveredLabel} />
                                    </group>

                                    {/* Frog Heart - Aligned with Rotated Body Incision */}
                                    <group position={[0.3, 0.48, 0]} rotation={[0, -Math.PI / 2, 0]}>
                                        <FrogHeart
                                            contraction={simState.currentContraction}
                                            temperature={temperature}
                                            onHoverChange={setHoveredLabel}
                                            showLigature1={!!simState.ligature1}
                                            isTight1={simState.ligature1}
                                            showLigature2={!!simState.ligature2}
                                            isTight2={simState.ligature2}
                                        />
                                    </group>
                                </group>

                                {/* Thread from heart to lever (Aligns with x=-0.8) */}
                                <HeartThread contraction={simState.currentContraction} />

                                {/* Spring Loaded Lever */}
                                <SpringLoadedLever
                                    angle={(3.0 - simState.currentContraction) * 0.036}
                                    onHoverChange={setHoveredLabel}
                                />







                                {/* Tap Key (Visible only for Summation experiment) */}
                                {selectedExperiment === 'summation' && (
                                    <TapKey
                                        isPressed={
                                            simState.isRecording && (() => {
                                                const params = getTemperatureParams(temperature, selectedExperiment);
                                                const periodMs = params.periodMs;

                                                // Events (Same as Graph)
                                                // Cycle 0: Threshold
                                                // Cycle 1: Single Sub-threshold
                                                // Cycle 3: Gap
                                                // Cycle 4: Summation Start

                                                const tSingleSub = periodMs * 2;
                                                const tSummationStart = periodMs * 4;

                                                // 1. Initial Threshold Click at t=0
                                                const isThreshold = simState.time < 150;

                                                // 2. Single Sub-threshold Click (Cycle 2)
                                                // Duration 150ms
                                                const isSingleSub = (simState.time > tSingleSub && simState.time < tSingleSub + 150);

                                                // 3. Burst of Clicks BEFORE Cycle 4 (Summation)
                                                // Ticks are at: tSummationStart - 1250, -1000, -750, -500, -250
                                                // Start tapping 1.3s before Summation start
                                                const burstStart = tSummationStart - 1300;
                                                const burstEnd = tSummationStart;

                                                // Rapid clicks (every 250ms), key down for 100ms
                                                const isBurst = (simState.time > burstStart && simState.time < burstEnd && (simState.time % 250 < 100));

                                                return isThreshold || isSingleSub || isBurst;
                                            })()
                                        }
                                        onHoverChange={setHoveredLabel}
                                    />
                                )}

                                {/* Kymograph Drum - Moved further back (X=4.2) for better clarity */}
                                <group position={[4.395, 0.75, 0.05]}>
                                    <CardiogramKymograph
                                        simTime={simState.time}
                                        waveformValue={simState.currentContraction}
                                        isRecording={simState.isRecording}
                                        onHoverChange={setHoveredLabel}
                                        resetKey={resetKey}
                                        drumSpeed={drumSpeed}
                                    />
                                </group>
                            </group>
                        </group>

                        <OrbitControls makeDefault target={[0.20, -0.36, -0.44]} minPolarAngle={0} />
                    </Canvas>

                    {/* Hover Label */}
                    {hoveredLabel && (
                        <div className="absolute top-4 left-4 bg-slate-900/90 text-white px-3 py-1.5 rounded-full text-sm border border-slate-700 backdrop-blur-sm pointer-events-none animate-in fade-in duration-200">
                            {hoveredLabel}
                        </div>
                    )}
                </div>

                {/* Right Panel: Graph + Controls */}
                <div className="w-full lg:w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col flex-1 lg:flex-none">
                    {/* Cardiogram Graph */}
                    <div className={`flex-1 p-4 min-h-0 flex flex-col border-b border-slate-800 ${mobileView === '3d' ? 'hidden lg:flex' : 'flex'}`}>
                        <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-2">Oscilloscope View</h3>
                        <div className="flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative">
                            <CardiogramGraph
                                data={simState.data}
                                temperature={temperature}
                                isRecording={simState.isRecording}
                                selectedExperiment={selectedExperiment}
                                drumSpeed={drumSpeed}
                                heartRate={simState.heartRate}
                            />
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="p-4 lg:p-6 bg-slate-900 z-10 space-y-4 overflow-y-auto">


                        {/* Experiment Selection */}
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 mb-2">
                                <Activity className="w-4 h-4 text-emerald-400" /> Select Experiment
                            </label>
                            <select
                                value={selectedExperiment}
                                onChange={(e) => {
                                    const newExp = e.target.value;
                                    setSelectedExperiment(newExp);
                                    // Reset simulation state when experiment changes
                                    dataRef.current = [];
                                    lastSampleTimeRef.current = 0;
                                    setSimState({
                                        time: 0,
                                        isRecording: false,
                                        data: [],
                                        currentContraction: 3.0,
                                        heartRate: getTemperatureParams(temperature, newExp).hr,
                                        temperature
                                    });
                                    setResetKey(prev => prev + 1);
                                    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                                }}
                                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5 outline-none"
                            >
                                <option value="extra-systole">1. Extra systole and compensatory pause</option>
                                <option value="heart-block">2. Heart block: Stannius ligatures</option>
                                <option value="all-or-none">3. All or none law</option>
                                <option value="staircase">4. Stair case phenomenon</option>
                                <option value="summation">5. Summation of subliminal stimuli</option>
                            </select>
                        </div>

                        {/* Heart Rate & Sound Toggle */}
                        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full animate-pulse bg-emerald-500" />
                                <span className="text-sm text-slate-300">Heart Rate</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg font-mono font-bold text-emerald-400">
                                    {simState.heartRate} bpm
                                </span>
                                <button
                                    onClick={() => { ensureAudioContext(); setSoundMuted(m => !m); }}
                                    className={`p-1.5 rounded-lg transition-all border ${soundMuted
                                        ? 'bg-slate-700 border-slate-600 text-slate-500'
                                        : 'bg-red-900/40 border-red-700/50 text-red-400 hover:bg-red-900/60'
                                        }`}
                                    title={soundMuted ? 'Unmute heartbeat sound' : 'Mute heartbeat sound'}
                                >
                                    {soundMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Drum Speed */}
                        <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                            <div className="flex justify-between mb-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1.5">
                                    <Droplets className="w-3.5 h-3.5 text-cyan-400" /> Drum Speed
                                </label>
                                <span className="text-cyan-400 font-mono text-sm">{drumSpeed} mm/s</span>
                            </div>
                            <input
                                type="range" min="1" max="10" step="0.5" value={drumSpeed}
                                onChange={(e) => setDrumSpeed(Number(e.target.value))}
                                disabled={selectedExperiment === 'heart-block' || selectedExperiment === 'all-or-none'}
                                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 ${selectedExperiment === 'heart-block' || selectedExperiment === 'all-or-none' ? 'opacity-50 cursor-not-allowed bg-slate-700' : 'bg-slate-600'
                                    }`}
                            />
                            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                                <span>1 mm/s</span>
                                <span>10 mm/s</span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            {!simState.isRecording ? (
                                <button
                                    onClick={handleStartRecording}
                                    className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    <Play className="w-5 h-5" /> Start Recording
                                </button>
                            ) : (
                                <button
                                    onClick={handleStopRecording}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <Square className="w-5 h-5" /> Stop
                                </button>
                            )}
                            <button
                                onClick={handleReset}
                                className="px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" /> Reset
                            </button>
                        </div>


                    </div>
                </div>
            </main>
        </div>
    );
};
