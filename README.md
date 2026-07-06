# App Launcher (Desktop Client)

A modern, standalone offline-first desktop launcher and storefront to catalog, organize, tag, and launch your applications, custom shortcuts, and protocol links. Built on a full-stack **React + Express** core and packaged cleanly as a native desktop application using **Electron**.

---

## 🚀 How to Download & Run Locally

Since this app is a fully integrated desktop application rather than a simple browser webpage, you can download the complete source code from Google AI Studio (as a ZIP or pushed directly to your GitHub repository) and run it natively on your machine.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) (v18 or higher) installed on your system.

### 1. Extract & Install Dependencies
Open your terminal or command prompt in the extracted directory and run:
```bash
npm install
```
*Note: This will automatically download and install the correct native version of Electron for your operating system (Windows, macOS, or Linux).*

### 2. Configure Environment Variables (Optional)
If your launcher uses external API keys (such as the Gemini API for smart categorization), create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Run the App Natively (Development Mode)
To spin up the integrated backend server and launch the desktop container window:
```bash
npm run desktop:start
```

---

## 📦 How to Package into a Standalone Executable (.exe, .dmg, .AppImage)

To package all elements—the React frontend, the Express backend, and the Electron wrapper—into a single standalone installation file that can be distributed and installed like a normal application, run the build script:

### Build for your current OS:
```bash
npm run desktop:build
```

### Build for specific platforms:
* **Windows (produces a `.exe` installer):**
  ```bash
  npx electron-builder --win
  ```
* **macOS (produces a `.dmg` installer):**
  ```bash
  npx electron-builder --mac
  ```
* **Linux (produces a `.AppImage` package):**
  ```bash
  npx electron-builder --linux
  ```

Once compilation is complete, you will find your production-ready installers in the newly created **`dist-desktop/`** directory.

---

## 🛠 Architecture & Tech Stack

This desktop client runs a multi-process architecture to keep the app sandboxed, fast, and secure:
* **Frontend:** Built with **React 18**, **TypeScript**, and styled with high-performance utility classes using **Tailwind CSS**.
* **Backend:** A lightweight local **Express** server (`server.ts` compiled to `dist/server.cjs`) that manages file configurations, protocol execution, and custom launch settings.
* **Desktop Wrapper:** **Electron** (`electron-main.cjs`) which securely spins up the server in a separate thread and hosts the client interface within an optimized native OS window.
