import { PhysicsParams, CartPoleState, DoublePendulumState } from "./types";

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
 * Double Joint Inverted Pendulum Physics Simulator (Double Cart-Pole)
 * Both rods are attached in series to a moving carriage (cart) on a flat track.
 * State variables: x, xDot, theta1, theta1Dot, theta2, theta2Dot
 * 
 * Modeled via exact 3-DoF Coupled Lagrangian equations of motion
 * Evaluated with 10x sub-stepping for ultra-stable high-speed Lagrangian trajectories.
 */
export function stepDoublePendulum(
  state: DoublePendulumState,
  force: number,
  params: PhysicsParams,
  dt: number
): DoublePendulumState {
  const SUB_STEPS = 10;
  const sdt = dt / SUB_STEPS;
  let currentState = { ...state };

  for (let s = 0; s < SUB_STEPS; s++) {
    const g = params.gravity;
    const mc = params.cartMass || 1.0;          
    const m1 = params.pendulumMass || 0.15;      
    const m2 = 0.12;                            // slightly lighter outer pole
    const l1 = params.poleLength || 0.8;        
    const l2 = l1 * 0.8;                        

    const frictionCart = 0.15;                  
    const friction1 = params.friction || 0.05;   
    const friction2 = 0.03;                     

    const x = currentState.x !== undefined ? currentState.x : 0;
    const xDot = currentState.xDot !== undefined ? currentState.xDot : 0;
    const theta1 = currentState.theta1;
    const theta2 = currentState.theta2;
    const d1 = currentState.theta1Dot;
    const d2 = currentState.theta2Dot;

    const M11 = mc + m1 + m2;
    const M12 = (m1 + m2) * l1 * Math.cos(theta1);
    const M13 = m2 * l2 * Math.cos(theta2);
    
    const M21 = M12;
    const M22 = (m1 + m2) * Math.pow(l1, 2);
    const M23 = m2 * l1 * l2 * Math.cos(theta1 - theta2);
    
    const M31 = M13;
    const M32 = M23;
    const M33 = m2 * Math.pow(l2, 2);

    const F1 = force - frictionCart * xDot + (m1 + m2) * l1 * Math.pow(d1, 2) * Math.sin(theta1) + m2 * l2 * Math.pow(d2, 2) * Math.sin(theta2);
    const F2 = (m1 + m2) * g * l1 * Math.sin(theta1) - m2 * l1 * l2 * Math.pow(d2, 2) * Math.sin(theta1 - theta2) - friction1 * d1;
    const F3 = m2 * g * l2 * Math.sin(theta2) + m2 * l1 * l2 * Math.pow(d1, 2) * Math.sin(theta1 - theta2) - friction2 * d2;

    const det = M11 * (M22 * M33 - M23 * M23) - M12 * (M21 * M33 - M23 * M31) + M13 * (M21 * M32 - M22 * M31);
    
    let xAcc = 0;
    let theta1Acc = 0;
    let theta2Acc = 0;

    if (Math.abs(det) > 1e-6) {
      const detX = F1 * (M22 * M33 - M23 * M23) - M12 * (F2 * M33 - M23 * F3) + M13 * (F2 * M32 - M22 * F3);
      const detY = M11 * (F2 * M33 - M23 * F3) - F1 * (M21 * M33 - M23 * M31) + M13 * (M21 * F3 - F2 * M31);
      const detZ = M11 * (M22 * F3 - F2 * M32) - M12 * (M21 * F3 - F2 * M31) + F1 * (M21 * M32 - M22 * M31);

      xAcc = detX / det;
      theta1Acc = detY / det;
      theta2Acc = detZ / det;
    }

    let nextXDot = xDot + xAcc * sdt;
    let nextD1 = d1 + theta1Acc * sdt;
    let nextD2 = d2 + theta2Acc * sdt;

    const maxCartSpeed = 12.0;
    const maxVel = 25.0;
    nextXDot = Math.max(-maxCartSpeed, Math.min(maxCartSpeed, nextXDot));
    nextD1 = Math.max(-maxVel, Math.min(maxVel, nextD1));
    nextD2 = Math.max(-maxVel, Math.min(maxVel, nextD2));

    const nextTheta1 = normalizeAngle(theta1 + nextD1 * sdt);
    const nextTheta2 = normalizeAngle(theta2 + nextD2 * sdt);
    let nextX = x + nextXDot * sdt;

    const trackLimit = 4.0;
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
      theta1: nextTheta1,
      theta1Dot: nextD1,
      theta2: nextTheta2,
      theta2Dot: nextD2
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

/**
 * Calculates the reward for a specific state in Double Pendulum Environment
 * Real-time reward targets keeping BOTH links aligned vertically upright.
 */
export function getDoublePendulumReward(
  state: DoublePendulumState,
  force: number,
  rewardType: string,
  maxForce: number
): number {
  const t1 = normalizeAngle(state.theta1);
  const t2 = normalizeAngle(state.theta2);
  const x = state.x !== undefined ? state.x : 0;
  const xDot = state.xDot !== undefined ? state.xDot : 0;

  switch (rewardType) {
    case "quadratic":
      // Penalize: angular deviations of both arms, angular velocities, inputs, and cart displacement
      return -(
        Math.pow(t1, 2) * 4.0 + 
        Math.pow(t2, 2) * 6.5 + 
        Math.pow(state.theta1Dot, 2) * 0.1 + 
        Math.pow(state.theta2Dot, 2) * 0.15 +
        Math.pow(x, 2) * 0.5 +
        Math.pow(xDot, 2) * 0.05 +
        Math.pow(force / maxForce, 2) * 0.01
      );
      
    case "cos_height":
      // Normalizes height of both poles and penalizes cart offset
      const heightCost = (Math.cos(t1) + 1.5 * Math.cos(t2) - 2.5);
      const cartCost = -0.15 * Math.pow(x, 2);
      return heightCost + cartCost - 0.03 * (Math.pow(state.theta1Dot, 2) + Math.pow(state.theta2Dot, 2));
      
    case "energy_based":
      // High reward when both rods enter narrow vertical capture region near center
      if (Math.abs(t1) < 0.22 && Math.abs(t2) < 0.28 && Math.abs(x) < 0.8) {
        return 8.0 - (Math.pow(t1, 2) * 10.0 + Math.pow(t1, 2) * 15.0 + Math.pow(x, 2) * 1.5 + Math.pow(state.theta1Dot, 2) * 0.3);
      } else {
        return -(Math.pow(t1, 2) * 2.5 + Math.pow(t2, 2) * 4.0 + Math.pow(x, 2) * 0.4);
      }
      
    case "sparse":
    default:
      // Binary bonus when both links are balanced upright and cart is centered
      return (Math.abs(t1) < 0.16 && Math.abs(t2) < 0.22 && Math.abs(x) < 1.0) ? 1.5 : -0.15;
  }
}
