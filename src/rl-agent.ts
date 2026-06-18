import { RLParams, EnvType } from "./types";
import { normalizeAngle } from "./simulator";

// Discrete force actions mapping:
// 0: Negative force/torque (-MaxForce)
// 1: No force/torque (0)
// 2: Positive force/torque (+MaxForce)
export const ACTIONS = [-1, 0, 1] as const;
export type ActionIndex = 0 | 1 | 2;

export class RLAgent {
  // tabular Q value storage: StateIndex -> number[3] (for 3 action values)
  public qTable: Map<number, [number, number, number]>;
  private params: RLParams;
  private envType: EnvType;

  // Track exploration vs exploitation counts
  public exploreCount = 0;
  public exploitCount = 0;

  constructor(envType: EnvType, params: RLParams) {
    this.envType = envType;
    this.params = params;
    this.qTable = new Map();
  }

  /**
   * Discretizes Cart-Pole Continuous State to 1D index
   * Space: 4D state space [x, xDot, theta, thetaDot]
   * We assign: 3 x 3 x 10 x 10 = 900 states
   */
  public discretizeCartPole(
    x: number,
    xDot: number,
    theta: number,
    thetaDot: number
  ): number {
    const xBins = 3;
    const xDotBins = 3;
    const tBins = 10;
    const tDotBins = 10;

    // x position bounds [-4.0, 4.0]
    const xFraction = (x + 4.0) / 8.0;
    const xBin = Math.max(0, Math.min(xBins - 1, Math.floor(xFraction * xBins)));

    // xDot bounds [-4.0, 4.0]
    const maxCartSpeed = 4.0;
    const xDotFraction = (Math.max(-maxCartSpeed, Math.min(maxCartSpeed, xDot)) + maxCartSpeed) / (2 * maxCartSpeed);
    const xDotBin = Math.max(0, Math.min(xDotBins - 1, Math.floor(xDotFraction * xDotBins)));

    // theta is normalized in [-pi, pi], warped near zero for better stabilization density
    const thetaNorm = normalizeAngle(theta);
    const thetaWarped = Math.sign(thetaNorm) * Math.pow(Math.abs(thetaNorm) / Math.PI, 0.6);
    const tBin = Math.max(0, Math.min(tBins - 1, Math.floor(((thetaWarped + 1) / 2) * tBins)));

    // thetaDot bounds [-8.0, 8.0]
    const maxPoleSpeed = 8.0;
    const tDotClamped = Math.max(-maxPoleSpeed, Math.min(maxPoleSpeed, thetaDot));
    const tDotWarped = Math.sign(tDotClamped) * Math.pow(Math.abs(tDotClamped) / maxPoleSpeed, 0.7);
    const tDotBin = Math.max(0, Math.min(tDotBins - 1, Math.floor(((tDotWarped + 1) / 2) * tDotBins)));

    // Flatten to 1D index [0..899]
    return xBin + 
           xBins * (
             xDotBin + 
             xDotBins * (
               tBin + 
               tBins * tDotBin
             )
           );
  }

  /**
   * Discretizes Double Joint Inverted Pendulum (2-DoF Double Pendulum) State
   * Space: 4D state space [theta1, theta1Dot, theta2, theta2Dot]
   * We assign: 6 x 5 x 6 x 5 = 900 states 
   */
  public discretizeDoublePendulum(
    theta1: number,
    theta1Dot: number,
    theta2: number,
    theta2Dot: number
  ): number {
    const t1Bins = 6;
    const t1DotBins = 5;
    const t2Bins = 6;
    const t2DotBins = 5;

    // Outer and inner joints use our warping function for stabilization priority
    const t1Norm = normalizeAngle(theta1);
    const t1Warped = Math.sign(t1Norm) * Math.pow(Math.abs(t1Norm) / Math.PI, 0.6);
    const t1Bin = Math.max(0, Math.min(t1Bins - 1, Math.floor(((t1Warped + 1) / 2) * t1Bins)));

    const maxSpeed1 = 10.0;
    const t1DotClamped = Math.max(-maxSpeed1, Math.min(maxSpeed1, theta1Dot));
    const t1DotWarped = Math.sign(t1DotClamped) * Math.pow(Math.abs(t1DotClamped) / maxSpeed1, 0.7);
    const t1DotBin = Math.max(0, Math.min(t1DotBins - 1, Math.floor(((t1DotWarped + 1) / 2) * t1DotBins)));

    const t2Norm = normalizeAngle(theta2);
    const t2Warped = Math.sign(t2Norm) * Math.pow(Math.abs(t2Norm) / Math.PI, 0.6);
    const t2Bin = Math.max(0, Math.min(t2Bins - 1, Math.floor(((t2Warped + 1) / 2) * t2Bins)));

    const maxSpeed2 = 12.0;
    const t2DotClamped = Math.max(-maxSpeed2, Math.min(maxSpeed2, theta2Dot));
    const t2DotWarped = Math.sign(t2DotClamped) * Math.pow(Math.abs(t2DotClamped) / maxSpeed2, 0.7);
    const t2DotBin = Math.max(0, Math.min(t2DotBins - 1, Math.floor(((t2DotWarped + 1) / 2) * t2DotBins)));

    // Flatten multidirectional 4D state array to 1D index [0..899]
    return t1Bin + 
           t1Bins * (
             t1DotBin + 
             t1DotBins * (
               t2Bin + 
               t2Bins * t2DotBin
             )
           );
  }

