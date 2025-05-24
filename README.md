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


  ```json
{
  "bridge": {...},
  "platforms": {...},

  "accessories": [
    {
      "accessory": "SSH",
      "name": "Basement Hack Pro",
      "on": "osascript -e 'tell application \"Spotify\" to play'",
      "off": "osascript -e 'tell application \"Spotify\" to pause'",
      "state": "osascript -e 'tell application \"Spotify\" to get player state'",
      "on_value": "playing",
      "exact_match": false,
      "ssh": {
        "user": "",
        "host": "",
        "port": 22,
        "password": "",
        "key": "/home/pi/.ssh/id_rsa"
      }
    },
    // tail -f ~/me/timestamps.log file on remote machine & watch timestamps be added when turning on from home app
    {
      "accessory": "SSH",
      "name": "Timestamp Logger",
      "on": "mkdir -p ~/me && date +\"%Y-%m-%dT%H:%M:%SZ\" >> ~/me/timestamps.log",
      "off": "",
      "exact_match": false,
      "ssh": {
          "user": "",
          "host": "pihole4.local",
          "port": 22,
          "password": "",
          "key": "~/.ssh/pihole4_id_rsa"
      }
    }
  ]
}
  ```

### HOW DEBUGGING ACTUALLY WORKS
---
  * 2 debug sessions launch
  * one to watch for changes in /dist & other to launch homebridge
  * when changes are made to files in /src folder, nodemon recompiles /dist and homebrige reloads



  

## 🕵️‍♂️ Full Hot-Reload Timeline

Below is **every event** that occurs from pressing ▶ / **F5** in VS Code to the moment your updated code is running again after a save.

| # | Stage | Who triggers it | What actually happens |
|---|-------|-----------------|-----------------------|
| **1** | Launch clicked | **VS Code Debugger** | Reads `.vscode/launch.json`, finds `preLaunchTask: "tsc: watch"`. |
| **2** | Task spawn | **VS Code Tasks** | Opens an integrated terminal and executes `npm run watch`. |
| **3** | First compile | **`tsc -w`** | TypeScript performs a clean build:<br>• Reads `tsconfig.json`<br>• Transpiles `src/**/*.ts` → `dist/**/*.js`<br>• Prints `Starting compilation in watch mode`. |
| **4** | Ready signal | **Problem-matcher `$tsc-watch`** | Watches terminal output; when it sees `Watching for file changes`, fires the “background-end” event. |
| **5** | Task complete | **VS Code** | Marks `tsc: watch` as *ready but still running*; clears the “Running preLaunchTask” spinner. |
| **6** | Nodemon launch | **VS Code Debugger** | Executes `runtimeExecutable: "nodemon"` with `--inspect` command from `nodemon.json`. |
| **7** | Prepare log dir | **Shell wrapper in `exec`** | `mkdir -p ./.homebridge-debug` (ensures persistence folder exists). |
| **8** | Homebridge spawn | **Nodemon** | Runs:<br>`node --inspect=9229 node_modules/.bin/homebridge -D -P dist -U ./.homebridge-debug -C ./.homebridge-debug/config.json` |
| **9** | Inspector open | **Node (v14+)** | Listens on `ws://127.0.0.1:9229` for DevTools/debugger connections. |
| **10** | Child attach | **autoAttachChildProcesses** | VS Code sees a new Node process with an inspector port → attaches; toolbar appears; breakpoints are now live. |
| **11** | HAP bind | **Homebridge** | Reads plugin from `dist/`, binds HAP server on port `51826`, advertises via mDNS. |
| **12** | UI available | **homebridge-config-ui-x** | Binds HTTP server on `8581`, starts tailing `homebridge.log`. |
| **13** | Edit & save | **You + TextMate / Monaco** | You press ⌘S in a `.ts` file. |
| **14** | Incremental compile | **`tsc -w`** | Rebuilds **only** the changed file and its dependents, writes new JS into `dist/`. |
| **15** | File change event | **nodemon (chokidar)** | Detects modification in `dist/` that matches `"watch": ["dist"]`. |
| **16** | Graceful shutdown | **Nodemon** | Sends SIGTERM to the running Homebridge PID. Homebridge: <br>• Unpublishes mDNS<br>• Closes sockets<br>• Exits. |
| **17** | Port release delay | **Nodemon** | Waits `delay: "1.5s"` to ensure port 51826 is free. |
| **18** | Restart | **Nodemon** | Re-executes the *same* `node --inspect=9229 …` command, spawning a **new** Homebridge process. |
| **19** | Re-attach | **VS Code debug adapter** | autoAttach sees the old PID exit and a new inspector open on 9229 → re-attaches instantly; breakpoints remain valid. |
| **20** | Loop | — | Steps 11 → 19 repeat every time you save another file until you click the **■ Stop** button. |

> **Key takeaway:** VS Code controls only two things:  
> 1. The TypeScript watcher (via **Tasks**)  
> 2. Nodemon (via **Debugger**)  
> Everything else—recompilation, restart, re-attach—flows automatically through these two services.
