import { PIDParams, CartPoleState, DoublePendulumState } from "./types";
import { normalizeAngle } from "./simulator";

export class PIDController {
  private params: PIDParams;
  private integralError = 0;
  private prevError = 0;

  constructor(params: PIDParams) {
    this.params = params;
  }

  /**
   * Resets integrated history state
   */
  public reset() {
    this.integralError = 0;
    this.prevError = 0;
  }

  /**
   * Updates PID parameters dynamically
   */
  public updateParams(newParams: Partial<PIDParams>) {
    this.params = { ...this.params, ...newParams };
  }

  /**
   * Computes control force for Inverted Pendulum on a Cart (Cart-Pole)
   * Signs are structurally corrected:
   * - Leaning RIGHT (theta > 0) -> we must push the cart RIGHT (force > 0) to get under it.
   * - Cart too far RIGHT (x > 0) -> we must pull the cart LEFT (force < 0).
   */
  public computeTorque(state: CartPoleState, dt: number, maxForce: number): number {
    if (!this.params.enabled) return 0;

    const thetaNorm = normalizeAngle(state.theta);
    const cosTheta = Math.cos(thetaNorm);

    // Kp and Kd terms scaled dynamically by cos(theta) for a smooth unified swing-up & balance!
    const pTerm = this.params.Kp * thetaNorm * cosTheta;
    const dTerm = this.params.Kd * state.thetaDot * cosTheta;

    // Cart position tracking (to center at x = 0)
    // When the cart is too far right (x > 0), we want to pull left (negative)
    const posStabilizer = 0.15; // proportion of cart centering
    const xTerm = -posStabilizer * this.params.Kp * state.x;
    const xDotTerm = -posStabilizer * this.params.Kd * state.xDot;

    let force = pTerm + dTerm + xTerm + xDotTerm;

    // For swing-up assistance when hanging downwards (theta values in opposite hemispheres),
    // we boost the energy pumping in the direction of current angular momentum.
    if (Math.abs(thetaNorm) > 0.8) {
      const swingPump = Math.sign(state.thetaDot * cosTheta) * maxForce * 0.55;
      force += swingPump;
    }

    return Math.max(-maxForce, Math.min(maxForce, force));
  }

  /**
   * Computes control torque for Double Joint Inverted Pendulum on a Cart system
   * Dynamic stability is achieved via joint co-linearity and active carriage positioning.
   */
  public computeDoublePendulumForce(state: DoublePendulumState, dt: number, maxForce: number): number {
    if (!this.params.enabled) return 0;

    const t1 = normalizeAngle(state.theta1);
    const t2 = normalizeAngle(state.theta2);
    const cosT1 = Math.cos(t1);
    const cosT2 = Math.cos(t2);

    const x = state.x !== undefined ? state.x : 0;
    const xDot = state.xDot !== undefined ? state.xDot : 0;

    // Composite angle representing both links (outer link has higher weight for stability)
    const compositeTheta = t1 + 0.70 * t2;
    const compositeDot = state.theta1Dot + 0.70 * state.theta2Dot;

    const cosFactor = cosT1; 

    const pTerm = this.params.Kp * compositeTheta * cosFactor;
    const dTerm = this.params.Kd * compositeDot * cosFactor;

    // Cart centering terms
    const xTerm = -0.15 * this.params.Kp * x;
    const xDotTerm = -0.15 * this.params.Kd * xDot;

    let force = pTerm + dTerm + xTerm + xDotTerm;

    // In double joint systems, swinging up unactuated links requires high energy injection when downward
    if (Math.abs(t1) > 0.8 || Math.abs(t2) > 0.8) {
      const swingPump = Math.sign(compositeDot * cosT1) * maxForce * 0.45;
      force += swingPump;
    }

    return Math.max(-maxForce, Math.min(maxForce, force));
  }
}
