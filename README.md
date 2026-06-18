# Cart-Pole Stabilization System

### Classical PID Control and Reinforcement Learning-Based Control Framework

A real-time interactive simulation environment for studying stabilization and control of the nonlinear **Inverted Pendulum (Cart-Pole)** system using both classical control theory and modern reinforcement learning algorithms.

<p align="center">
  <img src="PID.png" width="48%" alt="PID Controller"/>
  <img src="AI.png" width="48%" alt="Reinforcement Learning Controller"/>
</p>

<p align="center">
  <em>Comparison of classical PID control and Reinforcement Learning-based stabilization.</em>
</p>

---

## 📌 Project Overview

The inverted pendulum is one of the most fundamental benchmark problems in control engineering, robotics, autonomous systems, and reinforcement learning research.

This project provides a comprehensive simulation platform for investigating two fundamentally different approaches to stabilizing an inherently unstable dynamic system:

- **Classical PID Control**
- **Reinforcement Learning (Q-Learning / SARSA)**

Users can switch between control modes in real time and observe how each controller responds to disturbances, state changes, and nonlinear system dynamics. The simulator is designed to serve both as an educational tool and as an experimental environment for advanced control system analysis.

---

## 📷 System Demonstration

### Classical PID Controller

The PID controller stabilizes the pendulum using deterministic feedback derived from the system states. Control actions are computed directly from position, velocity, angular displacement, and angular velocity measurements.

![PID Controller](./assets/PID.png)

### Reinforcement Learning Controller

The reinforcement learning agent learns a stabilization policy through interaction with the environment and reward optimization. No explicit control equation is predefined; instead, the controller gradually discovers an effective strategy through exploration and experience.

![Reinforcement Learning Controller](./assets/AI.png)

---

## ✨ Key Features

### Dual Control Architectures

- Classical PID control with proportional, derivative, and integral feedback components.
- Reinforcement Learning control using Q-Learning and SARSA algorithms.
- Real-time switching between control modes.
- Comparative evaluation of controller performance.

### High-Fidelity Physics Simulation

- Nonlinear cart-pole dynamics.
- Numerical integration using discrete-time simulation techniques.
- Realistic modeling of inertia, friction, and actuator limitations.
- Stable simulation under varying physical parameters.

### Real-Time Visualization

- Live system state monitoring.
- Angular and positional error tracking.
- Phase-space visualization.
- Force and control signal inspection.

### Configurable Physical Parameters

Users can modify simulation parameters during runtime, including:

- Pendulum mass
- Pendulum length
- Cart mass
- Friction coefficients
- Track boundaries
- Maximum actuator force
- Simulation time step

---

## 📐 Classical PID Controller

The controller utilizes the four state variables of the cart-pole system:

- Cart position: \(x\)
- Cart velocity: \(\dot{x}\)
- Pendulum angle: \(\theta\)
- Angular velocity: \(\dot{\theta}\)

The control force applied to the cart is defined as:

\[
F =
K_{p,\theta}e_{\theta}
+
K_{d,\theta}\dot{e}_{\theta}
+
K_{i,\theta}\int e_{\theta}dt
-
K_{p,x}x
-
K_{d,x}\dot{x}
-
K_{i,x}\int xdt
\]

where:

- \(K_p\) denotes the proportional gain.
- \(K_d\) denotes the derivative gain.
- \(K_i\) denotes the integral gain.

The angular control term maintains upright balance, while the positional control term keeps the cart near the center of the track.

---

## ⚠️ Why Doesn't the Pendulum Remain Exactly at 0°?

Even under optimal tuning, a physical or discretized dynamic system cannot remain perfectly fixed at the mathematical equilibrium point.

Several factors contribute to small oscillations around the vertical position:

### Time Discretization

The simulation operates using finite time steps. Since control actions are applied after state measurements are taken, a small delay naturally introduces tiny overshoots and corrective motions.

### Residual Momentum

As the pendulum approaches equilibrium, angular velocity is rarely zero. The controller must continue applying corrective forces to dissipate the remaining kinetic energy.

### Actuator and Resolution Limits

Finite control authority, numerical precision limits, and friction effects prevent the system from reaching an absolutely motionless state.

Consequently, the pendulum typically oscillates within a very small neighborhood around the equilibrium point, which accurately reflects the behavior of real-world dynamic systems.

---

## 🧠 Reinforcement Learning Framework

The artificial intelligence subsystem adopts a model-free tabular reinforcement learning approach.

Supported algorithms include:

### Q-Learning

An off-policy learning method that estimates optimal state-action values independently of the agent's current behavior policy.

### SARSA

An on-policy learning method that updates action values according to the policy currently being followed.

---

## 📈 Advanced Reward Shaping

To improve training efficiency and accelerate convergence, a multi-level reward shaping strategy is implemented.

| Angular Error | Position Error | Stabilization Bonus | Objective |
|---------------|----------------|---------------------|-----------|
| < 1.2° | < 4 cm | +45.0 | Precise equilibrium maintenance |
| < 2.5° | < 10 cm | +15.0 | Strong convergence toward center |
| < 5.0° | < 20 cm | +5.0 | Guidance toward stable behavior |

This hierarchical reward structure encourages the agent to remain near the desired equilibrium state while minimizing unnecessary oscillations and positional drift.

---

## 📊 Control Strategy Comparison

| Feature | PID Controller | Reinforcement Learning |
|----------|---------------|------------------------|
| Control Type | Model-Based | Model-Free |
| Mathematical Control Law | Explicit | Learned |
| Training Required | No | Yes |
| Computational Cost | Low | Higher |
| Adaptability | Limited | High |
| Interpretability | High | Moderate |
| Real-Time Performance | Excellent | Good |
| Robustness to Unknown Dynamics | Moderate | High |

---

## 🚀 Local Development

### Prerequisites

Ensure the following tools are installed:

- Node.js
- npm

### Clone the Repository

```bash
git clone https://github.com/your-username/cartpole-pid-rl.git

cd cartpole-pid-rl
```

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

After startup, open the displayed URL in your browser (typically `http://localhost:3000`).

### Create Production Build

```bash
npm run build
```

---

## 💻 Technology Stack

### Frontend

- React 18
- TypeScript

### Styling

- Tailwind CSS

### Animation

- Framer Motion

### Visualization

- D3.js
- SVG Canvas

### UI Components

- Lucide Icons

---

## 🏗️ System Architecture

The simulator consists of four major subsystems:

1. Physics Engine
2. PID Controller
3. Reinforcement Learning Engine
4. Visualization Layer

The physics engine continuously updates the cart-pole state, while the selected controller computes the control action. Results are then rendered through the visualization layer for real-time analysis.

---

## 🎯 Educational Objectives

This project demonstrates the practical differences between classical feedback control and learning-based control strategies within the same dynamic environment.

The simulator can be used for:

- Control systems education
- Reinforcement learning experimentation
- Robotics research
- Autonomous systems analysis
- Controller performance benchmarking

---

## 📄 License

This project is released under the MIT License.

---

## 👨‍💻 Author

Developed as an experimental platform for exploring nonlinear control systems, reinforcement learning, and autonomous stabilization techniques.
````