  /**
   * Retrieves the discrete state identifier based on environment
   */
  public getStateIndex(state: any): number {
    if (this.envType === "cartpole") {
      const x = state.x !== undefined ? state.x : 0;
      const xDot = state.xDot !== undefined ? state.xDot : 0;
      const t = state.theta !== undefined ? state.theta : 0;
      const td = state.thetaDot !== undefined ? state.thetaDot : 0;
      return this.discretizeCartPole(x, xDot, t, td);
    } else {
      // Fallback safely if properties are temporarily uninitialized during component transitions
      const t1 = state.theta1 !== undefined ? state.theta1 : (state.theta || 0);
      const t1d = state.theta1Dot !== undefined ? state.theta1Dot : (state.thetaDot || 0);
      const t2 = state.theta2 !== undefined ? state.theta2 : 0;
      const t2d = state.theta2Dot !== undefined ? state.theta2Dot : 0;
      
      return this.discretizeDoublePendulum(t1, t1d, t2, t2d);
    }
  }

  /**
   * Returns Q values array for a state, initializing if absent
   */
  public getQValues(stateIndex: number): [number, number, number] {
    if (!this.qTable.has(stateIndex)) {
      // Initialize with small random values to break symmetry
      const initial: [number, number, number] = [
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.01,
        (Math.random() - 0.5) * 0.01
      ];
      this.qTable.set(stateIndex, initial);
    }
    return this.qTable.get(stateIndex)!;
  }

  /**
   * selectAction using Epsilon-Greedy policy
   */
  public selectAction(stateIndex: number, forceExploit = false): ActionIndex {
    const qValues = this.getQValues(stateIndex);
    
    if (!forceExploit && Math.random() < this.params.epsilon) {
      this.exploreCount++;
      // Return 0, 1 or 2 randomly
      return Math.floor(Math.random() * 3) as ActionIndex;
    } else {
      this.exploitCount++;
      // Argmax across action options
      let maxVal = -Infinity;
      let argmax: ActionIndex = 1; // Default to stay (no force)
      
      // Tie breaking
      const bestActions: ActionIndex[] = [];
      for (let i = 0; i < 3; i++) {
        const q = qValues[i];
        if (q > maxVal) {
          maxVal = q;
          bestActions.length = 0;
          bestActions.push(i as ActionIndex);
        } else if (Math.abs(q - maxVal) < 1e-7) {
          bestActions.push(i as ActionIndex);
        }
      }
      
      if (bestActions.length > 0) {
        argmax = bestActions[Math.floor(Math.random() * bestActions.length)];
      }
      return argmax;
    }
  }

  /**
   * Updates state value using Bellman Equation details
   */
  public updateValue(
    stateIndex: number,
    action: ActionIndex,
    reward: number,
    nextStateIndex: number,
    nextAction?: ActionIndex // Needed only for SARSA
  ) {
    const currentQ = this.getQValues(stateIndex);
    const nextQ = this.getQValues(nextStateIndex);
    
    const alpha = this.params.learningRate;
    const gamma = this.params.discountFactor;
    
    let target = 0;
    
    if (this.params.algorithm === "q_learning") {
      // Q-Learning: target is reward + discount * max(Q(s', a'))
      const maxNextQ = Math.max(...nextQ);
      target = reward + gamma * maxNextQ;
    } else {
      // SARSA: target is reward + discount * Q(s', a')
      const chosenNextAction = nextAction !== undefined ? nextAction : this.selectAction(nextStateIndex, true);
      target = reward + gamma * nextQ[chosenNextAction];
    }
    
    // Temp computation
    currentQ[action] = currentQ[action] + alpha * (target - currentQ[action]);
  }

  /**
   * Decay exploration rate after episode finishes
   */
  public decayEpsilon() {
    this.params.epsilon = Math.max(
      this.params.epsilonMin,
      this.params.epsilon * this.params.epsilonDecay
    );
  }

  /**
   * Overwrite agent parameters
   */
  public updateParams(newParams: Partial<RLParams>) {
    this.params = { ...this.params, ...newParams };
  }

  /**
   * Get total number of unique states explored so far
   */
  public getExploredStatesCount(): number {
    return this.qTable.size;
  }

  /**
   * Reset Q-Table completely
   */
  public resetQTable() {
    this.qTable.clear();
    this.exploreCount = 0;
    this.exploitCount = 0;
  }
}
