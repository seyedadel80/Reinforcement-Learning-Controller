import { PhysicsParams, CartPoleState } from "./types";

/**
 * Normalizes an angle to the range [-pi, pi]
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= 2 * Math.PI;
  while (normalized < -Math.PI) normalized += 2 * Math.PI;
  return normalized;
}

/**
 * Cart-Pole (Inverted Pendulum on a Cart) physics simulator
 * State variables: x (cart position), xDot (cart velocity), theta (pole angle), thetaDot (pole angular velocity)
 * 
 * Actuation: force applied horizontally to the cart (which moves it left/right)
 */
export function stepCartPole(
  state: CartPoleState,
  force: number,
  params: PhysicsParams,
  dt: number
): CartPoleState {
  const SUB_STEPS = 10;
  const sdt = dt / SUB_STEPS;
  let currentState = { ...state };

  for (let s = 0; s < SUB_STEPS; s++) {
    const g = params.gravity;
    const mc = params.cartMass || 1.0; 
    const mp = params.pendulumMass || 0.15; 
    const l = params.poleLength || 0.8; 
    const frictionPole = params.friction || 0.05; 
    const frictionCart = 0.1; 

    const theta = currentState.theta;
    const thetaDot = currentState.thetaDot;
    const x = currentState.x;
    const xDot = currentState.xDot;

    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    const temp = (force + mp * l * Math.pow(thetaDot, 2) * sinTheta) / (mc + mp);
    const numerator = g * sinTheta - cosTheta * temp;
    const denominator = l * (4.0/3.0 - (mp * Math.pow(cosTheta, 2)) / (mc + mp));
    
    const thetaAcc = numerator / denominator;
    const xAcc = (force + mp * l * (Math.pow(thetaDot, 2) * sinTheta - thetaAcc * cosTheta)) / (mc + mp);

    let nextThetaDot = thetaDot + thetaAcc * sdt;
    let nextXDot = xDot + xAcc * sdt;

    nextThetaDot *= (1.0 - frictionPole * sdt);
    nextXDot *= (1.0 - frictionCart * sdt);

    const nextTheta = normalizeAngle(theta + nextThetaDot * sdt);
    let nextX = x + nextXDot * sdt;

    const trackLimit = 4.0;
    const warningLimit = 3.0; // Start smoothly braking near the edges to prevent slamming
    if (nextX > warningLimit && nextXDot > 0) {
      const penetration = (nextX - warningLimit) / (trackLimit - warningLimit);
      nextXDot *= Math.max(0, 1.0 - penetration);
    } else if (nextX < -warningLimit && nextXDot < 0) {
      const penetration = (-nextX - warningLimit) / (trackLimit - warningLimit);
      nextXDot *= Math.max(0, 1.0 - penetration);
    }

    if (nextX > trackLimit) {
      nextX = trackLimit;
      nextXDot = 0; 
    } else if (nextX < -trackLimit) {
      nextX = -trackLimit;
      nextXDot = 0; 
    }

    currentState = {
      x: nextX,
      xDot: nextXDot,
      theta: nextTheta,
      thetaDot: nextThetaDot
    };
  }

  return currentState;
}

/**
 * Calculates the reward for a specific state in the Cart-Pole Environment
 */
export function getCartPoleReward(
  state: CartPoleState,
  force: number,
  rewardType: string,
  maxForce: number
): number {
  const thetaNorm = normalizeAngle(state.theta); // -pi to pi
  const x = state.x; // track position

  switch (rewardType) {
    case "quadratic":
      // Penalize: angle deviation, velocity, cart displacement and action effort
      return -(
        Math.pow(thetaNorm, 2) * 5.0 + 
        Math.pow(state.thetaDot, 2) * 0.1 + 
        Math.pow(x, 2) * 0.8 + 
        Math.pow(state.xDot, 2) * 0.05 +
        Math.pow(force / maxForce, 2) * 0.02
      );
      
    case "cos_height":
      // Higher reward when cart is centered and pole is upright (cos(0) = 1)
      const heightCost = Math.cos(thetaNorm) - 1.0;
      const xCost = -0.2 * Math.pow(x, 2);
      return heightCost + xCost - 0.02 * Math.pow(state.thetaDot, 2);
      
    case "energy_based":
      // High reward when both cart is centered (|x| < 0.5) and pole is upright (|theta| < 0.2)
      if (Math.abs(thetaNorm) < 0.20 && Math.abs(x) < 0.6) {
        return 6.0 - (Math.pow(thetaNorm, 2) * 15.0 + Math.pow(x, 2) * 2.0 + Math.pow(state.thetaDot, 2) * 0.2);
      } else {
        return -(Math.pow(thetaNorm, 2) * 2.0 + Math.pow(x, 2) * 0.5);
      }
      
    case "sparse":
    default:
      // Binary success matching pole upright and cart within track limits
      const isUpright = Math.abs(thetaNorm) < 0.18;
      const isCentered = Math.abs(x) < 1.0;
      return (isUpright && isCentered) ? 1.5 : -0.15;
  }
}
