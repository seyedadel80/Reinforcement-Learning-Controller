import React, { useMemo } from "react";
import { EpisodeLog, EnvType, RLParams } from "../types";
import { RLAgent } from "../rl-agent";
import { AreaChart, Compass, Grid, TrendingUp } from "lucide-react";

interface AnalyticsPanelProps {
  envType: EnvType;
  episodeLogs: EpisodeLog[];
  state: any; // Current continuous state
  agent: RLAgent | null;
  rlParams: RLParams;
  phaseSpaceTrail: Array<{ theta: number; thetaDot: number }>;
}

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({
  envType,
  episodeLogs,
  state,
  agent,
  rlParams,
  phaseSpaceTrail,
}) => {
  // Compute Heatmap Cell Colors and actions for the learned Policy
  const heatmapData = useMemo(() => {
    if (envType !== "pendulum" || !agent) return null;
    
    const bins = rlParams.discretizationBins;
    const grid: Array<{
      thetaBin: number;
      thetaDotBin: number;
      bestAction: number;
      bestQ: number;
      isExplored: boolean;
    }> = [];

    for (let t = 0; t < bins; t++) {
      for (let td = 0; td < bins; td++) {
        // Find state index corresponding to this grid coordinate
        const stateIndex = t * bins + td;
        const hasValue = agent.qTable.has(stateIndex);
        
        if (hasValue) {
          const qVal = agent.getQValues(stateIndex);
          const maxQ = Math.max(...qVal);
          const bestAction = qVal.indexOf(maxQ);
          grid.push({
            thetaBin: t,
            thetaDotBin: td,
            bestAction,
            bestQ: maxQ,
            isExplored: true,
          });
        } else {
          grid.push({
            thetaBin: t,
            thetaDotBin: td,
            bestAction: 1, // Neutral
            bestQ: 0,
            isExplored: false,
          });
        }
      }
    }
    return grid;
  }, [envType, agent, rlParams.discretizationBins, episodeLogs.length]); // update when logs change (training progress)

  // Maximum value for scaling SVG Reward Charts
  const chartPoints = useMemo(() => {
    if (episodeLogs.length === 0) return [];
    
    // Subsample logs if too many, to keep rendering fast (max 40 points)
    const count = episodeLogs.length;
    const maxPoints = 40;
    const step = Math.max(1, Math.ceil(count / maxPoints));
    
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < count; i += step) {
      points.push({
        x: episodeLogs[i].episode,
        y: episodeLogs[i].totalReward,
      });
    }
    // ensure last is included
    if (count > 1 && (count - 1) % step !== 0) {
      points.push({
        x: episodeLogs[count - 1].episode,
        y: episodeLogs[count - 1].totalReward,
      });
    }
    return points;
  }, [episodeLogs]);

  // Compute SVG scale viewport coordinates
  const rewardChartPath = useMemo(() => {
    if (chartPoints.length < 2) return "";
    const width = 360;
    const height = 120;
    const padding = 15;

    const xVals = chartPoints.map(p => p.x);
    const yVals = chartPoints.map(p => p.y);
    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals) || 1;
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    const yRange = (maxY - minY) || 10;

    const scaleX = (x: number) => padding + ((x - minX) / (maxX - minX)) * (width - 2 * padding);
    const scaleY = (y: number) => height - padding - ((y - minY) / yRange) * (height - 2 * padding);

    return chartPoints
      .map((p, index) => `${index === 0 ? "M" : "L"} ${scaleX(p.x).toFixed(1)} ${scaleY(p.y).toFixed(1)}`)
      .join(" ");
  }, [chartPoints]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans">
      
      {/* 1. REWARD HISTORY CHART */}
      <div className="bg-[#0a0c12] border border-slate-800/50 p-4 rounded-lg flex flex-col justify-between shadow-xl">
        <div className="mb-2">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-tighter flex items-center gap-2 leading-none">
            <span className="w-1 h-3 bg-sky-500"></span>
            <span>Reward Convergence History</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-mono">
            Episode convergence tracking
          </p>
        </div>

        <div className="w-full h-32 flex items-center justify-center border border-slate-800 rounded-lg p-2 bg-[#050608] relative">
          <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)", backgroundSize: "20px 20px" }}></div>
          {episodeLogs.length < 2 ? (
            <div className="text-center text-[10px] text-slate-500 font-mono px-4 z-10">
              NO DATA STREAM. ENABLE TRAINING MODE TO OBSERVE CONVERGENCE.
            </div>
          ) : (
            <svg viewBox="0 0 360 120" className="w-full h-full overflow-visible z-10 drop-shadow-[0_0_15px_rgba(2,132,199,0.15)]">
              {/* Plot points connecting lines */}
              <path
                d={rewardChartPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Highlight End Point Pin */}
              {chartPoints.length > 0 && (
                <circle
                  cx={360 - 15}
                  cy={rewardChartPath ? parseFloat((rewardChartPath.split(" ").pop() || "0").split(" ")[1] || "60") : 60}
                  r="3.5"
                  fill="#ffffff"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  className="animate-ping"
                />
              )}
            </svg>
          )}
        </div>

        <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono mt-2">
          <span>EPISODE 1</span>
          <span className="text-sky-400 font-bold">LATEST: {episodeLogs.length > 0 ? episodeLogs[episodeLogs.length - 1].totalReward.toFixed(1) : "0"}</span>
          <span>EPISODE {episodeLogs.length}</span>
        </div>
      </div>

      {/* 2. STATE PHASE-SPACE ORBIT DIAGRAM */}
      <div className="bg-[#0a0c12] border border-slate-800/50 p-4 rounded-lg flex flex-col justify-between shadow-xl">
        <div className="mb-2">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-tighter flex items-center gap-2 leading-none">
            <span className="w-1 h-3 bg-sky-500"></span>
            <span>Orbital Phase Space Diagram</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-mono">
            Theta vs Angular Velocity
          </p>
        </div>

        <div className="relative w-full h-32 flex items-center justify-center border border-slate-800 rounded-lg bg-[#050608] overflow-hidden">
          {/* Target core cross hair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-full h-[0.5px] bg-slate-800/60" />
            <div className="absolute h-full w-[0.5px] bg-slate-800/60" />
            <div className="absolute w-4 h-4 rounded-full border border-sky-400/20 bg-sky-500/5 animate-ping" />
            <span className="absolute top-1 right-2 text-[8px] font-mono text-slate-600">SPEED (θ̇)</span>
            <span className="absolute bottom-1 left-2 text-[8px] font-mono text-slate-600">ANGLE (θ)</span>
          </div>

          <svg viewBox="0 0 200 120" className="w-full h-full overflow-visible relative z-10 drop-shadow-[0_0_12px_rgba(2,132,199,0.1)]">
            {/* Draw orbital history trajectory trail */}
            {phaseSpaceTrail.length > 1 && (
              <polyline
                points={phaseSpaceTrail
                  .map((pt) => {
                    const thetaVal = pt.theta !== undefined ? pt.theta : 0;
                    const speedVal = pt.thetaDot !== undefined ? pt.thetaDot : 0;
                    // scale x (theta from -1.0 to 1.0 rad) to [10, 190]
                    const scaleX = 100 + (thetaVal / 1.0) * 80;
                    // scale y (thetaDot from -10 to 10 rad/s) to [10, 110]
                    const scaleY = 60 - (speedVal / 10.0) * 45;
                    return `${Math.max(5, Math.min(195, scaleX))},${Math.max(5, Math.min(115, scaleY))}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.85"
              />
            )}

            {/* Current point with fallbacks for both single (theta) and double pendulum (theta1) states */}
            {state && (
              <circle
                cx={(() => {
                  const currentTheta = state.theta1 !== undefined ? state.theta1 : (state.theta || 0);
                  const scaled = 100 + (currentTheta / 1.0) * 80;
                  return Math.max(5, Math.min(195, scaled));
                })()}
                cy={(() => {
                  const currentSpeed = state.theta1Dot !== undefined ? state.theta1Dot : (state.thetaDot || 0);
                  const scaled = 60 - (currentSpeed / 10.0) * 45;
                  return Math.max(5, Math.min(115, scaled));
                })()}
                r="4.5"
                fill="#0284c7"
                stroke="#fff"
                strokeWidth="1.5"
              />
            )}
          </svg>
        </div>

        <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2 font-mono">
          <span>STABILITY = ORIGIN (0, 0)</span>
          <span className="text-sky-400 text-[10px]">TRAIL COUNT: {phaseSpaceTrail.length}</span>
        </div>
      </div>

      {/* 3. POLICY HEATMAP OR STATS SECTION */}
      <div className="bg-[#0a0c12] border border-slate-800/50 p-4 rounded-lg flex flex-col justify-between shadow-xl select-none">
        <div className="mb-2">
          <h3 className="text-xs font-bold text-sky-400 uppercase tracking-tighter flex items-center gap-2 leading-none">
            <span className="w-1 h-3 bg-sky-500"></span>
            <span>Agent Decision Topology (Q-Table Map)</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-mono">
            Agent state-action topology
          </p>
        </div>

        {envType === "pendulum" && heatmapData ? (
          <div 
            className="w-full h-32 grid gap-[1px] bg-[#050608] p-1 border border-slate-800 rounded-lg"
            style={{
              gridTemplateColumns: `repeat(${rlParams.discretizationBins}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rlParams.discretizationBins}, minmax(0, 1fr))`,
            }}
          >
            {heatmapData.map((cell, idx) => {
              // Decide background base colors on actions: left (red scale), center (slate), right (sky scale)
              let bg = "bg-slate-900 opacity-20";
              if (cell.isExplored) {
                if (cell.bestAction === 0) {
                  bg = "bg-rose-500"; // Torque Left
                } else if (cell.bestAction === 2) {
                  bg = "bg-sky-500";  // Torque Right
                } else {
                  bg = "bg-lime-500"; // No Action - Perfect balance state!
                }
              }

              // calculate intensity based on Q-values to make it heat map styled
              const opacityStyle = cell.isExplored 
                ? Math.max(0.35, Math.min(1.0, 0.4 + Math.abs(cell.bestQ) * 0.15)) 
                : 1;

              return (
                <div
                  key={idx}
                  className={`${bg} w-full h-full rounded-[0.5px] transition-all`}
                  style={{ opacity: opacityStyle }}
                  title={`Theta Bin: ${cell.thetaBin}, Speed Bin: ${cell.thetaDotBin}, Action: ${cell.bestAction}, Q: ${cell.bestQ.toFixed(2)}`}
                />
              );
            })}
          </div>
        ) : (
          <div className="w-full h-32 flex flex-col justify-center items-center border border-slate-850 rounded-lg bg-[#050608] p-3 text-center">
            <span className="text-[9px] text-slate-500 uppercase font-mono">
              Double Pendulum / Cart-Pole leverages continuous multidimensional states. Direct projections are summarized below:
            </span>
            <div className="mt-3 flex gap-4 text-center">
              <div>
                <span className="block text-xs font-mono font-bold text-sky-400">
                  {agent ? agent.getExploredStatesCount() : "0"}
                </span>
                <span className="text-[8px] text-slate-600 uppercase">STATES</span>
              </div>
              <div className="border-r border-slate-800 h-6" />
              <div>
                <span className="block text-xs font-mono font-bold text-sky-400">
                  {agent ? agent.exploitCount : "0"}
                </span>
                <span className="text-[8px] text-slate-600 uppercase">EXPLOIT</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2 font-mono leading-none">
          <span>STATES: {agent ? agent.qTable.size : 0} ITEMS</span>
          <span>BINS: {rlParams.discretizationBins}x{rlParams.discretizationBins}</span>
        </div>
      </div>

    </div>
  );
};
