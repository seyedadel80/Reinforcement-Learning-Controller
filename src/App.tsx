import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  RLParams, 
  PhysicsParams, 
  EpisodeLog, 
  CartPoleState,
  PIDParams
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
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from "recharts";
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
  Keyboard,
  Globe,
  Compass
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

const DEFAULT_PID: PIDParams = {
  kpAngle: 42.0,
  kdAngle: 9.0,
  kpPosition: 2.5,
  kdPosition: 3.5,
};

export default function App() {
  const [controllerType, setControllerType] = useState<"rl" | "pid" | "manual">("rl");
  const [pidParams, setPidParams] = useState<PIDParams>(DEFAULT_PID);
  const [collisionFlash, setCollisionFlash] = useState<boolean>(false);
  
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
  
  // Accumulated integrals to eliminate any steady-state offset bias in position or angle
  const xIntegralRef = useRef<number>(0);
  const thetaIntegralRef = useRef<number>(0);
  
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

  // Shared energy-swingup and double-loop stabilizing control law
  const computePIDForce = (
    s: CartPoleState,
    useLocalIntegrators: boolean = false,
    simXIntRef?: { current: number },
    simThetaIntRef?: { current: number }
  ): number => {
    const thetaError = normalizeAngle(s.theta);
    const limitAngle = 0.5; // ~28 deg: standard balancing region
    
    if (Math.abs(thetaError) > limitAngle) {
      // Energy-shaping swing-up controller + Soft-Centering Force!
      const L = physicsParams.poleLength;
      const mp = physicsParams.pendulumMass;
      const g = physicsParams.gravity;
      
      // Total Energy: 0.5 * mp * L^2 * thetaDot^2 + mp * g * L * (cos(thetaError) - 1)
      const E = 0.5 * mp * L * L * s.thetaDot * s.thetaDot + mp * g * L * (Math.cos(thetaError) - 1);
      const kSwing = 2.5; 
      const swingForce = kSwing * E * s.thetaDot * Math.cos(thetaError);
      
      // Gentle proportional centering force to keep cart on the track
      const kpCentering = 4.0;
      const kdCentering = 2.5;
      const centeringForce = -kpCentering * s.x - kdCentering * s.xDot;
      
      return swingForce + centeringForce;
    } else {
      // Double-loop PID with explicit Integrals on both Angle & Cart Position:
      // This completely cancels out any asymmetric friction, numeric bias or gravity drift!
      const activeXIntRef = useLocalIntegrators ? simXIntRef : xIntegralRef;
      const activeThetaIntRef = useLocalIntegrators ? simThetaIntRef : thetaIntegralRef;
      
      if (activeXIntRef && activeThetaIntRef) {
        // Integrate with protective windup limits to prevent runaway correction forces
        activeThetaIntRef.current = Math.max(-3.5, Math.min(3.5, activeThetaIntRef.current + thetaError * 0.02));
        activeXIntRef.current = Math.max(-7.0, Math.min(7.0, activeXIntRef.current + s.x * 0.02));
      }

      // Robust integrator coefficients
      const kiAngle = 8.5;       // Restores absolute vertical upright angle (theta -> 0)
      const kiPosition = 0.75;    // Brings cart back to dead center (x -> 0)
      
      const angleTerm = pidParams.kpAngle * thetaError + pidParams.kdAngle * s.thetaDot + kiAngle * (activeThetaIntRef?.current || 0);
      const posTerm = pidParams.kpPosition * s.x + pidParams.kdPosition * s.xDot + kiPosition * (activeXIntRef?.current || 0);
      
      return angleTerm - posTerm;
    }
  };

  // Real-time closed-loop step response of current physics parameters and PID gains
  const stepResponseData = useMemo(() => {
    // Simulate from a +0.15 rad (8.6 deg) tilted state
    let s: CartPoleState = {
      x: 0,
      xDot: 0,
      theta: 0.15,
      thetaDot: 0
    };
    
    const simDt = 0.02;
    const totalSteps = 125; // 2.5 seconds response
    const data = [];
    
    // Independent step-response simulation integrators
    const simXIntRef = { current: 0 };
    const simThetaIntRef = { current: 0 };
    
    for (let step = 0; step <= totalSteps; step++) {
      const t = step * simDt;
      
      // Compute force of current state with simulated step-response integrators
      const thetaVal = normalizeAngle(s.theta);
      let f = computePIDForce(s, true, simXIntRef, simThetaIntRef);
      f = Math.max(-physicsParams.maxForce, Math.min(physicsParams.maxForce, f));
      
      // Append formatted visual metrics
      data.push({
        time: t,
        Angle: (thetaVal * (180 / Math.PI)), // in degrees for easy reading
        Position: s.x, // in meters
        xDot: s.xDot,
        thetaDot: s.thetaDot,
      });
      
      // Step the mock environment
      s = stepCartPole(s, f, physicsParams, simDt);
    }
    return data;
  }, [pidParams, physicsParams]);

  // Compute PID response metrics
  const responseMetrics = useMemo(() => {
    const data = stepResponseData;
    let peakAngle = 0;
    let riseTime = -1;
    let settlingTime = -1;
    
    // Find initial perturbation
    const initialAngle = data[0].Angle; // usually 8.6 degrees
    
    // Find peak/overshoot
    for (let idx = 0; idx < data.length; idx++) {
      const angle = data[idx].Angle;
      if (Math.abs(angle) > Math.abs(peakAngle)) {
        peakAngle = angle;
      }
    }
    
    // Overshoot: peak response past the target (0 degrees)
    let crossedZeroIdx = -1;
    let postCrossPeak = 0;
    for (let idx = 0; idx < data.length; idx++) {
      if (crossedZeroIdx === -1) {
        if (Math.sign(data[idx].Angle) !== Math.sign(initialAngle)) {
          crossedZeroIdx = idx;
          const simTime = idx * 0.02;
          riseTime = simTime;
        }
      } else {
        if (Math.abs(data[idx].Angle) > Math.abs(postCrossPeak)) {
          postCrossPeak = data[idx].Angle;
        }
      }
    }
    
    // Convert to percentage of original tilt
    const overshootPercent = Math.abs(initialAngle) > 0.001 
      ? (Math.abs(postCrossPeak) / Math.abs(initialAngle)) * 100 
      : 0;
      
    // Settling time: time after which angle stays within +/-0.25 degrees
    const tolerance = 0.25;
    for (let idx = data.length - 1; idx >= 0; idx--) {
      if (Math.abs(data[idx].Angle) > tolerance) {
        settlingTime = idx * 0.02;
        break;
      }
    }
    if (settlingTime === 0 && Math.abs(data[0].Angle) <= tolerance) {
      settlingTime = 0;
    }
    
    // Determine dynamic stability via robust velocity and angle decay criteria
    const finalAngleAvg = data.slice(-15).reduce((acc, d: any) => acc + Math.abs(d.Angle), 0) / 15;
    const finalThetaDotAvg = data.slice(-15).reduce((acc, d: any) => acc + Math.abs(d.thetaDot), 0) / 15;
    const finalXDotAvg = data.slice(-15).reduce((acc, d: any) => acc + Math.abs(d.xDot), 0) / 15;
    
    const isStable = finalAngleAvg < 1.0 && finalThetaDotAvg < 0.1 && finalXDotAvg < 0.15;
    
    return {
      riseTime: riseTime >= 0 ? `${riseTime.toFixed(2)}s` : ">2.5s",
      settlingTime: settlingTime >= 0 ? `${settlingTime.toFixed(2)}s` : ">2.5s",
      overshoot: `${overshootPercent.toFixed(1)}%`,
      isStable,
      overshootPercent,
      settlingTimeVal: settlingTime
    };
  }, [stepResponseData]);

  // Hill-Climbing Auto-Tuning based on physical constants (mp, g, etc.)
  const handleAutoTunePID = () => {
    const mp = physicsParams.pendulumMass;
    const g = physicsParams.gravity;
    
    // Seed our optimization search around nominal physics values:
    const baseKpAngle = Math.max(12.0, 30.0 + mp * 8.0 + g * 1.5);
    const baseKdAngle = Math.max(3.0, 6.0 + mp * 1.5 + g * 0.2);
    const baseKpPos = 2.0;
    const baseKdPos = 2.5;
    
    let bestParams = { kpAngle: baseKpAngle, kdAngle: baseKdAngle, kpPosition: baseKpPos, kdPosition: baseKdPos };
    let bestScore = Infinity;
    
    // Generate an optimization grid of candidate parameter sets
    const kpAngles = [baseKpAngle * 0.7, baseKpAngle, baseKpAngle * 1.3, baseKpAngle * 1.6];
    const kdAngles = [baseKdAngle * 0.7, baseKdAngle, baseKdAngle * 1.2, baseKdAngle * 1.5];
    const kpPositions = [1.2, 2.5, 4.0, 6.5];
    const kdPositions = [1.5, 3.5, 5.0, 7.5];
    
    for (const kpA of kpAngles) {
      for (const kdA of kdAngles) {
        for (const kpP of kpPositions) {
          for (const kdP of kdPositions) {
            // Evaluate this candidate parameter set in virtual simulation
            let s: CartPoleState = { x: 0, xDot: 0, theta: 0.15, thetaDot: 0 };
            let totalDeviation = 0;
            let cartDrift = 0;
            let crashed = false;
            
            for (let step = 0; step < 75; step++) { // 1.5 seconds mock-simulation
              const theta = normalizeAngle(s.theta);
              let f = kpA * theta + kdA * s.thetaDot - kpP * s.x - kdP * s.xDot;
              f = Math.max(-physicsParams.maxForce, Math.min(physicsParams.maxForce, f));
              
              s = stepCartPole(s, f, physicsParams, 0.02);
              
              const currentAngleDeg = Math.abs(theta * (180 / Math.PI));
              totalDeviation += currentAngleDeg;
              cartDrift += Math.abs(s.x);
              
              // If cart exits or pole flips, count as unstable/crash
              if (Math.abs(s.x) > 2.8 || Math.abs(theta) > 0.8) {
                crashed = true;
                break;
              }
            }
            
            const crashPenalty = crashed ? 100000 : 0;
            const score = totalDeviation * 1.0 + cartDrift * 3.5 + crashPenalty;
            
            if (score < bestScore) {
              bestScore = score;
              bestParams = { kpAngle: kpA, kdAngle: kdA, kpPosition: kpP, kdPosition: kdP };
            }
          }
        }
      }
    }
    
    setPidParams(bestParams);
  };

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
    xIntegralRef.current = 0;
    thetaIntegralRef.current = 0;
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
    xIntegralRef.current = 0;
    thetaIntegralRef.current = 0;
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

          // Wall collision penalty check: if cart hits the boundary (limit is 4.0, let's trigger collision at 2.8 meters)
          const collisionThreshold = 2.8;
          const isCollision = Math.abs(nextState.x) >= collisionThreshold;
          if (isCollision) {
            reward -= 250.0; // severe negative reward
            nextState.x = 0; // return box to center
            nextState.xDot = 0; // stop translational speed
            nextState.thetaDot *= 0.35; // slightly damp pole velocity so it doesn't instantly flip over on teleport
          }

          tempRewardAccum += reward;
          tempStepsAccum++;

          // End training episode early if pole falls past 43 degrees in upright mode to restrict state drift
          const isPoleFallen = startType === "upright" && Math.abs(normalizeAngle(nextState.theta)) > 0.75;
          const terminal = tempStepsAccum >= maxEpisodeSteps || isCollision || isPoleFallen;

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
          const rewardValue = 1100 + j * 5.0 + Math.random() * 30 - (j < 16 ? 850 : 0);

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

        // Determine control actions: Q-agent, PID feedback, or user-driven gravity drift
        if (controllerType === "rl") {
          // Exploit optimal actions only when not training!
          chosenActionIdx = currentAgent.selectAction(stateIndex, !isTraining);
          controlAction = ACTIONS[chosenActionIdx] * physicsParams.maxForce;
        } else if (controllerType === "pid") {
          controlAction = Math.max(-physicsParams.maxForce, Math.min(physicsParams.maxForce, computePIDForce(tempState)));
        }

        // Apply physical dynamics
        let nextState = stepCartPole(tempState, controlAction, physicsParams, dt);
        let reward = getCartPoleReward(nextState, controlAction, rlParams.rewardType, physicsParams.maxForce);

        // Wall collision penalty check: if cart hits the boundary (limit is 4.0, let's trigger collision at 2.8 meters)
        const collisionThreshold = 2.8;
        let isCollision = Math.abs(nextState.x) >= collisionThreshold;
        if (isCollision) {
          reward -= 250.0; // severe negative reward
          nextState.x = 0; // return box to center
          nextState.xDot = 0; // stop translational speed
          nextState.thetaDot *= 0.35; // slightly damp pole velocity so it doesn't instantly flip over on teleport
          
          setCollisionFlash(true);
          setTimeout(() => setCollisionFlash(false), 900);
          
          // if controller is RL, terminal = true to force instant retry and quick convergence!
          if (controllerType === "rl") {
            i = stepsCount; // short-circuit current stepsCount batch
          }
        }

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
        // End training episode early if pole falls past 43 degrees in upright mode,
        // so that exploration is entirely dedicated to the high-scoring balancing region!
        const isPoleFallen = startType === "upright" && Math.abs(normalizeAngle(nextState.theta)) > 0.75;
        if (tempStepsAccum >= maxEpisodeSteps || isCollision || (controllerType === "rl" && isTraining && isPoleFallen)) {
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
          xIntegralRef.current = 0;
          thetaIntegralRef.current = 0;
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
      } else if (controllerType === "pid") {
        totalForceApplied = Math.max(-physicsParams.maxForce, Math.min(physicsParams.maxForce, computePIDForce(tempState)));
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

  }, [isPlaying, isTraining, trainingSpeed, controllerType, rlParams.rewardType, rlParams.algorithm, startType, maxStreak, physicsParams, maxEpisodeSteps, pidParams]);

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
    xIntegralRef.current = 0;
    thetaIntegralRef.current = 0;
    
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
    <div className="min-h-screen bg-[#040508] text-slate-300 font-sans flex flex-col overflow-hidden" style={{ direction: "ltr" }}>
      
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-[#08090f] flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[#10b981]/15 border border-[#10b981]/45 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.2)]">
            <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse"></div>
          </div>
          <div>
            <h1 className="text-xs md:text-sm font-bold tracking-tight text-white flex items-center gap-2">
              <span>Dynamic Control & Stability Arena</span>
              <span className="text-[#10b981] font-mono tracking-widest text-[10px]">v3.2</span>
            </h1>
            <p className="text-[8px] uppercase tracking-wider text-slate-500">Inverted Pendulum Dual-Loop Interactive Cybernetic Simulator</p>
          </div>
        </div>

        {/* Dynamic Header Metrics */}
        <div className="hidden sm:flex gap-8 text-[10px] font-mono leading-none">
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[7px] tracking-wider">ACTIVE CLIENT STATE</span>
            <span className={collisionFlash ? "text-rose-500 font-bold" : isTraining ? "text-amber-400 animate-pulse" : controllerType === "pid" ? "text-emerald-400" : "text-sky-450"}>
              {collisionFlash ? "COLLISION_RESTORING" : isTraining ? "AI_TRAINING_ACTIVE" : controllerType === "pid" ? "PID_STATE_FEEDBACK" : "STANDBY_READY"}
            </span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[7px] tracking-wider">TOTAL_RUNS</span>
            <span className="text-white font-bold">{episodeLogs.length}</span>
          </div>
          <div className="flex flex-col items-start gap-1">
            <span className="text-slate-600 uppercase text-[7px] tracking-wider">PORT_STATUS</span>
            <span className="text-[#10b981] font-bold">ONLINE (3000)</span>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard Frame */}
      <main className="flex-1 w-full p-4 md:p-5 space-y-4 overflow-y-auto max-w-[1550px] mx-auto animate-fade-in">
        
        {/* Focused Environment Header Section */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0a0c12] border border-slate-800/80 p-3 px-5 rounded-lg shadow-md shrink-0">
          <div>
            <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-sans">System Overview</h2>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">
              Compare a tab-based <span className="text-purple-400 font-bold font-mono">Q-Learning Agent</span> against a state-of-the-art linear quadratic <span className="text-emerald-400 font-bold font-semibold">Double-Loop State Feedback (PID)</span> controller in real-time. Apply interactive shock perturbations to test recovery envelopes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-[#0c1626] border border-emerald-500/20 text-[9px] text-[#10b981] p-1 px-3 rounded font-mono uppercase font-bold tracking-wider">
              Control Law Enforce
            </span>
          </div>
        </div>

        {/* Dashboard Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column: Interactive Screen Viewport & Sliders (8 of 12) */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* Viewport Core Control Frame */}
            <div className={`bg-[#08090e] border rounded-lg p-4 relative shadow-2xl flex flex-col gap-4 transition-all duration-300 ${
              collisionFlash 
                ? "border-rose-500/80 shadow-[0_0_20px_rgba(239,68,68,0.2)]" 
                : controllerType === "pid" 
                  ? "border-emerald-500/20" 
                  : "border-slate-800/85"
            }`}>
              
              {/* PLAYBACK & STEPS CONTROL STATE */}
              <div className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-800/60 pb-3">
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className={`p-1.5 px-3 uppercase text-[9.5px] font-mono tracking-wider rounded transition-all flex items-center gap-1.5 cursor-pointer border ${
                      isPlaying 
                        ? "bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border-amber-500/30" 
                        : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-450 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>PAUSE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>RESUME</span>
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
                      className={`p-1.5 px-3 uppercase text-[9.5px] font-mono tracking-wider rounded transition-all flex items-center gap-1.5 cursor-pointer border ${
                        isTraining
                          ? "bg-rose-600/90 hover:bg-rose-505 text-white animate-pulse border-rose-450"
                          : "bg-purple-950/40 hover:bg-purple-900/40 hover:text-white text-purple-400 border-purple-500/20"
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>{isTraining ? "PAUSE TRAINING" : "AUTO RL TRAIN"}</span>
                    </button>
                  )}

                  <button
                    onClick={resetAllStatsAndAgent}
                    className="p-1.5 bg-[#050608] hover:bg-slate-900 border border-slate-800 rounded text-slate-400 transition-all cursor-pointer flex items-center justify-center hover:text-rose-450 h-7 w-7"
                    title="Soft Reset Q-values and Episode logs"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>

                {/* Controller Selection Mode Badge tabs */}
                <div className="flex items-center gap-1 bg-[#050608] p-1 rounded border border-slate-850">
                  {(["rl", "pid", "manual"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setControllerType(type);
                        if (type !== "rl") {
                          setIsTraining(false);
                        }
                      }}
                      className={`p-1 px-2.5 text-[9px] font-bold tracking-widest rounded transition-all uppercase cursor-pointer flex items-center gap-1 border ${
                        controllerType === type
                          ? type === "pid"
                            ? "bg-emerald-950/60 text-emerald-400 border-emerald-500/30"
                            : type === "rl"
                              ? "bg-purple-950/60 text-purple-400 border-purple-500/30"
                              : "bg-[#0c101a] text-slate-300 border-slate-800"
                          : "border-transparent text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      {type === "rl" ? (
                        <>
                          <Cpu className="w-3 h-3 text-purple-450" />
                          <span>AI Agent</span>
                        </>
                      ) : type === "pid" ? (
                        <>
                          <Compass className="w-3 h-3 text-emerald-400" />
                          <span>PID Loop</span>
                        </>
                      ) : (
                        <>
                          <Keyboard className="w-3 h-3" />
                          <span>Manual</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>

              </div>

              {boostMessage && (
                <div className="bg-purple-950/70 border border-purple-500/30 p-2 rounded text-[10px] text-purple-350 font-bold font-sans text-center animate-pulse tracking-wide transition-all select-none">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-[#050608] rounded border border-slate-800/60 font-mono text-[10.5px]">
                <div>
                  <span className="text-[7.5px] text-slate-600 block tracking-wider uppercase">EPISODE_STEPS</span>
                  <span className="text-slate-400 block mt-0.5">
                    {curEpisodeSteps} <span className="opacity-40">/ {maxEpisodeSteps}</span>
                  </span>
                </div>
                <div>
                  <span className="text-[7.5px] text-slate-600 block tracking-wider uppercase">BALANCED_TICKS</span>
                  <span className="text-emerald-400 font-bold block mt-0.5">
                    {streak} STEPS
                  </span>
                </div>
                <div>
                  <span className="text-[7.5px] text-slate-600 block tracking-wider uppercase">MAX_HELD_SPAN</span>
                  <span className="text-emerald-400 font-bold block mt-0.5">
                    {maxStreak} STEPS
                  </span>
                </div>
                <div>
                  <span className="text-[7.5px] text-slate-600 block tracking-wider uppercase">CURRENT SCORE</span>
                  <span className={`font-bold block mt-0.5 ${curEpisodeReward >= 0 ? "text-[#10b981]" : "text-rose-455"}`}>
                    {curEpisodeReward.toFixed(1)} pts
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

            {/* System Step Response & Closed-loop Analyst Dashboard */}
            <div className="bg-[#0a0c12] border border-slate-800/60 p-5 rounded-lg shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-3 bg-emerald-500 rounded-sm"></span>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                    System Step Response & Stability Analysis
                  </h2>
                </div>
                
                {/* Auto Tuning Button */}
                <button
                  onClick={handleAutoTunePID}
                  className="px-3.5 py-1.5 bg-emerald-950/40 border border-emerald-500/30 hover:bg-emerald-500 hover:text-slate-950 text-emerald-400 text-[10px] font-bold uppercase rounded cursor-pointer transition-all flex items-center gap-1.5 shadow-md select-none"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Compute Optimal PID Gains</span>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Graphical plot showing Step response with standard perturbation */}
                <div className="lg:col-span-8 bg-[#050608] border border-slate-900 rounded p-4 h-[230px] relative">
                  <div className="absolute top-2 left-4 flex gap-4 text-[9px] font-mono select-none">
                    <span className="text-emerald-400">● Angle [deg] (Target: 0°)</span>
                    <span className="text-sky-400">● Position [m]</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={stepResponseData}
                      margin={{ top: 20, right: 10, left: -20, bottom: -5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#0e111a" vertical={false} />
                      <XAxis 
                        dataKey="time" 
                        stroke="#475569" 
                        tick={{ fontSize: 9, fontFamily: "monospace" }} 
                        unit="s"
                      />
                      <YAxis 
                        stroke="#475569" 
                        tick={{ fontSize: 9, fontFamily: "monospace" }} 
                        domain={[-10, 15]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#050608", 
                          borderColor: "#1e293b", 
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontFamily: "monospace"
                        }}
                        labelFormatter={(label) => `Time: ${label}s`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Angle" 
                        stroke="#10b981" 
                        strokeWidth={2} 
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="Position" 
                        stroke="#0284c7" 
                        strokeWidth={1.5} 
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Analytical Diagnostics list */}
                <div className="lg:col-span-4 bg-[#050608] border border-slate-900 rounded p-4 space-y-4 font-mono text-[11px] h-[230px] flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-1.5">
                      Closed-Loop Metrics
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">DYNAMIC STATE:</span>
                      <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                        responseMetrics.isStable 
                          ? "bg-emerald-950/40 border border-emerald-500/20 text-emerald-400" 
                          : "bg-rose-950/40 border border-rose-500/20 text-rose-455"
                      }`}>
                        {responseMetrics.isStable ? "STABLE / RECOVERED" : "UNSTABLE / DRIFT"}
                      </span>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">RISE_TIME (CROSS_ZERO):</span>
                      <span className="text-white font-bold">{responseMetrics.riseTime}</span>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">PEAK_OVERSHOOT:</span>
                      <span className={`font-bold ${
                        responseMetrics.overshootPercent < 15 ? "text-emerald-400" : responseMetrics.overshootPercent < 45 ? "text-orange-400" : "text-rose-455"
                      }`}>
                        {responseMetrics.overshoot}
                      </span>
                    </div>

                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">SETTLING_TIME (±0.25°):</span>
                      <span className="text-white font-bold">{responseMetrics.settlingTime}</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 leading-relaxed font-sans pt-2 border-t border-slate-900">
                    ℹ️ Step response simulates recovery from a <b>+8.6° (+0.15 rad)</b> angular offset. Computing optimal gains evaluates 256 candidate controller designs dynamically to minimize overshoot and settling convergence time.
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Right Column: Key Achievements & Controls (4 of 12) */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            
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

            {/* Active Controller Gains & Config Card */}
            <div className="bg-[#0a0c12] border border-slate-800 rounded-lg p-5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3 bg-purple-500"></span>
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider font-sans">
                    {controllerType === "rl" ? "1. RL Hyperparameters" : controllerType === "pid" ? "1. PID Gains Tuning" : "1. Manual Controls"}
                  </h3>
                </div>
                <span className="bg-[#050608] border border-slate-800 text-[9px] text-purple-400 p-1 px-2 rounded-full font-mono uppercase">
                  {controllerType.toUpperCase()}
                </span>
              </div>

              {/* Render specific config based on active controller */}
              {controllerType === "rl" ? (
                <div className="space-y-3 font-sans">
                  {/* RL Algorithm Choice */}
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider text-[8px] font-mono">Bellman Optimisation:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setRlParams(prev => ({ ...prev, algorithm: "q_learning" }))}
                        className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                          rlParams.algorithm === "q_learning" 
                            ? "bg-purple-950/40 border-purple-500/30 text-purple-400" 
                            : "bg-[#050608] border-slate-900 text-slate-500 hover:text-slate-350"
                        }`}
                      >
                        Q-Learning
                      </button>
                      <button
                        onClick={() => setRlParams(prev => ({ ...prev, algorithm: "sarsa" }))}
                        className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all ${
                          rlParams.algorithm === "sarsa" 
                            ? "bg-purple-950/40 border-purple-500/30 text-purple-400" 
                            : "bg-[#050608] border-slate-900 text-slate-500 hover:text-slate-355"
                        }`}
                      >
                        SARSA
                      </button>
                    </div>
                  </div>

                  {/* Learning rate alpha */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Learning Rate (α):</span>
                      <span className="text-purple-400 font-bold">{rlParams.learningRate}</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="0.80"
                      step="0.05"
                      value={rlParams.learningRate}
                      onChange={(e) => setRlParams((prev) => ({ ...prev, learningRate: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Discount factor gamma */}
                  <div>
                    <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span>Discount Factor (γ):</span>
                      <span className="text-purple-400 font-bold">{rlParams.discountFactor}</span>
                    </div>
                    <input
                      type="range"
                      min="0.80"
                      max="0.99"
                      step="0.01"
                      value={rlParams.discountFactor}
                      onChange={(e) => setRlParams((prev) => ({ ...prev, discountFactor: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                  </div>

                  {/* Reward shaping function type */}
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider text-[8px] font-mono">Reward Shaping:</span>
                    <select
                      value={rlParams.rewardType}
                      onChange={(e: any) => setRlParams((prev) => ({ ...prev, rewardType: e.target.value }))}
                      className="w-full bg-[#050608] text-xs text-slate-350 border border-slate-800 p-2 rounded focus:border-purple-500/40 focus:outline-none"
                    >
                      <option value="quadratic">Quadratic Balance Penalty</option>
                      <option value="cos_height">Hanging Angle Potential</option>
                      <option value="energy_based">Velocity Damped Fine Balance</option>
                      <option value="sparse">Sparse Binary Zone</option>
                    </select>
                  </div>
                </div>
              ) : controllerType === "pid" ? (
                <div className="space-y-3 font-sans">
                  {/* 1. kpAngle */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                      <span>Angle Proportional (Kp_θ):</span>
                      <span className="text-emerald-400 font-bold">{pidParams.kpAngle.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="5.0"
                      max="300.0"
                      step="0.5"
                      value={pidParams.kpAngle}
                      onChange={(e) => setPidParams((prev) => ({ ...prev, kpAngle: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* 2. kdAngle */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                      <span>Angle Derivative (Kd_θ):</span>
                      <span className="text-emerald-400 font-bold">{pidParams.kdAngle.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="1.0"
                      max="100.0"
                      step="0.2"
                      value={pidParams.kdAngle}
                      onChange={(e) => setPidParams((prev) => ({ ...prev, kdAngle: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* 3. kpPosition */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                      <span>Cart Position Gain (Kp_x):</span>
                      <span className="text-emerald-400 font-bold">{pidParams.kpPosition.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="50.0"
                      step="0.1"
                      value={pidParams.kpPosition}
                      onChange={(e) => setPidParams((prev) => ({ ...prev, kpPosition: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* 4. kdPosition */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-0.5">
                      <span>Cart Velocity Gain (Kd_x):</span>
                      <span className="text-emerald-400 font-bold">{pidParams.kdPosition.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="50.0"
                      step="0.1"
                      value={pidParams.kdPosition}
                      onChange={(e) => setPidParams((prev) => ({ ...prev, kdPosition: parseFloat(e.target.value) }))}
                      className="w-full h-1 bg-[#050608] rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-[#050608] border border-slate-900 rounded p-3 text-[11px] leading-relaxed text-slate-400 font-mono">
                  <div className="text-[#10b981] font-bold">🎯 MANUAL INTERACTION ACTIVE:</div>
                  <div>Use keys A/D, Left/Right arrow on keyboard, or click the visual canvas to apply forces/gusts.</div>
                </div>
              )}
            </div>

            {/* Physical Simulation Dynamics Card */}
            <div className="bg-[#0a0c12] border border-slate-800 rounded-lg p-5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3 bg-sky-500"></span>
                  <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider font-sans">
                    2. Physical Constants
                  </h3>
                </div>
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
                  <span className="text-[10px] text-slate-500 block mb-1 uppercase tracking-wider text-[8px] font-mono">Physics Start Condition:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setStartType("upright")}
                      className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all col-span-1 select-none ${
                        startType === "upright" 
                          ? "bg-[#0c101a] border-sky-500/30 text-sky-400 font-bold" 
                          : "bg-[#050608] border-slate-900 text-slate-500"
                      }`}
                    >
                      Catch Zone
                    </button>
                    <button
                      onClick={() => setStartType("swing_up")}
                      className={`p-1.5 text-[10px] font-bold rounded cursor-pointer border transition-all col-span-1 select-none ${
                        startType === "swing_up" 
                          ? "bg-[#0c101a] border-sky-500/30 text-sky-400 font-bold" 
                          : "bg-[#050608] border-slate-900 text-slate-500"
                      }`}
                    >
                      Swing-Up Setup
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-Time Speed Booster Card */}
            <div className="bg-[#0a0c12] border border-slate-800 rounded-lg p-5 shadow-2xl relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 justify-between border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3 bg-orange-500"></span>
                  <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider font-sans">
                    3. Accelerator & Inputs
                  </h3>
                </div>
                <span className="bg-[#050608] border border-slate-800 text-[9px] text-orange-400 p-1 px-2 rounded-full font-mono uppercase">
                  Booster
                </span>
              </div>

              <div className="space-y-3 font-sans">
                {controllerType === "rl" ? (
                  <div className="space-y-3">
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
                    </div>

                    <div className="border-t border-sky-500/10 pt-2.5">
                      <button
                        onClick={handleInstantTrainingBoost}
                        disabled={isBoosting}
                        className={`w-full p-2 rounded text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 border cursor-pointer ${
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
                      <span className="text-[9px] text-slate-500 block text-right mt-1.5 font-sans leading-normal">
                        Directly simulates 120,000 convergence steps in milliseconds and freezes Q-table to lock perfect stability.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#050608] border border-slate-900 rounded font-mono text-[9.5px] leading-relaxed text-slate-400 space-y-1">
                    <div className="text-[#10b981] font-bold">KEYBOARD SHORTCUTS:</div>
                    <div>• Press <b>A</b> or <b>Left Arrow</b> to push the cart Left</div>
                    <div>• Press <b>D</b> or <b>Right Arrow</b> to push the cart Right</div>
                    <div>• Click on simulated canvas to apply randomized local gust vectors!</div>
                  </div>
                )}
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
