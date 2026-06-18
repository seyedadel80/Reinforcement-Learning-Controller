import React, { useRef, useEffect, useState } from "react";
import { SimulatorState, PhysicsParams, CartPoleState } from "../types";
import { normalizeAngle } from "../simulator";
import { Wind, RotateCw, Sparkles } from "lucide-react";

interface SimulationCanvasProps {
  state: SimulatorState;
  physicsParams: PhysicsParams;
  appliedForce: number; // Force applied by controller
  onManualPerturbation: (force: number) => void;
  controllerType: "rl" | "manual";
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
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

    // 1. INVERTED PENDULUM ON A WHEELED BOX (CART-POLE) GRAPHICS
    const cpState = state as CartPoleState;
    const currentX = cpState.x || 0;
    const currentTheta = cpState.theta || 0;

    const trackLimit = 4.0;
    const scale = (width - 60) / (2 * trackLimit);
    const cx = width / 2;
    const trackY = height / 2 + 50;
    const rLength = 125; // elegant longer rod rendering length

    // Draw horizontal track line - a gorgeous glowing mint-green/neon-amber control rail
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - trackLimit * scale, trackY + 12);
    ctx.lineTo(cx + trackLimit * scale, trackY + 12);
    ctx.stroke();

    // Glowing track overlay
    ctx.strokeStyle = "rgba(16, 185, 129, 0.2)"; // subtle mint green glow
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - trackLimit * scale, trackY + 12);
    ctx.lineTo(cx + trackLimit * scale, trackY + 12);
    ctx.stroke();

    // Draw track end stops (hard red warning bumpers)
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(cx - trackLimit * scale - 4, trackY, 8, 24);
    ctx.fillRect(cx + trackLimit * scale - 4, trackY, 8, 24);

    // Cart coordinates
    const cartX = cx + currentX * scale;
    const cartW = 75; // Sleeker, more proportionate cart width
    const cartH = 26; // Sleeker, more proportionate cart height
    const cartY = trackY - cartH / 2;

    // Draw the cart (wheeled box with Slate-Grey body and a subtle purple/teal aesthetic glow)
    ctx.fillStyle = "#1e1b4b"; // Deep Indigo core
    ctx.strokeStyle = "#6366f1"; // Indigo outline
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(cartX - cartW / 2, cartY, cartW, cartH, 4);
    } else {
      ctx.rect(cartX - cartW / 2, cartY, cartW, cartH);
    }
    ctx.fill();
    ctx.stroke();

    // Draw wheels underneath cart
    const wheelR = 8.5; // beautifully sized wheels
    const wheelY = trackY + 11;
    const wheelOffset = 22;

    ctx.fillStyle = "#0f172a"; // dark steel tires
    ctx.strokeStyle = "#10b981"; // mint green rim highlights for gorgeous color contrast
    ctx.lineWidth = 2.0;

    // Left wheel
    ctx.beginPath();
    ctx.arc(cartX - wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    // Inner hubcaps
    ctx.beginPath();
    ctx.arc(cartX - wheelOffset, wheelY, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#10b981";
    ctx.fill();

    // Right wheel
    ctx.beginPath();
    ctx.arc(cartX + wheelOffset, wheelY, wheelR, 0, 2 * Math.PI);
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.stroke();
    // Inner hubcaps
    ctx.beginPath();
    ctx.arc(cartX + wheelOffset, wheelY, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#10b981";
    ctx.fill();

    // Pole base joint pivot on cart
    const pivotX = cartX;
    const pivotY = cartY + 4;

    // Pole tip coordinates
    const tipX = pivotX + rLength * Math.sin(currentTheta);
    const tipY = pivotY - rLength * Math.cos(currentTheta);

    // Dynamic warning angle fan (highlights upright balance zone with subtle yellow/orange background)
    ctx.fillStyle = "rgba(245, 158, 11, 0.04)";
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.arc(pivotX, pivotY, rLength + 10, -Math.PI / 2 - 0.22, -Math.PI / 2 + 0.22);
    ctx.closePath();
    ctx.fill();

    // Draw pole line (glowing dynamic rod matching angle stability)
    const absAngle = Math.abs(normalizeAngle(currentTheta));
    const inZone = absAngle < 0.15;
    const inDangerZone = absAngle >= 0.75;
    
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(tipX, tipY);
    
    // Aesthetic color transition: mint green if perfectly upright, warm golden-yellow if slightly leaning, and coral-red if failed/dangling
    const poleGradient = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
    if (inZone) {
      poleGradient.addColorStop(0, "#10b981"); // mint green
      poleGradient.addColorStop(1, "#34d399");
      ctx.strokeStyle = poleGradient;
    } else if (!inDangerZone) {
      poleGradient.addColorStop(0, "#f59e0b"); // warm golden-amber
      poleGradient.addColorStop(1, "#fbbf24");
      ctx.strokeStyle = poleGradient;
    } else {
      poleGradient.addColorStop(0, "#ef4444"); // warning coral red
      poleGradient.addColorStop(1, "#f87171");
      ctx.strokeStyle = poleGradient;
    }
    
    ctx.lineWidth = 4.5; // balanced, more professional look
    ctx.lineCap = "round";
    ctx.shadowColor = inZone ? "rgba(16, 185, 129, 0.4)" : !inDangerZone ? "rgba(245, 158, 11, 0.2)" : "transparent";
    ctx.shadowBlur = inZone ? 12 : !inDangerZone ? 6 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Draw brass weight at end (Bob) with professional golden/bronze metallic finish
    ctx.beginPath();
    ctx.arc(tipX, tipY, 15, 0, 2 * Math.PI); // slightly sleeker bob
    ctx.fillStyle = inZone ? "#10b981" : !inDangerZone ? "#d97706" : "#ef4444";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Inner bronze core for realistic aesthetic depth
    ctx.beginPath();
    ctx.arc(tipX, tipY, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fill();

    // Pivot pin (metallic silver center)
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Show angle and position readouts in high-contrast monospaced display
    ctx.font = "11px JetBrains Mono, monospace";
    ctx.fillStyle = inZone ? "#34d399" : !inDangerZone ? "#f59e0b" : "#f87171";
    const deg = ((currentTheta * 180) / Math.PI).toFixed(1);
    ctx.fillText(`Pole Angle: ${deg}°`, 15, 25);
    
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Cart Position: ${currentX.toFixed(2)}m`, 15, 38);

    // Torques/Applied Force representation
    if (Math.abs(appliedForce) > 0.01) {
      // Emerald green for push right, hot rose-pink for left
      const isRightForce = appliedForce > 0;
      ctx.strokeStyle = isRightForce ? "#10b981" : "#f43f5e";
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Arrow pointing right
      if (isRightForce) {
        ctx.moveTo(cartX - cartW / 2 - 30, cartY + cartH / 2);
        ctx.lineTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(cartX - cartW / 2 - 5, cartY + cartH / 2);
        ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 - 5);
        ctx.lineTo(cartX - cartW / 2 - 12, cartY + cartH / 2 + 5);
        ctx.closePath();
        ctx.fillStyle = "#10b981";
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

  }, [dimensions, state, appliedForce, dragForceValue]);

  return (
    <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-slate-800 bg-[#050608] p-1 shadow-2xl">
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        <span className="text-[9px] font-mono tracking-wider text-sky-400 bg-[#0a0c12]/90 border border-sky-500/20 p-1 px-2.5 rounded uppercase flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" />
          System: Inverted Cart-Pole
        </span>
        <span className={`text-[9px] font-mono px-2.5 py-1 rounded inline-flex items-center gap-1 uppercase ${
          controllerType === "rl" 
          ? "bg-sky-550/10 text-sky-400 border border-sky-500/25" 
          : "bg-orange-500/10 text-orange-400 border border-orange-500/25"
        }`}>
          {controllerType === "rl" && <RotateCw className="w-2.5 h-2.5 animate-spin" />}
          {controllerType === "manual" && <Wind className="w-2.5 h-2.5" />}
          {controllerType === "rl" ? "AI Agent: Active" : "Manual Force"}
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
