import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from "homebridge"
import { Client, ConnectConfig } from "ssh2"

// Store reference to HAP API when Homebridge loads the plugin
let hap: HAP

/**
 * Entry point: Homebridge calls this when the plugin is loaded.
 * We store the HAP API and register our SSH accessory class.
 */
export = (api: API) => {
  hap = api.hap
  api.registerAccessory("SSH", SshAccessory)
}

class SshAccessory implements AccessoryPlugin {
  // Internal state tracking whether the accessory is "on"
  private powerOn = false

  // Configurable properties set from config.json
  private readonly log: Logging
  private readonly name: string
  private readonly onCommand: string
  private readonly offCommand: string
  private readonly stateCommand: string
  private readonly onValue: string
  private readonly exactMatch: boolean
  private readonly sshConfig: ConnectConfig

  // HomeKit service definitions
  private readonly switchService: Service
  private readonly informationService: Service

  /**
   * Constructor: initializes configuration, services, and SSH connection settings.
   * Does NOT run any commands yet — that happens later in getServices().
   */
  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log
    this.name = config.name
    this.onCommand = config.on
    this.offCommand = config.off
    this.stateCommand = config.state
    this.onValue = (config.on_value || "playing").trim().toLowerCase()
    this.exactMatch = config.exact_match ?? true

    // Setup SSH credentials and overrides (if any)
    this.sshConfig = {
      host: config.host,
      username: config.user,
      password: config.password,
      privateKey: config.key,
      ...config.ssh, // allow full override via "ssh" block
    }

    // Prepare HomeKit service instances
    this.switchService = new hap.Service.Switch(this.name)
    this.informationService = new hap.Service.AccessoryInformation()
  }

  /**
   * Runs a shell command on the remote SSH host and returns stdout.
   * All steps are logged. If SSH fails or the command errors, it rejects.
   */
  private async executeSshCommand(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const conn = new Client()       // Create a new SSH client
      let result = ""                 // Will collect stdout here

      this.log.debug(`[SSH] Connecting to ${this.sshConfig.username}@${this.sshConfig.host}...`)

      conn.on("ready", () => {
        this.log.debug(`[SSH] Connected. Executing: ${command}`)

        // Execute the command on the remote system
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end()
            this.log.debug(`[SSH] Command execution failed: ${err.message}`)
            return reject(err)
          }

          // Append any output from stdout to the result
          stream.on("data", (data: Buffer) => {
            result += data.toString()
          })

          // Log stderr separately — it doesn't fail the command
          stream.stderr.on("data", (data: Buffer) => {
            this.log.debug(`[SSH STDERR] ${data.toString()}`)
          })

          // Once command completes, log result and return
          stream.on("close", (code: number, signal: string) => {
            conn.end()
            this.log.debug(`[SSH] Command finished (code=${code}, signal=${signal})`)
            this.log.debug(`[SSH] Output: ${result.trim()}`)
            resolve(result.trim())
          })
        })
      })

      // If SSH itself fails (connection refused, bad key), handle it here
      conn.on("error", (err) => {
        this.log.debug(`[SSH] Connection error: ${err.message}`)
        reject(err)
      })

      // Start the SSH connection using the parsed config
      conn.connect(this.sshConfig)
    })
  }

  /**
   * Checks if the output from the SSH command matches the expected "on" value.
   * Match can be exact or substring-based, depending on the config.
   */
  private matchOutput(output: string): boolean {
    const normalized = output.trim().toLowerCase()
    const matched = this.exactMatch
      ? normalized === this.onValue
      : normalized.includes(this.onValue)

    this.log.debug(`[State Match] Output="${normalized}", Match=${matched}`)
    return matched
  }

  /**
   * Called by HomeKit when the user turns the switch on or off.
   * Sends the appropriate SSH command and updates internal state.
   */
  private async setState(
    powerOn: CharacteristicValue,
    callback: CharacteristicSetCallback
  ): Promise<void> {
    const command = powerOn ? this.onCommand : this.offCommand

    try {
      await this.executeSshCommand(command) // Send the SSH command
      this.powerOn = !!powerOn              // Update internal state
      this.log.info(`[Set] ${this.name} turned ${powerOn ? "on" : "off"}`)
      callback(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.info(`[Set] Failed to set ${this.name}: ${message}`)
      callback(error instanceof Error ? error : new Error("SSH error"))
    }
  }

  /**
   * Called by HomeKit when it requests the current state.
   * Runs the state command over SSH and parses the output.
   */
  private async getState(callback: CharacteristicGetCallback): Promise<void> {
    try {
      const output = await this.executeSshCommand(this.stateCommand) // Run state check
      const isOn = this.matchOutput(output)                          // Compare result to expected
      this.log.info(`[Get] ${this.name} is ${isOn ? "on" : "off"}`)
      callback(null, isOn)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.log.info(`[Get] Failed to get state of ${this.name}: ${message}`)
      callback(error instanceof Error ? error : new Error("SSH error"))
    }
  }

  /**
   * Called when the user taps "Identify" in the Home app.
   * This is just for UI purposes — no state changes.
   */
  identify(): void {
    this.log.info(`[Identify] ${this.name}`)
  }

  /**
   * Called by Homebridge after the accessory is fully set up.
   * Binds handlers, returns services, and runs an initial state sync.
   */
  getServices(): Service[] {
    // Setup metadata for the accessory
    this.informationService
      .setCharacteristic(hap.Characteristic.Manufacturer, "SSH Manufacturer")
      .setCharacteristic(hap.Characteristic.Model, "SSH Model")
      .setCharacteristic(hap.Characteristic.SerialNumber, "SSH Serial Number")

    // Access the "On" characteristic and bind the SET handler
    const onCharacteristic = this.switchService
      .getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setState.bind(this))

    // Bind GET handler and run startup state check
    if (this.stateCommand) {
      onCharacteristic.on(CharacteristicEventTypes.GET, this.getState.bind(this))

      // ✅ Initial state sync AFTER HomeKit has bound the characteristic
      this.executeSshCommand(this.stateCommand)
        .then((output) => {
          const isOn = this.matchOutput(output)     // Interpret output
          this.powerOn = isOn                       // Cache value internally
          this.log.info(`[Startup] Initial state of ${this.name} is ${isOn ? "on" : "off"}`)

          // ✅ Push the true initial state to HomeKit UI
          onCharacteristic.updateValue(isOn)
        })
        .catch((err) => {
          this.log.info(`[Startup] Failed to get initial state of ${this.name}: ${err.message}`)
        })
    }

    // Return both the info and main service
    return [this.informationService, this.switchService]
  }
}