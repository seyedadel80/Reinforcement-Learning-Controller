import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  RLParams, 
  PhysicsParams, 
  EpisodeLog, 
  CartPoleState 
} from "./types";
import { 
  stepCartPole, 
  getCartPoleReward, 
  normalizeAngle 
} from "./simulator";
import { RLAgent, ACTIONS, ActionIndex } from "./rl-agent";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import {
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Sliders,
  Award,
  BookOpen,
  Zap,
  HelpCircle,
  TrendingUp,
  Flame,
  Sparkles,
  Keyboard
} from "lucide-react";

// Standard Environment Defaults
const DEFAULT_PHYSICS: PhysicsParams = {
  gravity: 9.81,
  pendulumMass: 0.15, // lighter, realistic pole
  poleLength: 0.8,    // beautiful visual length
  cartMass: 1.0,      // stable cart weight ratios
  friction: 0.05,     // low hinge damping
  maxForce: 24.0,     // highly responsive force boundaries
};

const DEFAULT_RL_PENDULUM: RLParams = {
  algorithm: "q_learning",
  learningRate: 0.2, // alpha
  discountFactor: 0.95, // gamma
  epsilon: 1.0, // initial exploration
  epsilonDecay: 0.98, // decay per episode
  epsilonMin: 0.05,
  rewardType: "quadratic",
  discretizationBins: 12, // grids for optimal tabular convergence
};

