# Homebridge Plugin Development Setup

This setup provides a full edit–build–run–debug workflow in VS Code for developing Homebridge plugins. It uses TypeScript, Nodemon, and the Homebridge Config UI to give you auto-reloading and interactive debugging with breakpoints.

---

## 🔧 Project Files Overview

### `package.json`
Defines:
- Your plugin’s metadata
- Runtime dependencies (`homebridge`, `homebridge-config-ui-x`)
- Dev tools (`typescript`, `nodemon`)
- NPM scripts:
  - `npm run build` – compiles TypeScript once
  - `npm run watch` – compiles continuously on file save

### `tsconfig.json`
Tells the TypeScript compiler:
- Input is in `src/`
- Output goes to `dist/`
- Emit declaration files
- Use strict typing and CommonJS modules

### `.vscode/tasks.json`
Defines a **background watch task** for VS Code that:
- Runs `npm run watch`
- Ties into the Problems tab using `tsc` error matching
- Notifies VS Code when the TypeScript watcher is ready

### `.vscode/launch.json`
Defines a debug config that:
- Uses `nodemon` as the launcher
- Attaches VS Code's debugger via `--inspect`
- Automatically runs the TypeScript watch task before launching
- Restarts the debug session when your code changes

### `nodemon.json`
Configures `nodemon` to:
- Watch `dist/` for rebuilt files
- Delay briefly before restarting (to avoid mDNS race conditions)
- Launch Homebridge using:
  - `node --inspect=9229 node_modules/.bin/homebridge -D -P dist -U ./.homebridge-debug -C ./.homebridge-debug/config.json`
- The log output is redirected to a file for the Config UI to display

### `.homebridge-debug/config.json`
A Homebridge config used **only for debugging**:
- Has a unique `bridge.name`, `username`, `port`, and `pin`
- Includes the Config UI plugin on port `8581`
- Sets `"restart": false` to avoid conflicts with nodemon
- Points to the log file (`.homebridge-debug/homebridge.log`)

---

## ▶ How to Use

### ✅ Step 1: Install dependencies and start TypeScript watch
```bash
npm install
npm run watch
```
This compiles your src/ folder into dist/ and keeps watching for changes.


### ✅ Step 2: Start the debugger in VS Code

    Open this folder in VS Code

    Open the Run & Debug tab

    Select Debug Homebridge (with UI & auto-reload)

    Click ▶ or press F5

This launches Homebridge using nodemon with the debugger attached.



### ✅ Step 3: Test through the Homebridge Config UI

In your browser, go to:

http://{{raspberrypi}}:8581

Use the web interface to:

    View accessory state

    Trigger platform behavior

    Observe logs and hit breakpoints in VS Code

🧪 Typical Development Workflow

    Edit your code in src/

    tsc -w rebuilds to dist/

    Nodemon restarts Homebridge

    Breakpoints in VS Code hit automatically

✅ Why This Setup Works

    Keeps your plugin code completely separate from your production Homebridge

    Avoids permission issues and systemd interference

    Enables live reload + debugging without restarting the Pi

    Gives you access to the web UI for easy testing



* sometimes vscode leaves zombie processes running after stopping debugger, which causes issues when starting debugger again
  * there should be 0 nodemon or homebridge processes running when starting the debugger. if getting weird issues, run these commands. 
  * not doing this may cause `homebridge` to use the `./homebridge-debug/config.json` file when starting the service using `systemctl start homebridge` after a debug session
    ```bash 
      # find processes
      ps -ef | grep -E 'homebridge|nodemon'

      # graceful SIGTERM to everything that is nodemon OR homebridge OR tee
      ps -eo pid,command | grep -E '[n]odemon|[h]omebridge' | awk '{print $1}' | xargs -r kill
    ```