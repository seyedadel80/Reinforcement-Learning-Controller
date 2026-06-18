import { RLParams } from "./types";
import { normalizeAngle } from "./simulator";

// Discrete force actions mapping:
// 5 actions for much finer upright stabilizing control without wild limit cycles!
// 0: Full Negative Force (-MaxForce)
// 1: Mild Negative Force (-0.25 * MaxForce)
// 2: No Force (0)
// 3: Mild Positive Force (+0.25 * MaxForce)
// 4: Full Positive Force (+MaxForce)
export const ACTIONS = [-1.0, -0.25, 0.0, 0.25, 1.0] as const;
export type ActionIndex = 0 | 1 | 2 | 3 | 4;

export class RLAgent {
  // tabular Q value storage: StateIndex -> number[] for flexible action counts
  public qTable: Map<number, number[]>;
  private params: RLParams;

  // Track exploration vs exploitation counts
  public exploreCount = 0;
  public exploitCount = 0;

  constructor(params: RLParams) {
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
   * Retrieves the discrete state identifier based on environment
   */
  public getStateIndex(state: any): number {
    const x = state.x !== undefined ? state.x : 0;
    const xDot = state.xDot !== undefined ? state.xDot : 0;
    const t = state.theta !== undefined ? state.theta : 0;
    const td = state.thetaDot !== undefined ? state.thetaDot : 0;
    return this.discretizeCartPole(x, xDot, t, td);
  }

  /**
   * Returns Q values array for a state, initializing if absent
   */
  public getQValues(stateIndex: number): number[] {
    if (!this.qTable.has(stateIndex)) {
      // Initialize with small random values to break symmetry
      const initial: number[] = Array.from({ length: ACTIONS.length }, () => (Math.random() - 0.5) * 0.01);
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
      // Return any random action index
      return Math.floor(Math.random() * ACTIONS.length) as ActionIndex;
    } else {
      this.exploitCount++;
      // Argmax across action options
      let maxVal = -Infinity;
      let argmax: ActionIndex = 2; // Default to stay (no force, index 2)
      
      // Tie breaking
      const bestActions: ActionIndex[] = [];
      for (let i = 0; i < ACTIONS.length; i++) {
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
    
    // Dynamically scale/decay alpha (learning rate) as epsilon declines.
    // This stabilizes the late-stage Q-Table so random exploration mistakes 
    // or late-stage turbulence doesn't destroy excellent converged behaviors.
    const baseAlpha = this.params.learningRate;
    const alpha = Math.max(0.012, baseAlpha * Math.sqrt(this.params.epsilon));
    
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
    
    // Temporal difference update
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
