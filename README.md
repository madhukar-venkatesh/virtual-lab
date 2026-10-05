
<div align="center">
  <img src="public/og-image.jpg" alt="Virtual Physiology Lab Banner" width="100%" />
</div>

# Virtual Physiology Lab

> **🌐 Try it now: [https://madhukar-venkatesh.github.io/virtual-lab/](https://madhukar-venkatesh.github.io/virtual-lab/)**

A comprehensive, interactive simulation suite designed for performing and visualizing physiological experiments in a virtual environment. This application leverages modern web technologies to provide realistic simulations of amphibian skeletal muscle, amphibian heart, and hematology experiments.

## 🚀 Key Features

*   **Realistic Simulations:** Uses physics-based models to simulate muscle contraction, fatigue, and cardiac cycles.
*   **Interactive 3D Visualizations:** Powered by Three.js and React Three Fiber for immersive 3D models of experimental setups (kymographs, microscopes, muscle/heart preparations).
*   **Dynamic Graphing:** Real-time data visualization using Recharts to mimic oscilloscopes and chart recorders.
*   **Cross-Platform:** Built with React and Capacitor, ready for deployment on Web and Android.

## 🔬 Experiments

### Amphibian Skeletal Muscle
1.  **Simple Muscle Twitch**: Analyze the phases of a single muscle twitch (Latent, Contraction, Relaxation).
2.  **Effect of Load**: Study the relationship between load and work done producing  and after loaded curves.
3.  **Effect of Temperature**: Observe how temperature changes affect muscle enzyme activity and twitch duration.
4.  **Effect of Stimulus Strength**: Demonstrate the "All-or-None" law and graded response in whole muscle.
5.  **Genesis of Fatigue**: Simulate muscle fatigue through repeated stimulation.
6.  **Genesis of Tetanus**: Demonstrate summation of contractions and tetanus by varying stimulus frequency.
7.  **Conduction Velocity**: Measure the speed of nerve impulse conduction.
8.  **Two Successive Stimuli**: Investigate the refractory period and summation of potential.

### Amphibian Heart
1.  **Normal Cardiogram**: Record and analyze normal cardiac rhythm and phases (systole, diastole).

### Hematology
1.  **Total RBC Count**: Simulate red blood cell counting using a Neubauer chamber.
2.  **Total WBC Count**: Simulate white blood cell counting.
3.  **Differential Leukocyte Count (DLC)**: Identify and count different types of WBCs from a blood smear.

## 🛠️ Technologies Used

*   **Frontend**: React, TypeScript, Vite
*   **Styling**: Tailwind CSS
*   **3D Graphics**: Three.js, @react-three/fiber, @react-three/drei
*   **Charting**: Recharts
*   **Mobile Runtime**: Capacitor
*   **Icons**: Lucide React