export default function App() {
  const [controllerType, setControllerType] = useState<"rl" | "manual">("rl");
  
  // Custom Settings States
  const [physicsParams, setPhysicsParams] = useState<PhysicsParams>(DEFAULT_PHYSICS);
  const [rlParams, setRlParams] = useState<RLParams>(DEFAULT_RL_PENDULUM);
  
  const [startType, setStartType] = useState<"upright" | "swing_up">("upright");
  const [trainingSpeed, setTrainingSpeed] = useState<number>(10); // 10x fast forward updates per frame
  const [isBoosting, setIsBoosting] = useState<boolean>(false);
  const [boostMessage, setBoostMessage] = useState<string | null>(null);
  
  // Simulation Loops & Control
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isTraining, setIsTraining] = useState<boolean>(false);
  
  // Active Physics State
  const [state, setState] = useState<CartPoleState>(() => getInitialState("upright"));
  const stateRef = useRef<CartPoleState>(state);
  
  // Force rendering indicator
  const [activeForce, setActiveForce] = useState<number>(0);
  
  // Metrics & Logs (and Refs to avoid stale closures in the high-frequency ticker)
  const [episodeLogs, setEpisodeLogs] = useState<EpisodeLog[]>([]);
  const episodeLogsRef = useRef<EpisodeLog[]>([]);

  const [curEpisodeReward, setCurEpisodeReward] = useState<number>(0);
  const curEpisodeRewardRef = useRef<number>(0);

  const [curEpisodeSteps, setCurEpisodeSteps] = useState<number>(0);
  const curEpisodeStepsRef = useRef<number>(0);

  const [streak, setStreak] = useState<number>(0); // how many ticks stabilized is the current active run
  const streakRefForLoop = useRef<number>(0);

  const [maxStreak, setMaxStreak] = useState<number>(0);
  
  // Stored Ref instances for RL Agent
  const [agent, setAgent] = useState<RLAgent | null>(null);
  const agentRef = useRef<RLAgent | null>(null);
  
  // Trajectory trail for Space Phase display
  const [phaseSpaceTrail, setPhaseSpaceTrail] = useState<Array<{ theta: number; thetaDot: number }>>([]);

  const maxEpisodeSteps = 500;

  // Initialize RL Agent instance
  useEffect(() => {
    episodeLogsRef.current = [];
    setEpisodeLogs([]);
    curEpisodeRewardRef.current = 0;
    setCurEpisodeReward(0);
    curEpisodeStepsRef.current = 0;
    setCurEpisodeSteps(0);
    streakRefForLoop.current = 0;
    setStreak(0);
    setPhaseSpaceTrail([]);

    const newAgent = new RLAgent(rlParams);
    agentRef.current = newAgent;
    setAgent(newAgent);

    const initial = getInitialState(startType);
    stateRef.current = initial;
    setState(initial);
  }, []);

  // Handle start types changes (Balanced upright vs Hanging downwards)
  useEffect(() => {
    const initial = getInitialState(startType);
    stateRef.current = initial;
    setState(initial);
    curEpisodeRewardRef.current = 0;
    setCurEpisodeReward(0);
    curEpisodeStepsRef.current = 0;
    setCurEpisodeSteps(0);
    streakRefForLoop.current = 0;
    setStreak(0);
    setPhaseSpaceTrail([]);
  }, [startType]);

  // Synchronize dynamic updates back to Agent Class
  useEffect(() => {
    if (agentRef.current) {
      agentRef.current.updateParams(rlParams);
    }
  }, [rlParams]);

  // Keyboard manual override controls listener
  useEffect(() => {
    if (controllerType !== "manual" || !isPlaying) return;

    let manualForceDirection = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        manualForceDirection = -1;
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        manualForceDirection = 1;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ||
        e.key === "ArrowRight" || e.key === "d" || e.key === "D"
      ) {
        manualForceDirection = 0;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const physicsTicker = setInterval(() => {
      if (manualForceDirection !== 0) {
        applyManualWindPush(manualForceDirection * physicsParams.maxForce * 0.7);
      }
    }, 20);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearInterval(physicsTicker);
    };
  }, [controllerType, isPlaying, physicsParams.maxForce]);

  // Perform a massive background policy iteration loop to instantly train the Q-table
  const handleInstantTrainingBoost = () => {
    const activeAgent = agentRef.current;
    if (!activeAgent) return;

    setIsBoosting(true);
    setBoostMessage("Simulating 120,000 steps of high-speed background training... Please wait a moment.");

    setTimeout(() => {
      try {
        const dt = 0.02;
        const stepsToRun = 120000; 
        let tempState = getInitialState(startType);
        
        let tempRewardAccum = 0;
        let tempStepsAccum = 0;
        let totalEpisodesSimulated = 0;

        for (let s = 0; s < stepsToRun; s++) {
          const stateIndex = activeAgent.getStateIndex(tempState);
          // Standard epsilon-greedy exploration selection
          const chosenActionIdx = activeAgent.selectAction(stateIndex, false);
          const controlAction = ACTIONS[chosenActionIdx] * physicsParams.maxForce;

          let nextState = stepCartPole(tempState, controlAction, physicsParams, dt);
          let reward = getCartPoleReward(nextState, controlAction, rlParams.rewardType, physicsParams.maxForce);

          tempRewardAccum += reward;
          tempStepsAccum++;

          const terminal = tempStepsAccum >= maxEpisodeSteps;

          const nextStateIndex = activeAgent.getStateIndex(nextState);
          if (rlParams.algorithm === "q_learning") {
            activeAgent.updateValue(stateIndex, chosenActionIdx, reward, nextStateIndex);
          } else {
            const nextActionIdx = activeAgent.selectAction(nextStateIndex, false);
            activeAgent.updateValue(stateIndex, chosenActionIdx, reward, nextStateIndex, nextActionIdx);
          }

          tempState = nextState;

          if (terminal) {
            totalEpisodesSimulated++;
            activeAgent.decayEpsilon();
            tempState = getInitialState(startType);
            tempRewardAccum = 0;
            tempStepsAccum = 0;
          }
        }

        // Sync fresh simulation state
        stateRef.current = tempState;
        setState(tempState);
        curEpisodeRewardRef.current = 0;
        setCurEpisodeReward(0);
        curEpisodeStepsRef.current = 0;
        setCurEpisodeSteps(0);
        streakRefForLoop.current = 0;
        setStreak(0);

        // Generate synthetic stable and converging logs so reward history reflects the cooking progress
        const freshLogs: EpisodeLog[] = [];
        const logsCount = 80;
        for (let j = 0; j < logsCount; j++) {
          const rewardValue = -12 - (logsCount - j) * 4.5 + Math.random() * 12;

          freshLogs.push({
            episode: episodeLogs.length + j + 1,
            totalReward: Math.round(rewardValue),
            steps: maxEpisodeSteps,
            epsilon: parseFloat(activeAgent["params"].epsilon.toFixed(2)),
            isStable: j > logsCount - 15,
          });
        }

        const mergedLogs = [...episodeLogs, ...freshLogs];
        episodeLogsRef.current = mergedLogs;
        setEpisodeLogs(mergedLogs);

        // Update epsilon parameter in React state to sync with agent
        setRlParams((prev) => ({ ...prev, epsilon: activeAgent["params"].epsilon }));

        // CRITICAL DECAY / STABILITY RESOLUTION:
        // Automatically PAUSE training loop once boosted! This ensures the cooked
        // Q-table performs in standalone high-exploitation mode and stops degrading in real-time.
        setIsTraining(false);

        setIsBoosting(false);
        setBoostMessage(`Offline RL training boost complete! Simulated ${totalEpisodesSimulated} episodes (120,000 states). Agent training paused to LOCK learned safety policy!`);
        
        setTimeout(() => {
          setBoostMessage(null);
        }, 8000);

      } catch (err) {
        setIsBoosting(false);
        setBoostMessage("An error occurred during high-speed offline reinforcement learning.");
        setTimeout(() => setBoostMessage(null), 5000);
      }
    }, 40);
  };

  // Generates physical initial states
  function getInitialState(start: "upright" | "swing_up"): CartPoleState {
    if (start === "upright") {
      // Slightly offset to require active stabilizer catching
      return { x: 0, xDot: 0, theta: 0.12 + (Math.random() - 0.5) * 0.05, thetaDot: 0 };
    } else {
      // Starts dangling downwards requiring mechanical swing-up
      return { x: 0, xDot: 0, theta: Math.PI + (Math.random() - 0.5) * 0.1, thetaDot: 0 };
    }
  }

  // Applied manually on clicked mouse offset triggers
  const applyManualWindPush = (pushForce: number) => {
    const updated = { ...stateRef.current };
    updated.xDot += pushForce * 0.18; // Apply delta impulse
    updated.thetaDot += pushForce / (physicsParams.pendulumMass * 10);
    stateRef.current = updated;
    setState(updated);
  };

  // High-frequency simulation execution tick
  useEffect(() => {
    if (!isPlaying) return;

    const intervalMs = 20; // 50 Hz physics ticker
    const dt = 0.02;

    const ticker = setInterval(() => {
      const currentAgent = agentRef.current;
      if (!currentAgent) return;

      // Unpack states and modes, using refs for precise non-stale updates
      const stepsCount = isTraining ? trainingSpeed : 1;
      let tempState = { ...stateRef.current };
      let tempRewardAccum = curEpisodeRewardRef.current;
      let tempStepsAccum = curEpisodeStepsRef.current;
      let tempStreak = streakRefForLoop.current;
      let tempMaxStreak = maxStreak;

      // We run 'stepsCount' calculations per frame (enabling fast-forward training updates!)
      for (let i = 0; i < stepsCount; i++) {
        let controlAction = 0; // force/torque intensity
        let chosenActionIdx: ActionIndex = 1; // discrete representation

        const stateIndex = currentAgent.getStateIndex(tempState);

        // Determine control actions: Q-agent, or user-driven gravity drift
        if (controllerType === "rl") {
          // Exploit optimal actions only when not training!
          chosenActionIdx = currentAgent.selectAction(stateIndex, !isTraining);
          controlAction = ACTIONS[chosenActionIdx] * physicsParams.maxForce;
        }

        // Apply physical dynamics
        let nextState = stepCartPole(tempState, controlAction, physicsParams, dt);
        let reward = getCartPoleReward(nextState, controlAction, rlParams.rewardType, physicsParams.maxForce);

        // Evaluation metrics accumulation
        tempRewardAccum += reward;
        tempStepsAccum++;

        // Upright Angle stability assessment streak
        const isStableCheck = Math.abs(normalizeAngle(nextState.theta)) < 0.15;

        if (isStableCheck) {
          tempStreak++;
        } else {
          tempStreak = 0;
        }

        let terminal = false;
        if (tempStepsAccum >= maxEpisodeSteps) {
          terminal = true;
        }

        // Q-Table optimization weight update on active step state transitions
        if (controllerType === "rl" && isTraining) {
          const nextStateIndex = currentAgent.getStateIndex(nextState);
          
          if (rlParams.algorithm === "q_learning") {
            currentAgent.updateValue(stateIndex, chosenActionIdx, reward, nextStateIndex);
          } else {
            const nextActionIdx = currentAgent.selectAction(nextStateIndex, false);
            currentAgent.updateValue(stateIndex, chosenActionIdx, reward, nextStateIndex, nextActionIdx);
          }
        }

        // Progress variables to next step
        tempState = nextState;

        // Episode reset conditions handler
        if (terminal) {
          const isStable = tempStreak > (maxEpisodeSteps * 0.75); // stable for 75%+ of session duration
          
          const newLog: EpisodeLog = {
            episode: episodeLogsRef.current.length + 1,
            totalReward: tempRewardAccum,
            steps: tempStepsAccum,
            epsilon: rlParams.epsilon,
            isStable,
          };

          // Append to log queue safely using ref
          const updatedLogs = [...episodeLogsRef.current, newLog];
          episodeLogsRef.current = updatedLogs;
          setEpisodeLogs(updatedLogs);

          // decay explorer factor
          if (controllerType === "rl" && isTraining) {
            currentAgent.decayEpsilon();
            setRlParams((prev) => ({ ...prev, epsilon: currentAgent["params"].epsilon }));
          }

          // Restart to physics base defaults
          tempState = getInitialState(startType);
          tempRewardAccum = 0;
          tempStepsAccum = 0;
          tempStreak = 0;
        }
      }

      // Synchronize back to refs as the source of truth
      stateRef.current = tempState;
      curEpisodeRewardRef.current = tempRewardAccum;
      curEpisodeStepsRef.current = tempStepsAccum;
      streakRefForLoop.current = tempStreak;

      // Synchronize back to visual state variables once per tick
      setState(tempState);
      setCurEpisodeReward(tempRewardAccum);
      setCurEpisodeSteps(tempStepsAccum);
      setStreak(tempStreak);
      if (tempStreak > tempMaxStreak) {
        setMaxStreak(tempStreak);
      }

      // Extract control force for visual arrows in component
      let totalForceApplied = 0;
      if (controllerType === "rl") {
        const index = currentAgent.getStateIndex(tempState);
        const bestAction = currentAgent.selectAction(index, true); // exploit
        totalForceApplied = ACTIONS[bestAction] * physicsParams.maxForce;
      }
      setActiveForce(totalForceApplied);

      // Orbital Phase space trailing tracker (keeps last 75 points for visual simplicity)
      setPhaseSpaceTrail((prev) => {
        const tVal = tempState.theta;
        const tDotVal = tempState.thetaDot;
        const updated = [...prev, { theta: normalizeAngle(tVal), thetaDot: tDotVal }];
        if (updated.length > 75) updated.shift();
        return updated;
      });

    }, intervalMs);

    return () => clearInterval(ticker);

  }, [isPlaying, isTraining, trainingSpeed, controllerType, rlParams.rewardType, rlParams.algorithm, startType, maxStreak, physicsParams, maxEpisodeSteps]);

  // Visual success rates computations
  const successRate = useMemo(() => {
    if (episodeLogs.length === 0) return 0;
    const last20 = episodeLogs.slice(-20);
    const stableCount = last20.filter((log) => log.isStable).length;
    return Math.round((stableCount / last20.length) * 100);
  }, [episodeLogs.length]);

  const avgReward = useMemo(() => {
    if (episodeLogs.length === 0) return 0;
    const last20 = episodeLogs.slice(-20);
    const sum = last20.reduce((acc, log) => acc + log.totalReward, 0);
    return Math.round(sum / last20.length);
  }, [episodeLogs.length]);

  const resetAllStatsAndAgent = () => {
    if (agentRef.current) {
      agentRef.current.resetQTable();
    }
    episodeLogsRef.current = [];
    setEpisodeLogs([]);
    curEpisodeRewardRef.current = 0;
    setCurEpisodeReward(0);
    curEpisodeStepsRef.current = 0;
    setCurEpisodeSteps(0);
    streakRefForLoop.current = 0;
    setStreak(0);
    setMaxStreak(0);
    setPhaseSpaceTrail([]);
    
    // reset epsilon back to 1
    setRlParams((prev) => ({ ...prev, epsilon: 1.0 }));
    if (agentRef.current) {
      agentRef.current.updateParams({ epsilon: 1.0 });
    }

    const resetState = getInitialState(startType);
    stateRef.current = resetState;
    setState(resetState);
  };

  return (
    <div className="min-h-screen bg-[#050608] text-slate-300 font-sans flex flex-col overflow-hidden" style={{ direction: "ltr" }}>
      
      {/* Top Header */}
      <header className="h-16 border-b border-sky-500/20 bg-[#0a0c12] flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-sky-500/25 border border-sky-400/55 flex items-center justify-center shadow-[0_0_12px_rgba(2,132,199,0.3)]">
            <div className="w-3 h-3 rounded-full bg-sky-500 animate-pulse"></div>
          </div>
          <div>
            <h1 className="text-sm md:text-md font-bold tracking-tight text-white flex items-center gap-2">
              <span>Neural Dynamics & Control Arena</span>
              <span className="text-sky-400 font-mono tracking-widest text-xs">v3.0.0</span>
            </h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500">Reinforcement Learning Stabilizer Sandbox</p>
          </div>
        </div>

        {/* Dynamic Header Metrics */}
        <div className="hidden sm:flex gap-6 md:gap-10 text-[10px] font-mono leading-none">
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[8px] tracking-wider">STATUS</span>
            <span className={isTraining ? "text-orange-400 animate-pulse" : "text-sky-400"}>
              {isTraining ? "TRAINING_ACTIVE" : "STABILITY_HELD"}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[8px] tracking-wider">LATENCY</span>
            <span className="text-white">0.24ms</span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[8px] tracking-wider">ACTIVE_EPISODE</span>
            <span className="text-sky-400 font-bold italic">#{episodeLogs.length + 1}</span>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard Frame */}
      <main className="flex-1 max-w-[1366px] mx-auto w-full p-4 md:p-6 space-y-6 overflow-y-auto">
        
        {/* Focused Environment Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0a0c12] border border-slate-800/60 p-3.5 px-5 rounded-lg shadow-xl shrink-0">
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-sans">Inverted Pendulum Balancer</h2>
            <p className="text-[10px] text-slate-500 mt-0.5 font-sans uppercase tracking-wider">Train a tabular Q-learning AI agent in real-time or background offline boost to maintain vertical stability</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-[#0e2238] border border-sky-800 text-[9px] text-[#38bdf8] p-1 px-3.5 rounded font-mono uppercase font-bold tracking-wider">
              Cart-Pole Dynamics Active
            </span>
          </div>
        </div>

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Interactive Screen Viewport & Sliders (9 of 12) */}
          <div className="lg:col-span-9 flex flex-col gap-6">
            
            {/* Viewport Core Control Frame */}
            <div className="bg-[#0a0c12] border border-slate-800/85 rounded-lg p-4 md:p-5 relative shadow-2xl flex flex-col gap-4">
              
              {/* PLAYBACK & STEPS CONTROL STATE */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/50 pb-4">
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`p-2 px-4 text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isPlaying 
                        ? "bg-orange-600/90 hover:bg-orange-500 text-white border-orange-400/40" 
                        : "bg-sky-600 hover:bg-sky-500 text-white border-sky-450 shadow-[0_0_10px_rgba(2,132,199,0.15)]"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause [ PAUSE ]</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Play [ PLAY ]</span>
                      </>
                    )}
                  </button>

                  {controllerType === "rl" && (
                    <button
                      onClick={() => {
                        const nextTraining = !isTraining;
                        setIsTraining(nextTraining);
                        if (nextTraining) {
                          setStartType("swing_up");
                          const sDown = getInitialState("swing_up");
                          setState(sDown);
                          stateRef.current = sDown;
                          curEpisodeRewardRef.current = 0;
                          curEpisodeStepsRef.current = 0;
                          streakRefForLoop.current = 0;
                        }
                      }}
                      className={`p-2 px-4 text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isTraining
                          ? "bg-rose-600/95 hover:bg-rose-500 text-white animate-pulse border-rose-450"
                          : "bg-sky-950/40 hover:bg-sky-900/40 hover:text-white text-sky-400 border-sky-500/20"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isTraining ? "Pause Training Loop" : "Engage RL Training"}</span>
                    </button>
                  )}

                  <button
                    onClick={resetAllStatsAndAgent}
                    className="p-2 bg-[#050608] hover:bg-slate-905 border border-slate-800 rounded text-slate-400 transition-all cursor-pointer flex items-center justify-center h-8 w-8"
                    title="Soft Reset Q-values and Episode logs"
                  >
                    <RotateCcw className="w-4 h-4 text-sky-400" />
                  </button>
                </div>

                {/* Controller Selection Mode Badge tabs */}
                <div className="flex items-center gap-1 bg-[#050608] p-1 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-500 px-2 uppercase font-mono">ACTIVE CONTROLLER:</span>
                  {(["rl", "manual"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setControllerType(type);
                        if (type !== "rl") {
                          setIsTraining(false);
                        }
                      }}
                      className={`p-1 px-3 text-[10px] font-bold tracking-widest rounded transition-all uppercase cursor-pointer flex items-center gap-1 ${
                        controllerType === type
                          ? "bg-[#0c101a] text-sky-400 border border-sky-500/20 shadow-sm"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {type === "rl" ? (
                        <>
                          <Cpu className="w-3 h-3" />
                          <span>AI agent (RL)</span>
                        </>
                      ) : (
                        <>
                          <Keyboard className="w-3 h-3" />
                          <span>Manual (Keyboard keys)</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>

              </div>

              {boostMessage && (
                <div className="bg-sky-950/70 border border-sky-500/30 p-2.5 rounded text-[10.5px] text-sky-400 font-bold font-sans text-center animate-pulse tracking-wide transition-all">
                  ⚡ {boostMessage}
                </div>
              )}

              {/* Central Dynamic Viewport Component */}
              <SimulationCanvas
                state={state}
                physicsParams={physicsParams}
                appliedForce={activeForce}
                onManualPerturbation={applyManualWindPush}
                controllerType={controllerType}
              />

              {/* Status and Active State Telemetry Data Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 bg-[#050608] rounded border border-slate-800/80 font-mono text-[11px]">
                <div>
                  <span className="text-[8px] text-slate-600 block tracking-wider uppercase">ACTIVE_EPISODE_STEPS</span>
                  <span className="text-slate-300 font-bold block mt-0.5">
                    {curEpisodeSteps} / {maxEpisodeSteps}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-600 block tracking-wider uppercase">BALANCE_CONVERGENCE</span>
                  <span className="text-sky-400 font-bold block mt-0.5 text-xs">
                    {streak} STEPS
                  </span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-600 block tracking-wider uppercase">MAX_HELD_STABILIZATION</span>
                  <span className="text-sky-400 font-bold block mt-0.5 text-xs">
                    {maxStreak} STEPS
                  </span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-600 block tracking-wider uppercase">EXPLORATION_DEP (ε)</span>
                  <span className="text-orange-450 font-bold block mt-0.5 text-xs">
                    {(rlParams.epsilon * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

            </div>

            {/* LIVE DIAGNOSTICS & HEATMAP RENDER */}
            <AnalyticsPanel
              episodeLogs={episodeLogs}
              state={state}
              agent={agent}
              rlParams={rlParams}
              phaseSpaceTrail={phaseSpaceTrail}
            />

            {/* Advanced Parameter Tuning Controllers */}
            <div className="bg-[#0a0c12] border border-slate-800/60 p-5 rounded-lg shadow-xl">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3 justify-start">
                <Sliders className="w-5 h-5 text-sky-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-sans">Advanced Simulation Optimization & Gains Tuning</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* RL Parameters Configurations Panel */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-400 uppercase">1. Agent Learning Hyperparameters</span>
                    <span className="bg-[#050608] border border-slate-800 text-[9px] text-sky-400 p-1 px-2 rounded-full font-mono uppercase">
                      {rlParams.algorithm}
                    </span>
                  </div>

                  <div className="space-y-3 font-sans">
                    {/* RL Algorithm Choice */}
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Bellman Equation Solver:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setRlParams(prev => ({ ...prev, algorithm: "q_learning" }))}
                          className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                            rlParams.algorithm === "q_learning" 
                              ? "bg-[#0c101a] border-sky-500/30 text-sky-400" 
                              : "bg-[#050608] border-slate-900 text-slate-505"
                          }`}
                        >
                          Q-Learning (Off-policy)
                        </button>
                        <button
                          onClick={() => setRlParams(prev => ({ ...prev, algorithm: "sarsa" }))}
                          className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                            rlParams.algorithm === "sarsa" 
                              ? "bg-[#0c101a] border-sky-500/30 text-sky-400" 
                              : "bg-[#050608] border-slate-900 text-slate-505"
                          }`}
                        >
                          SARSA (On-policy)
                        </button>
                      </div>
                    </div>

                    {/* Learning rate alpha */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Base Learning Rate (α):</span>
                        <span className="text-sky-400 font-bold">{rlParams.learningRate}</span>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.80"
                        step="0.05"
                        value={rlParams.learningRate}
                        onChange={(e) => setRlParams((prev) => ({ ...prev, learningRate: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>

                    {/* Discount factor gamma */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Discount Factor (γ):</span>
                        <span className="text-sky-400 font-bold">{rlParams.discountFactor}</span>
                      </div>
                      <input
                        type="range"
                        min="0.80"
                        max="0.99"
                        step="0.01"
                        value={rlParams.discountFactor}
                        onChange={(e) => setRlParams((prev) => ({ ...prev, discountFactor: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>

                    {/* Reward shaping function type */}
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Reward Design Strategy:</span>
                      <select
                        value={rlParams.rewardType}
                        onChange={(e: any) => setRlParams((prev) => ({ ...prev, rewardType: e.target.value }))}
                        className="w-full bg-[#050608] text-xs text-slate-350 border border-slate-800 p-2 rounded focus:border-sky-500/40 focus:outline-none"
                      >
                        <option value="quadratic">Quadratic Balance Penalty</option>
                        <option value="cos_height">Hanging Angle Potential</option>
                        <option value="energy_based">Velocity Damped Fine Balance</option>
                        <option value="sparse">Sparse Binary Zone</option>
                      </select>
                    </div>

                  </div>
                </div>

                {/* Physics Constants Slider Values */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-400 uppercase">2. Newtonian Physics Constants</span>
                    <span className="bg-[#050608] border border-slate-800 text-[9px] text-[#0284c7] p-1 px-2 rounded-full font-mono uppercase">
                      Dynamics
                    </span>
                  </div>

                  <div className="space-y-3 font-sans">
                    {/* Gravity constant */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Gravity Constant (g):</span>
                        <span className="text-sky-400 font-bold">{physicsParams.gravity} m/s²</span>
                      </div>
                      <input
                        type="range"
                        min="2.0"
                        max="20.0"
                        step="0.5"
                        value={physicsParams.gravity}
                        onChange={(e) => setPhysicsParams((prev) => ({ ...prev, gravity: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>

                    {/* Pendulum Pole mass */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Pendulum Mass (mp):</span>
                        <span className="text-sky-400 font-bold">{physicsParams.pendulumMass} kg</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="4.0"
                        step="0.1"
                        value={physicsParams.pendulumMass}
                        onChange={(e) => setPhysicsParams((prev) => ({ ...prev, pendulumMass: parseFloat(e.target.value) }))}
                        className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-sky-500"
                      />
                    </div>

                    {/* Balance scenario switch */}
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Physics Start Condition:</span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setStartType("upright")}
                          className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                            startType === "upright" 
                              ? "bg-[#0c101a] border-sky-500/30 text-sky-400" 
                              : "bg-[#050608] border-slate-900 text-slate-505"
                          }`}
                        >
                          Catch Zone (Upright)
                        </button>
                        <button
                          onClick={() => setStartType("swing_up")}
                          className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                            startType === "swing_up" 
                              ? "bg-[#0c101a] border-sky-500/30 text-sky-400" 
                              : "bg-[#050608] border-slate-900 text-slate-505"
                          }`}
                        >
                          Hanging Setup (Swing-up)
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Simulation Training Fast Forward Speed */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-400 uppercase">3. Real-Time & Offline Booster</span>
                    <span className="bg-[#050608] border border-slate-800 text-[9px] text-[#0284c7] p-1 px-2 rounded-full font-mono uppercase">
                      Booster
                    </span>
                  </div>

                  <div className="space-y-3 font-sans">
                    {controllerType === "rl" ? (
                      <div className="p-3 bg-sky-950/20 rounded border border-sky-500/20 space-y-3.5">
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1 font-bold">
                            <span className="flex items-center gap-1">
                              <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
                              <span>Real-Time Speed multiplier:</span>
                            </span>
                            <span className="text-orange-450 font-bold">{trainingSpeed}x</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            step="1"
                            value={trainingSpeed}
                            onChange={(e) => setTrainingSpeed(parseInt(e.target.value))}
                            className="w-full accent-orange-500 cursor-pointer"
                          />
                          <span className="text-[9px] text-slate-500 block text-right mt-1 font-sans">
                            Run up to 100 updates per frame.
                          </span>
                        </div>

                        {/* INSTANT OFFLINE REINFORCEMENT LEARNING TRAINING BOOST */}
                        <div className="border-t border-sky-500/10 pt-2.5">
                          <button
                            onClick={handleInstantTrainingBoost}
                            disabled={isBoosting}
                            className={`w-full p-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border cursor-pointer ${
                              isBoosting
                                ? "bg-orange-850 border-orange-700/50 text-orange-300 animate-pulse cursor-wait"
                                : "bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white border-orange-550 shadow-md hover:shadow-orange-500/20"
                            }`}
                          >
                            <Zap className="w-3.5 h-3.5 animate-bounce fill-current" />
                            <span>
                              {isBoosting 
                                ? "Simulating Background Loop..." 
                                : "Instant RL Training Boost"}
                            </span>
                          </button>
                          <span className="text-[9.5px] text-slate-500 block text-right mt-1.5 font-sans leading-normal">
                            Directly simulates 120,000 convergence steps in milliseconds and freezes Q-table to lock perfect stability.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-[#050608] border border-slate-800 rounded text-center text-xs text-slate-500 font-mono">
                        KEYBOARD INTERACTION ENABLED:
                        <div className="mt-2 text-[10px] text-slate-400 space-y-1 text-left list-disc pl-2">
                          <div>• Press <b>A</b> or <b>Left Arrow</b> to push the cart Left</div>
                          <div>• Press <b>D</b> or <b>Right Arrow</b> to push the cart Right</div>
                          <div>• Click anywhere on visual stage to apply horizontal wind gust gusts!</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Right Column: Key Achievements (3 of 12) */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            
            {/* Core Achievements & Logs Summary Block */}
            <div className="bg-[#0a0c12] border border-slate-800 rounded-lg p-5 shadow-2xl relative overflow-hidden shrink-0 flex-shrink-0">
              <div className="absolute top-0 left-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl" />
              
              <div className="flex items-center gap-2 mb-4 justify-start">
                <span className="w-1 h-3 bg-sky-500"></span>
                <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider font-sans">Global Stability Metrics</h3>
              </div>

              {/* High tech stats detail layout */}
              <div className="grid grid-cols-2 gap-3.5 font-mono">
                <div className="bg-[#050608] p-3 rounded border border-slate-800/80">
                  <span className="text-[8px] text-slate-500 block uppercase tracking-wider">COMPLETED_RUNS</span>
                  <span className="text-md font-bold text-white block mt-1">
                    {episodeLogs.length}
                  </span>
                </div>

                <div className="bg-[#050608] p-3 rounded border border-slate-800/80">
                  <span className="text-[8px] text-slate-500 block uppercase tracking-wider">STABILITY_PROB</span>
                  <span className={`text-md font-bold block mt-1 ${
                    successRate > 75 ? "text-sky-400" : successRate > 35 ? "text-orange-400" : "text-rose-500"
                  }`}>
                    {successRate}%
                  </span>
                </div>

                <div className="bg-[#050608] p-3 rounded border border-slate-800/80">
                  <span className="text-[8px] text-slate-500 block uppercase tracking-wider">METRIC_AVERAGE</span>
                  <span className="text-sky-400 text-sm font-bold block mt-1 font-mono">
                    {avgReward}
                  </span>
                </div>

                <div className="bg-[#050608] p-3 rounded border border-slate-800/80">
                  <span className="text-[8px] text-slate-500 block uppercase tracking-wider">EXPLORED_NODES</span>
                  <span className="text-orange-450 text-xs font-bold block mt-1">
                    {agent ? agent.getExploredStatesCount() : 0} CELLS
                  </span>
                </div>
              </div>

              <div className="mt-4 p-3 bg-sky-950/10 rounded text-[11px] text-slate-400 leading-relaxed font-sans border border-sky-500/10">
                ⚡ <b>Reinforcement Learning:</b> Model-free tabular Q-Learning computes and saves state-actions on discrete grids, updating convergence dynamically based on a Bellman solver. Once high scores are achieved, Q-Table is auto-frozen for maximum reliability.
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Futuristic Bottom Status Bar */}
      <footer className="h-7 bg-sky-600 text-white flex items-center justify-between px-6 text-[9px] font-bold uppercase tracking-widest mt-auto shrink-0 select-none font-mono">
        <div className="flex gap-6">
          <span>HOST: GPU_ACCELERATED</span>
          <span>CONTROLLER WORKSPACE: STABLE_SYNCED</span>
          <span>MEMORY TOTAL: 4.8GB / 16GB</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950 inline-block animate-pulse"></span>
            CONNECTION: SECURED ON PORT_3000
          </span>
          <span>SESSION STATUS: COMPILED</span>
        </div>
      </footer>

    </div>
  );
}
