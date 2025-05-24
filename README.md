# Homebridge Plugin Development Setup

This setup provides a full edit–build–run–debug workflow in VS Code for developing Homebridge plugins. It uses TypeScript, Nodemon, and the Homebridge Config UI to give you auto-reloading and interactive debugging with breakpoints.

---

## 🔧 File Roles in the Debug Workflow

- **.vscode/launch.json**  
  Defines how VS Code starts the debug session on F5:  
  1. Runs the TS watch task  
  2. Launches `nodemon` to monitor changes  
  3. Attaches the debugger to the Homebridge process

- **.vscode/tasks.json**  
  Defines the background task for TypeScript:  
  - Runs `npm run watch` (`tsc -w`)  
  - Continuously compiles `.ts` → `.js` + sourcemaps without blocking the editor

- **tsconfig.json**  
  Configures the TypeScript compiler:  
  - `rootDir`: where your `.ts` source files live  
  - `outDir`: where compiled `.js` + `.map` files are emitted (into `node_modules/homebridge-remote-ssh`)  
  - Language target, module format, and other compile options

- **package.json**  
  Centralizes your NPM scripts and plugin metadata:  
  - `build`: cleans old output, compiles TS, copies `package.json` into the plugin folder  
  - `watch`: starts the TS watcher (`tsc -w`)  
  - `debug:hb`: runs `build`, ensures the debug directory, and launches Homebridge under `--inspect`

- **nodemon.json**  
  Tells Nodemon which files to watch and how to restart:  
  - `watch`: points at your plugin’s compiled JS files  
  - `ext`: triggers on `.js` changes  
  - `exec`: runs `npm run debug:hb` on each change  
  - `signal`/`delay`/`legacyWatch`: ensure a clean, reliable restart

---

### End-to-End Flow

1. **F5** → VS Code runs `tsc: watch` via `tasks.json`.  
2. **VS Code** → starts `nodemon` via `launch.json`.  
3. **TS watcher** → emits new JS in `node_modules/homebridge-remote-ssh` per `tsconfig.json`.  
4. **nodemon** → sees JS change, runs `debug:hb` (from `package.json`).  
5. **Homebridge** → restarts under the debugger, loading your updated plugin and honoring breakpoints.

---

### Here’s exactly what happens, step by step, from the moment you press F5 to when a TypeScript breakpoint in your accessory code fires:

    1. You press F5 in VS Code

        * VS Code sees your launch configuration and first runs the specified preLaunchTask.

    2. Pre-launch task kicks off “npm run watch”

        * Under the hood this is tsc -w.

        * The TypeScript compiler in watch mode compiles all .ts files in src/ into .js+.map files in node_modules/homebridge-remote-ssh/, and then sits idle waiting for file-save events.

    3. VS Code then invokes nodemon

        * Because your launch.json uses runtimeExecutable: "nodemon".

        * Nodemon reads nodemon.json, sees it should watch node_modules/homebridge-remote-ssh/**/*.js and, on any change, run npm run debug:hb.

    4. Initial nodemon run (first launch)

        * Even before any changes, nodemon fires npm run debug:hb once to get Homebridge started.

    5. npm run debug:hb executes

        a. Build step

            - Runs your build script:

                * Deletes any old files under node_modules/homebridge-remote-ssh/.

                * Does a fresh tsc compile of src/*.ts → node_modules/homebridge-remote-ssh/*.js + *.map.

                * Copies your root package.json into that plugin folder so Homebridge sees its main and metadata.

        b. Prepare debug dir

            * Ensures the folder homebridge-debug/ exists for Homebridge to use as its “user” directory.

        c. Launch Homebridge

            * Runs the Homebridge binary with --inspect=9229, in insecure/debug mode, pointing its -U flag at homebridge-debug (so it loads your freshly-built plugin).

            * All logs stream into homebridge-debug/homebridge.log.

        d. nodemon now holds that Homebridge process

            * nodemon proxies SIGTERM to it when it needs to restart.

    6 .Homebridge startup sequence

        * Homebridge reads homebridge-debug/config.json, sees your accessory entry for “homebridge-remote-ssh”.

        * It reads node_modules/homebridge-remote-ssh/package.json → finds "main": "accessory.js" → loads accessory.js.

        * Because you compiled with source maps, the accessory.js has a link back to accessory.ts.

    7. Debugger attaches

        * VS Code’s debug adapter sees the --inspect=9229 flag and connects its debugger socket.

        * Because you set "autoAttachChildProcesses": true, if Homebridge spawns any child processes, you’d catch those too.

    8. You set a breakpoint in src/accessory.ts

        * VS Code shows the red dot in the TS file.

        Under the covers it maps that location to the corresponding line in the generated .js via the source map.

    9. Trigger your code path

        * For example, flip the switch in the Home app or Homebridge UI.

        Homebridge invokes your plugin’s constructor or setState/getState method in accessory.ts.

    10. Breakpoint hits

        * The JS runtime pauses at the mapped JS line.

        * VS Code, via the source map, highlights the equivalent TS line in your accessory.ts.

        * You can now inspect variables, step in/out, and watch your TypeScript code execute as if Node were running it directly.

Key points that make it work:

    * Continuous TS watch ensures every save rebuilds immediately into the plugin folder.

    * nodemon wraps your build+launch script so every new build triggers a full Homebridge restart.

    * Source maps let the debugger translate between the emitted JS and original TS.

   * --inspect opens the debug port and VS Code auto-attaches to that port.

Whenever you save a .ts in src/, nodemon will tear down the old Homebridge, rebuild your plugin, restart Homebridge under the debugger, and you can step right back into your updated code without leaving VS Code.




### NOTES
---
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