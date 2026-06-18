/**
 * Types & Interfaces for the Reinforcement Learning Control Simulator.
 */

export type EnvType = 'cartpole' | 'double_pendulum';
export type AlgorithmType = 'q_learning' | 'sarsa';

export interface CartPoleState {
  x: number;           // Cart position on track
  xDot: number;        // Cart velocity
  theta: number;       // Pole angle in radians (0 is upright)
  thetaDot: number;    // Pole angular velocity
}

export interface DoublePendulumState {
  x: number;            // Cart position on track
  xDot: number;         // Cart velocity
  theta1: number;       // Angle of inner arm (0 is vertical upright)
  theta1Dot: number;    // Angular velocity of inner arm
  theta2: number;       // Angle of outer arm (0 is vertical upright)
  theta2Dot: number;    // Angular velocity of outer arm
}

export type SimulatorState = CartPoleState | DoublePendulumState;

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

export interface PIDParams {
  enabled: boolean;
  Kp: number;
  Ki: number;
  Kd: number;
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
