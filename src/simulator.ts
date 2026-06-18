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
      // Clean positive-biased reward: base positive reward for staying upright, minus deviations
      const angleCost = Math.pow(thetaNorm, 2) * 5.0;
      const speedCost = Math.pow(state.thetaDot, 2) * 0.05;
      const positionCost = Math.pow(x, 2) * 0.3;
      const effortCost = Math.pow(force / maxForce, 2) * 0.01;
      
      // If angle is reasonably close to upright, give a nice positive base reward minus quadratic penalties
      if (Math.abs(thetaNorm) < 0.8) {
        let rewardVal = 3.0 - (angleCost + speedCost + positionCost + effortCost);
        
        // High-precision vertical stability bonus to draw the pole to absolute center
        if (Math.abs(thetaNorm) < 0.08) {
          rewardVal += 10.0; // massive bonus for keeping it within 4.5 degrees!
        } else if (Math.abs(thetaNorm) < 0.16) {
          rewardVal += 4.0;  // warning-free zones
        }
        
        return Math.max(-1.0, rewardVal);
      }
      return -1.0;
      
    case "cos_height":
      // Higher positive reward when cart is centered and pole is upright (cos(0) = 1)
      const heightReward = Math.cos(thetaNorm) + 1.0; // range [0, 2.0]
      const xCentering = -0.12 * Math.pow(x, 2);
      return Math.max(-1.0, heightReward + xCentering - 0.01 * Math.pow(state.thetaDot, 2));
      
    case "energy_based":
      // High reward when both cart is centered (|x| < 0.6) and pole is upright (|theta| < 0.2)
      if (Math.abs(thetaNorm) < 0.25 && Math.abs(x) < 0.8) {
        return 5.0 - (Math.pow(thetaNorm, 2) * 12.0 + Math.pow(x, 2) * 1.5 + Math.pow(state.thetaDot, 2) * 0.1);
      } else {
        return Math.max(-2.0, Math.cos(thetaNorm) - 0.15 * Math.pow(x, 2));
      }
      
    case "sparse":
    default:
      // Binary success matching pole upright and cart within track limits
      const isUpright = Math.abs(thetaNorm) < 0.18;
      const isCentered = Math.abs(x) < 1.0;
      return (isUpright && isCentered) ? 2.5 : -0.2;
  }
}
