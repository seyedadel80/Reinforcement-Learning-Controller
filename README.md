````markdown
# 🏎️ Inverted Pendulum (Cart-Pole) Control System with Mathematical PID Controller and Reinforcement Learning (RL)

An advanced, interactive, real-time web-based engineering simulator for optimizing and controlling the chaotic **Inverted Pendulum (Cart-Pole)** system using two fundamentally different control architectures: **Pure Mathematical Control (PID + Integral)** and **Intelligent Artificial Intelligence Control (Reinforcement Learning - Q-Learning/SARSA)**.

---

# 📌 Project Overview

This project provides a powerful interactive platform for understanding classical control theory and autonomous artificial intelligence. Users can instantly switch between traditional mathematical control methods and reward-driven intelligent control while monitoring the physical behavior and stability phases of the inverted pendulum system.

> [!IMPORTANT]
> **Simulator Screenshot:**
>
> ![Simulator Screenshot](https://raw.githubusercontent.com/your-username/cartpole-pid-rl/main/assets/screenshot.png)
>
> *(Placeholder: Replace this image URL with your own simulator screenshot after capturing it.)*

---

# 🛠️ Key Features

- 🔄 **Two Independent Control Modes**
  - **PID Mode:** Engineering-grade stabilization using real-time feedback with the three classical control components applied to both angle and cart position, including integral error correction for eliminating steady-state offset.
  - **Reinforcement Learning (RL) Mode:** Autonomous learning through reward-based tabular algorithms with a professionally designed multi-stage reward shaping system.

- 🧪 **Highly Accurate Physics Simulation**
  - Time-discretized implementation using Euler/Runge-Kutta numerical integration based on the nonlinear Lagrangian equations of the cart-pole system.

- 📊 **Advanced Real-Time Visualization**
  - Phase-space plots (\(\theta\) vs. \(\dot{\theta}\))
  - Force vector visualization
  - Cumulative error monitoring

- ⚙️ **Unlimited Physics Customization**
  - Adjustable pendulum mass
  - Adjustable rod length
  - Rotational friction parameters
  - Track length limits
  - Acceleration and force constraints

---

# 📐 Classical PID Controller Architecture (Pure Mathematics)

The classical controller stabilizes the system using the four state variables:

- \(x\) — Cart Position
- \(\dot{x}\) — Cart Velocity
- \(\theta\) — Pendulum Angle
- \(\dot{\theta}\) — Angular Velocity

The control force applied to the cart is defined as:

\[
F =
K_{p,\theta} \cdot e_\theta +
K_{d,\theta} \cdot \dot{e}_\theta +
K_{i,\theta} \int e_\theta \, dt
-
K_{p,x} \cdot x
-
K_{d,x} \cdot \dot{x}
-
K_{i,x} \int x \, dt
\]

## ⚠️ Physical Challenge: Why Doesn't the Angle Lock Exactly at Absolute Zero (\(0.0000^\circ\))?

In real physical systems and discretized digital simulations, stopping exactly at the mathematical point of absolute zero is practically impossible. Three primary factors create tiny microscopic oscillations around the upright equilibrium:

### 1. Time Discretization

The physics engine performs calculations at a fixed time step (for example, \(dt = 0.02\) seconds). The controller always reacts to a slightly outdated state due to this sampling interval, resulting in extremely small overshoots measured in fractions of a degree.

### 2. Steady-State Chatter

Because of the pendulum's mass and the cart's inertia, angular velocity remains nonzero even when the angle approaches zero. The cart must therefore apply small corrective forces to decelerate the motion, creating a subtle back-and-forth jitter around the equilibrium point.

### 3. Control Resolution Limitations

Small friction effects and finite actuator force prevent the system from achieving perfect mechanical stillness. Consequently, the pendulum continuously oscillates within a tiny stable region (typically less than \(0.1^\circ\) around vertical), which realistically reflects the behavior of physical dynamic systems.

---

# 🧠 Artificial Intelligence and Reinforcement Learning Engine

The AI subsystem uses a model-free tabular reinforcement learning approach. The simulator supports two popular algorithms:

- **Q-Learning** (Off-Policy Update)
- **SARSA** (On-Policy Update)

## 📈 Advanced Reward Shaping System

To overcome the inefficiency of sparse rewards, a multi-layer reward shaping strategy is implemented to encourage the agent toward the absolute equilibrium state.

| Angular Deviation | Cart Position Error | Stabilization Bonus | Training Objective |
|------------------|---------------------|---------------------|--------------------|
| Less than \(1.2^\circ\) | Less than 4.0 cm | **+45.0 pts** | Ultra-high stability at the exact center |
| Less than \(2.5^\circ\) | Less than 10.0 cm | **+15.0 pts** | Strong convergence toward optimal balance |
| Less than \(5.0^\circ\) | Less than 20.0 cm | **+5.0 pts** | Guidance reward preventing divergence |

This staged reward structure is the key mechanism that enables the reinforcement learning agent to understand the simulator's ultimate objective: maintaining stable equilibrium at the central upright position.

---

# 📋 Local Development Guide

To run this project locally, follow the steps below.

## 1. Prerequisites

Ensure that the following tools are installed on your system:

- Node.js
- npm (Node Package Manager)

## 2. Clone the Repository and Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-username/cartpole-pid-rl.git

# Enter the project directory
cd cartpole-pid-rl

# Install required packages
npm install
````

## 3. Run the Development Server

```bash
npm run dev
```

After successful startup, open the displayed URL in your browser (typically `http://localhost:3000`) to test and debug the simulator in real time.

## 4. Create a Production Build

```bash
npm run build
```

---

# 💻 Technologies Used

### React 18 & TypeScript

Type-safe, component-driven frontend architecture and simulation logic implementation.

### Tailwind CSS

Rapid modern styling framework featuring an industrial dark-theme design.

### Lucide Icons

Minimalistic and interactive vector icon library.

### Framer Motion

Smooth animations and seamless user interface transitions.

### D3.js / SVG Canvas

Dynamic rendering of mathematical visualizations and real-time 2D charts.

---

# 📝 Developer's Technical Note

The inverted pendulum is widely regarded as one of the fundamental gateways into aerospace engineering, robotics, autonomous systems, and advanced control theory.

This simulator aims to demonstrate the practical differences between:

* **Classical Mathematical Control (PID)** — Fast, deterministic, and highly efficient, but sensitive to modeling assumptions and noise.
* **Artificial Intelligence Control (Reinforcement Learning)** — Flexible and adaptive, but requiring significant exploration and training before achieving robust performance.

By allowing users to compare these two fundamentally different approaches within the same physical environment, the project provides a comprehensive educational platform for robotics researchers, control engineers, and AI practitioners.

---

# ✨ Completed Improvements for This README

1. Created a fully optimized GitHub Markdown structure with proper headings, callouts, tables, and formatting.
2. Included clean mathematical equations using standard GitHub-compatible LaTeX syntax.
3. Added a scientific explanation of micro-oscillations and the impossibility of perfect equilibrium at exactly zero degrees.
4. Added a screenshot placeholder for easy integration of simulator images.

```
```
