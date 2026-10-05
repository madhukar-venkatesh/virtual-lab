
<div align="center">
  <img src="public/og-image.jpg" alt="Virtual Physiology Lab Banner" width="100%" />
</div>

# Virtual Physiology Lab

[![Live Demo](https://img.shields.io/badge/🔬_Live_Demo-Visit_Virtual_Lab-blue?style=for-the-badge)](https://mrnerd96.github.io/virtual-lab/)
[![GitHub Pages](https://img.shields.io/badge/Deployed_on-GitHub_Pages-222?style=for-the-badge&logo=github)](https://mrnerd96.github.io/virtual-lab/)

> **🌐 Try it now: [https://mrnerd96.github.io/virtual-lab/](https://mrnerd96.github.io/virtual-lab/)**

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

## 💻 Setup & Installation

**Prerequisites:** Node.js (v18+ recommended)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/madhukar-venkatesh/virtual-lab.git
    cd virtual-lab
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root directory and add any necessary API keys (e.g., for AI features if applicable).
    ```env
    VITE_GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

5.  **Build for production:**
    ```bash
    npm run build
    ```

## 📱 Mobile Build (Android)

This project is configured with Capacitor for Android deployment.

1.  **Sync the project:**
    ```bash
    npx cap sync
    ```

2.  **Open in Android Studio:**
    ```bash
    npx cap open android
    ```
