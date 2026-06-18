import React, { useRef, useEffect, useState } from "react";
import { EnvType, SimulatorState, PhysicsParams, CartPoleState } from "../types";
import { normalizeAngle } from "../simulator";
import { ArrowLeftRight, Wind, RotateCw } from "lucide-react";

interface SimulationCanvasProps {
  envType: EnvType;
  state: SimulatorState;
  physicsParams: PhysicsParams;
  appliedForce: number; // Force applied by controller
  onManualPerturbation: (force: number) => void;
  controllerType: "rl" | "pid" | "manual";
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  envType,
  state,
  physicsParams,
  appliedForce,
  onManualPerturbation,
  controllerType,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 320 });
  const [isHovered, setIsHovered] = useState(false);
  const [dragForceValue, setDragForceValue] = useState<number | null>(null);

  // Resize listener
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({
          width: Math.max(300, width),
          height: 320,
        });
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Mouse interaction event handlers to "push" the system
  const handleCanvasInteraction = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const centerX = dimensions.width / 2;

    // Calculate interactive impact force based on click direction relative to center
    const dx = x - centerX;
    const pushForce = Math.max(-1, Math.min(1, dx / 150)) * physicsParams.maxForce * 1.5;
    
    onManualPerturbation(pushForce);
    setDragForceValue(pushForce);
    setTimeout(() => setDragForceValue(null), 350);
  };

  // Render loop based on states
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = dimensions;
    ctx.clearRect(0, 0, width, height);

    // DRAW BASE BACKGROUND GRID (Cyber Highlight Blue Theme)
    ctx.strokeStyle = "rgba(14, 165, 233, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "#0c1524";
    
    if (envType === "cartpole") {
      // 1. INVERTED PENDULUM ON A WHEELED BOX (CART-POLE) GRAPHICS
      const cpState = state as CartPoleState;
      const currentX = cpState.x || 0;
      const currentTheta = cpState.theta || 0;

      const trackLimit = 4.0;
      const scale = (width - 60) / (2 * trackLimit);
      const cx = width / 2;
      const trackY = height / 2 + 50;
      const rLength = 110; // rod rendering length

      // Draw horizontal track line
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - trackLimit * scale, trackY + 12);
      ctx.lineTo(cx + trackLimit * scale, trackY + 12);
      ctx.stroke();

      // Draw track end stops
      ctx.fillStyle = "#475569";
      ctx.fillRect(cx - trackLimit * scale - 4, trackY - 2, 8, 24);
      ctx.fillRect(cx + trackLimit * scale - 4, trackY - 2, 8, 24);

      // Cart coordinates
      const cartX = cx + currentX * scale;
      const cartW = 84;
      const cartH = 34;
      const cartY = trackY - cartH / 2;

      // Draw the cart (wheeled box)
      ctx.fillStyle = "#0d1527";
      ctx.strokeStyle = "#0284c7"; // Saturation highlighted blue
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(cartX - cartW / 2, cartY, cartW, cartH, 6);
      } else {
        ctx.rect(cartX - cartW / 2, cartY, cartW, cartH);
      }
      ctx.fill();
      ctx.stroke();

      // Draw wheels underneath cart
      const wheelR = 8;
      const wheelY = trackY + 12;
      const wheelOffset = 24;

      ctx.fillStyle = "#0284c7";
      ctx.strokeStyle = "#38bdf8"; // cyan light highlight
      ctx.lineWidth = 1.5;

      // Left wheel
      ctx.beginPath();
      ctx.arc(cartX - wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Right wheel
      ctx.beginPath();
      ctx.arc(cartX + wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Pole base joint pivot on cart
      const pivotX = cartX;
      const pivotY = cartY + 4;

      // Pole tip coordinates
      const tipX = pivotX + rLength * Math.sin(currentTheta);
      const tipY = pivotY - rLength * Math.cos(currentTheta);

      // Radial base angle helper arc (highlights upright balance zone)
      ctx.strokeStyle = "rgba(14, 165, 233, 0.15)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 35, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2);
      ctx.stroke();

      // Draw pole line (glowing dynamic rod matching angle stability)
      const absAngle = Math.abs(normalizeAngle(currentTheta));
      const inZone = absAngle < 0.18;
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(tipX, tipY);
      ctx.strokeStyle = inZone 
        ? "#0284c7"  // Saturation Highlight Blue (Active)
        : absAngle < 0.75 
          ? "#f97316" // Orange if swing/recovering
          : "#475569";  // Dark inactive slate
      ctx.lineWidth = 5.5;
      ctx.lineCap = "round";
      ctx.shadowColor = inZone ? "rgba(2, 132, 199, 0.7)" : "transparent";
      ctx.shadowBlur = inZone ? 16 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow

      // Draw weight at end (Bob)
      ctx.beginPath();
      ctx.arc(tipX, tipY, 18, 0, 2 * Math.PI);
      ctx.fillStyle = inZone ? "#0284c7" : "#1e293b";
      ctx.fill();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Pivot pin
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();

      // Show angle and position readouts
      ctx.font = "11px JetBrains Mono, monospace";
      ctx.fillStyle = inZone ? "#38bdf8" : "#64748b";
      const deg = ((currentTheta * 180) / Math.PI).toFixed(1);
      ctx.fillText(`Angle: ${deg}°`, 15, 25);
      ctx.fillText(`Cart Position: ${currentX.toFixed(2)}m`, 15, 38);

      // Torques/Applied Force representation
      if (Math.abs(appliedForce) > 0.01) {
        ctx.strokeStyle = appliedForce > 0 ? "#0284c7" : "#f43f5e";
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Arrow pointing right
        if (appliedForce > 0) {
          ctx.moveTo(cartX - cartW / 2 - 30, cartY + cartH / 2);
          ctx.lineTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
          ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 - 5);
          ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 + 5);
          ctx.closePath();
          ctx.fillStyle = "#0284c7";
          ctx.fill();
        } else {
          ctx.moveTo(cartX + cartW / 2 + 30, cartY + cartH / 2);
          ctx.lineTo(cartX + cartW / 2 + 5, cartY + cartH / 2);
          ctx.stroke();
          // Arrowhead
          ctx.beginPath();
          ctx.moveTo(cartX + cartW / 2 + 5, cartY + cartH / 2);
          ctx.lineTo(cartX + cartW / 2 + 12, cartY + cartH / 2 - 5);
          ctx.lineTo(cartX + cartW / 2 + 12, cartY + cartH / 2 + 5);
          ctx.closePath();
          ctx.fillStyle = "#f43f5e";
          ctx.fill();
        }
      }

    } else {
      // 2. DOUBLE JOINTED PENDULUM GRAPHICS ON A MOVEABLE CART (Double Cart-Pole)
      const dpState = state as any;
      const theta1 = dpState.theta1 !== undefined ? dpState.theta1 : (dpState.theta || 0);
      const theta2 = dpState.theta2 !== undefined ? dpState.theta2 : 0;
      const d1 = dpState.theta1Dot !== undefined ? dpState.theta1Dot : (dpState.thetaDot || 0);
      const d2 = dpState.theta2Dot !== undefined ? dpState.theta2Dot : 0;
      const currentX = dpState.x || 0;

      const trackLimit = 4.0;
      const scale = (width - 60) / (2 * trackLimit);
      const cx = width / 2;
      const trackY = height / 2 + 50;
      
      const rLength1 = 65; // rod 1 rendering length
      const rLength2 = 55; // rod 2 rendering length

      // Draw horizontal track line
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx - trackLimit * scale, trackY + 12);
      ctx.lineTo(cx + trackLimit * scale, trackY + 12);
      ctx.stroke();

      // Draw track end stops
      ctx.fillStyle = "#475569";
      ctx.fillRect(cx - trackLimit * scale - 4, trackY - 2, 8, 24);
      ctx.fillRect(cx + trackLimit * scale - 4, trackY - 2, 8, 24);

      // Cart coordinates
      const cartX = cx + currentX * scale;
      const cartW = 84;
      const cartH = 34;
      const cartY = trackY - cartH / 2;

      // Draw the cart (wheeled box)
      ctx.fillStyle = "#0d1527";
      ctx.strokeStyle = "#0284c7"; // Saturation highlighted blue
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(cartX - cartW / 2, cartY, cartW, cartH, 6);
      } else {
        ctx.rect(cartX - cartW / 2, cartY, cartW, cartH);
      }
      ctx.fill();
      ctx.stroke();

      // Draw wheels underneath cart
      const wheelR = 8;
      const wheelY = trackY + 12;
      const wheelOffset = 24;

      ctx.fillStyle = "#0284c7";
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.5;

      // Left wheel
      ctx.beginPath();
      ctx.arc(cartX - wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Right wheel
      ctx.beginPath();
      ctx.arc(cartX + wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Joint 1 endpoint (Tip 1 / Joint 2 base) on cart
      const pivotX = cartX;
      const pivotY = cartY + 4;

      const j1X = pivotX + rLength1 * Math.sin(theta1);
      const j1Y = pivotY - rLength1 * Math.cos(theta1);

      // Joint 2 endpoint (Tip 2 / End Bob)
      const j2X = j1X + rLength2 * Math.sin(theta2);
      const j2Y = j1Y - rLength2 * Math.cos(theta2);

      const a1Stable = Math.abs(normalizeAngle(theta1)) < 0.18;
      const a2Stable = Math.abs(normalizeAngle(theta2)) < 0.25;
      const bothStable = a1Stable && a2Stable;

      // Draw safety helper balance zones (radial helper)
      ctx.strokeStyle = "rgba(14, 165, 233, 0.08)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 30, -Math.PI/2 - 0.18, -Math.PI/2 + 0.18);
      ctx.stroke();

      // Link 1 (Inner Arm) - glowing rod
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(j1X, j1Y);
      ctx.strokeStyle = a1Stable ? "#0284c7" : "#475569";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.stroke();

      // First Joint Pivot Hinge
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 6, 0, 2 * Math.PI);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();

      // Link 2 (Outer Arm)
      ctx.beginPath();
      ctx.moveTo(j1X, j1Y);
      ctx.lineTo(j2X, j2Y);
      ctx.strokeStyle = bothStable ? "#38bdf8" : a2Stable ? "#0284c7" : "#64748b";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.stroke();

      // Middle joint (elbow elbow pin)
      ctx.beginPath();
      ctx.arc(j1X, j1Y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = a1Stable ? "#0284c7" : "#1e293b";
      ctx.fill();
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.stroke();

      // End-point payload mass (Bob 2)
      ctx.beginPath();
      ctx.arc(j2X, j2Y, 14, 0, 2 * Math.PI);
      ctx.fillStyle = bothStable ? "#38bdf8" : "#111827";
      ctx.fill();
      ctx.strokeStyle = bothStable ? "#38bdf8" : "#0284c7";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Directional Control torque representation
      if (Math.abs(appliedForce) > 0.01) {
        ctx.strokeStyle = appliedForce > 0 ? "#0284c7" : "#f43f5e";
        ctx.lineWidth = 4;
        ctx.beginPath();
        if (appliedForce > 0) {
          ctx.moveTo(cartX - cartW / 2 - 30, cartY + cartH / 2);
          ctx.lineTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
          ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 - 5);
          ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 + 5);
          ctx.closePath();
          ctx.fillStyle = "#0284c7";
          ctx.fill();
        } else {
          ctx.moveTo(cartX + cartW / 2 + 30, cartY + cartH / 2);
          ctx.lineTo(cartX + cartW / 2 + 5, cartY + cartH / 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cartX + cartW / 2 + 5, cartY + cartH / 2);
          ctx.lineTo(cartX + cartW / 2 + 12, cartY + cartH / 2 - 5);
          ctx.lineTo(cartX + cartW / 2 + 12, cartY + cartH / 2 + 5);
          ctx.closePath();
          ctx.fillStyle = "#f43f5e";
          ctx.fill();
        }
      }

      // Readouts for angles in English
      ctx.font = "9px JetBrains Mono, monospace";
      ctx.fillStyle = "#64748b";
      const deg1 = ((theta1 * 180) / Math.PI).toFixed(1);
      const deg2 = ((theta2 * 180) / Math.PI).toFixed(1);
      ctx.fillText(`Arm 1: ${deg1}° | Speed 1: ${d1.toFixed(1)}r/s`, 15, 25);
      ctx.fillText(`Arm 2: ${deg2}° | Speed 2: ${d2.toFixed(1)}r/s`, 15, 38);
      ctx.fillText(`Cart Position: ${currentX.toFixed(2)}m`, 15, 51);
    }

    // DRAW SHOCK PERTURBATION VISUAL
    if (dragForceValue !== null) {
      ctx.fillStyle = "rgba(14, 165, 233, 0.12)";
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.setLineDash([]); // reset

      // Force indicator text in English
      ctx.font = "bold 13px Inter, sans-serif";
      ctx.fillStyle = "#38bdf8";
      ctx.fillText(
        `Wind Gust Applied: ${dragForceValue > 0 ? "➔ Right" : "➔ Left"} (${Math.abs(dragForceValue).toFixed(1)}N)`,
        width / 2 - 100,
        50
      );
    }

  }, [dimensions, envType, state, appliedForce, dragForceValue]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-slate-800 bg-[#050608] p-1 shadow-2xl">
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        <span className="text-[9px] font-mono tracking-wider text-sky-400 bg-[#0a0c12]/90 border border-sky-500/20 p-1 px-2.5 rounded uppercase">
          {envType === "cartpole" ? "System: Cart-Pole Balancer" : "System: Double Pendulum"}
        </span>
        <span className={`text-[9px] font-mono px-2.5 py-1 rounded inline-flex items-center gap-1 uppercase ${
          controllerType === "rl" 
          ? "bg-sky-550/10 text-sky-400 border border-sky-500/25" 
          : controllerType === "pid"
            ? "bg-sky-550/10 text-sky-400 border border-sky-500/25"
            : "bg-orange-500/10 text-orange-400 border border-orange-500/25"
        }`}>
          {controllerType === "rl" && <RotateCw className="w-2.5 h-2.5 animate-spin" />}
          {controllerType === "pid" && <ArrowLeftRight className="w-2.5 h-2.5" />}
          {controllerType === "manual" && <Wind className="w-2.5 h-2.5" />}
          {controllerType === "rl" ? "AI Agent: Active" : controllerType === "pid" ? "Classic PID" : "Manual Force"}
        </span>
      </div>

      <canvas
        id="physics-canvas"
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        onMouseDown={handleCanvasInteraction}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="w-full h-full cursor-pointer touch-none block"
      />

      {isHovered && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none bg-slate-950/90 border border-slate-800 text-slate-400 text-[9px] font-mono tracking-widest px-3 py-1.5 rounded uppercase shadow-xl text-center select-none animate-fade-in z-20">
          Click to apply horizontal wind perturbation gust
        </div>
      )}
    </div>
  );
};
