/**
 * Types & Interfaces for the Reinforcement Learning Control Simulator.
 */

export type AlgorithmType = 'q_learning' | 'sarsa';

export interface CartPoleState {
  x: number;           // Cart position on track
  xDot: number;        // Cart velocity
  theta: number;       // Pole angle in radians (0 is upright)
  thetaDot: number;    // Pole angular velocity
}

export type SimulatorState = CartPoleState;

export interface RLParams {
  algorithm: AlgorithmType;
  learningRate: number;     // Alpha
  discountFactor: number;   // Gamma
  epsilon: number;          // Exploration factor
  epsilonDecay: number;     // Decay per episode
  epsilonMin: number;
  rewardType: 'quadratic' | 'cos_height' | 'sparse' | 'energy_based';
  discretizationBins: number; // Number of bins per state dimension
}

export interface PhysicsParams {
  gravity: number;
  pendulumMass: number;
  poleLength: number;
  cartMass: number;      // For cart-pole
  friction: number;
  maxForce: number;      // Max external force/torque
}

export interface EpisodeLog {
  episode: number;
  totalReward: number;
  steps: number;
  epsilon: number;
  isStable: boolean; // Did it maintain stability for most of the episode?
}

export type RewardWeightOptions = {
  angle: number;
  velocity: number;
  position: number;   // For cart-pole
  control: number;
};
