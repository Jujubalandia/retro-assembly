import delay from 'delay'
import ini from 'ini'
import { kebabCase } from 'lodash-es'
import { systemCoreMap } from '../constants/systems'
import { createEmscriptenFS } from '../helpers/emscripten-fs'
import { readBlobAsUint8Array } from '../helpers/file'
import { type Rom } from './rom'

// Commands reference https://docs.libretro.com/development/retroarch/network-control-interface/
type RetroArchCommand =
  | 'FAST_FORWARD'
  | 'FAST_FORWARD_HOLD'
  | 'LOAD_STATE'
  | 'SAVE_STATE'
  | 'FULLSCREEN_TOGGLE'
  | 'QUIT'
  | 'STATE_SLOT_PLUS'
  | 'STATE_SLOT_MINUS'
  | 'REWIND'
  | 'MOVIE_RECORD_TOGGLE'
  | 'PAUSE_TOGGLE'
  | 'FRAMEADVANCE'
  | 'RESET'
  | 'SHADER_NEXT'
  | 'SHADER_PREV'
  | 'CHEAT_INDEX_PLUS'
  | 'CHEAT_INDEX_MINUS'
  | 'CHEAT_TOGGLE'
  | 'SCREENSHOT'
  | 'MUTE'
  | 'NETPLAY_FLIP'
  | 'SLOWMOTION'
  | 'VOLUME_UP'
  | 'VOLUME_DOWN'
  | 'OVERLAY_NEXT'
  | 'DISK_EJECT_TOGGLE'
  | 'DISK_NEXT'
  | 'DISK_PREV'
  | 'GRAB_MOUSE_TOGGLE'
  | 'MENU_TOGGLE'

const raUserdataDir = '/home/web_user/retroarch/userdata/'
const raCoreConfigDir = `${raUserdataDir}config/`
const raConfigPath = `${raUserdataDir}retroarch.cfg`

const encoder = new TextEncoder()

function getEmscriptenModuleOverrides() {
  let resolveRunDependenciesPromise: () => void
  const runDependenciesPromise = new Promise<void>((resolve) => {
    resolveRunDependenciesPromise = resolve
  })

  return {
    noInitialRun: true,
    noExitRuntime: false,

    print(...args: unknown[]) {
      console.info(...args)
    },

    printErr(...args: unknown[]) {
      console.error(...args)
    },

    quit(status: unknown, toThrow: unknown) {
      if (status) {
        console.info(status, toThrow)
      }
    },

    locateFile(path) {
      return path
    },

    async monitorRunDependencies(left: number) {
      if (left === 0) {
        resolveRunDependenciesPromise()
      }
      return await runDependenciesPromise
    },
  }
}

function updateStyle(element: HTMLElement, style: Partial<CSSStyleDeclaration>) {
  if (!element) {
    return
  }
  for (const rule in style) {
    if (style[rule]) {
      element.style.setProperty(kebabCase(rule), style[rule] as string)
    } else {
      element.style.removeProperty(rule)
    }
  }
}

interface EmulatorConstructorOptions {
  core?: string
  rom?: Rom
  style?: Partial<CSSStyleDeclaration>
}

export class Emulator {
  core = ''
  rom?: Rom
  status: 'initial' | 'ready' | 'terminated' = 'initial'
  canvas: HTMLCanvasElement
  canvasContainer: HTMLButtonElement
  emscripten: any
  private previousActiveElement: Element | null
  private messageQueue: [Uint8Array, number][] = []

  constructor({ core, rom, style }: EmulatorConstructorOptions) {
    this.rom = rom ?? undefined
    this.core = core ?? ''
    this.canvasContainer = document.createElement('button')
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'canvas'
    this.canvas.hidden = true
    this.canvas.width = 900
    this.canvas.height = 900
    this.previousActiveElement = document.activeElement
    updateStyle(this.canvasContainer, {
      display: 'block',
      position: 'absolute',
      top: '0',
      left: '0',
      zIndex: '15',
      width: '100%',
      height: '100%',
      cursor: 'default',
    })
    updateStyle(this.canvas, {
      display: 'block',
      imageRendering: 'pixelated', // this boosts performance!
      width: '100%',
      height: '100%',
    })

    for (const rule in style) {
      this.canvas.style.setProperty(rule, style[rule])
    }

    this.resizeCanvas = this.resizeCanvas.bind(this)
  }

  private get stateFileName() {
    if (!this.rom) {
      throw new Error('rom is not ready')
    }
    const { name } = this.rom.fileSummary
    const baseName = name.slice(0, name.lastIndexOf('.'))
    return `${raUserdataDir}states/${baseName}.state`
  }

  private get stateThumbnailFileName() {
    return `${this.stateFileName}.png`
  }

  async launch() {
    if (this.rom) {
      // todo: maybe this is not necessary
      await this.rom.ready()
      this.core = systemCoreMap[this.rom.system]
    }

    if (this.isTerminated()) {
      this.forceExit()
      return
    }

    if (!this.core) {
      throw new Error('Invalid core')
    }
    await this.prepareEmscripten()

    if (this.isTerminated()) {
      this.forceExit()
      return
    }

    this.prepareRaConfigFile()
    this.prepareRaCoreConfigFile()
    this.runMain()
    this.resizeCanvas()
    window.addEventListener('resize', this.resizeCanvas, false)
    if (this.canvas) {
      this.canvas.hidden = false
      this.canvasContainer.focus()
    }
    this.status = 'ready'
  }

  start() {
    this.sendCommand('PAUSE_TOGGLE')
  }

  pause() {
    this.sendCommand('PAUSE_TOGGLE')
  }

  async saveState() {
    this.clearStateFile()
    if (!this.rom || !this.emscripten) {
      return
    }
    this.sendCommand('SAVE_STATE')
    const shouldSaveThumbnail = true
    let stateBuffer: Buffer
    let stateThumbnailBuffer: Buffer | undefined
    if (shouldSaveThumbnail) {
      ;[stateBuffer, stateThumbnailBuffer] = await Promise.all([
        this.waitForEmscriptenFile(this.stateFileName),
        this.waitForEmscriptenFile(this.stateThumbnailFileName),
      ])
    } else {
      stateBuffer = await this.waitForEmscriptenFile(this.stateFileName)
    }
    this.clearStateFile()
    return {
      name: this.rom?.fileSummary.name,
      core: this.core,
      createTime: Date.now(),
      blob: new Blob([stateBuffer]),
      thumbnailBlob: stateThumbnailBuffer ? new Blob([stateThumbnailBuffer]) : undefined,
    }
  }

  async loadState(blob: Blob) {
    this.clearStateFile()
    if (this.emscripten) {
      const { FS } = this.emscripten
      const buffer = await blob.arrayBuffer()
      const uint8Array = new Uint8Array(buffer)
      FS.writeFile(this.stateFileName, uint8Array)
      await this.waitForEmscriptenFile(this.stateFileName)
      this.sendCommand('LOAD_STATE')
    }
  }

  exit(statusCode = 0) {
    this.status = 'terminated'
    if (this.emscripten) {
      const { FS, exit, JSEvents } = this.emscripten
      exit(statusCode)
      FS.unmount('/home')
      JSEvents.removeAllEventListeners()
    }
    window.removeEventListener('resize', this.resizeCanvas, false)
    this.canvas.remove()
    this.canvasContainer.remove()
    // @ts-expect-error try to focus on previous active element
    this.previousActiveElement?.focus?.()
  }

  sendCommand(msg: RetroArchCommand) {
    const bytes = encoder.encode(`${msg}\n`)
    this.messageQueue.push([bytes, 0])
  }

  // copied from https://github.com/libretro/RetroArch/pull/15017
  private stdin() {
    const { messageQueue } = this
    // Return ASCII code of character, or null if no input
    while (messageQueue.length > 0) {
      const msg = messageQueue[0][0]
      const index = messageQueue[0][1]
      if (index >= msg.length) {
        messageQueue.shift()
      } else {
        messageQueue[0][1] = index + 1
        // assumption: msg is a uint8array
        return msg[index]
      }
    }
    return null
  }

  private clearStateFile() {
    const { FS } = this.emscripten
    try {
      FS.unlink(this.stateFileName)
      FS.unlink(this.stateThumbnailFileName)
    } catch {}
  }

  private async waitForEmscriptenFile(fileName) {
    const { FS } = this.emscripten
    let buffer
    let maxRetries = 100
    let isFinished = false
    while ((maxRetries -= 1) && !isFinished) {
      await delay(40)
      try {
        const newBuffer = FS.readFile(fileName).buffer
        isFinished = buffer?.byteLength > 0 && buffer?.byteLength === newBuffer.byteLength
        buffer = newBuffer
      } catch (error) {
        console.warn(error)
      }
    }
    return buffer
  }

  private isTerminated() {
    return this.status === 'terminated'
  }

  private forceExit() {
    this.status = 'terminated'
    const { FS, exit, JSEvents } = this.emscripten || {}
    try {
      exit(0)
    } catch {}
    try {
      FS.unmount('/home')
    } catch {}
    try {
      window.removeEventListener('resize', this.resizeCanvas, false)
    } catch {}
    try {
      JSEvents.removeAllEventListeners()
    } catch {}
    try {
      this.canvas.remove()
      this.canvasContainer.remove()
    } catch {}
  }

  private async prepareEmscripten() {
    const { getEmscripten } = await import(`../../generated/retroarch-cores/${this.core}_libretro.js`)
    this.emscripten = getEmscripten({ Module: getEmscriptenModuleOverrides() })
    this.canvasContainer.append(this.canvas)
    document.body.append(this.canvasContainer)

    const { Module } = this.emscripten
    await Promise.all([await this.prepareFileSystem(), await Module.monitorRunDependencies()])
  }

  private async prepareFileSystem() {
    const { Module, FS, PATH, ERRNO_CODES } = this.emscripten

    Module.canvas = this.canvas
    Module.preRun = [
      () =>
        FS.init(() => {
          return this.stdin()
        }),
    ]

    const emscriptenFS = createEmscriptenFS({ FS, PATH, ERRNO_CODES })
    FS.mount(emscriptenFS, { root: '/home' }, '/home')

    if (this.rom) {
      const blob = await this.rom.getBlob()
      const fileName = this.rom.fileSummary.name
      const uint8Array = await readBlobAsUint8Array(blob)
      FS.createDataFile('/', fileName, uint8Array, true, false)
      const data = FS.readFile(fileName, { encoding: 'binary' })
      FS.mkdirTree(`${raUserdataDir}content/`)
      FS.writeFile(`${raUserdataDir}content/${fileName}`, data, { encoding: 'binary' })
      FS.unlink(fileName)
    }
  }

  private writeConfig({ path, config }) {
    const { FS } = this.emscripten
    const dir = path.slice(0, path.lastIndexOf('/'))
    FS.mkdirTree(dir)
    // @ts-expect-error `platform` option is not listed in @types/ini for now
    FS.writeFile(path, ini.stringify(config, { whitespace: true, platform: 'linux' }))
  }

  private getRaCoreConfig() {
    const map = {
      nestopia: {
        nestopia_turbo_pulse: 2,
        nestopia_overclock: '2x',
        nestopia_nospritelimit: 'enabled',
      },
      fceumm: {
        fceumm_turbo_enable: 'Both',
      },
      snes9x: {},
      gearboy: {},
      genesis_plus_gx: {},
      genesis_plus_gx_wide: {},
    }
    return map[this.core]
  }

  private prepareRaCoreConfigFile() {
    const raCoreConfigPathMap = {
      nestopia: 'Nestopia/Nestopia.opt',
      fceumm: 'FCEUmm/FCEUmm.opt',
      gearboy: 'Gearboy/Gearboy.opt',
      picodrive: 'PicoDrive/PicoDrive.opt',
      genesis_plus_gx: 'Genesis Plus GX/Genesis Plus GX.opt',
      genesis_plus_gx_wide: 'Genesis Plus GX Wide/Genesis Plus GX Wide.opt',
    }
    const raCoreConfigPath = raCoreConfigPathMap[this.core] ?? ''
    const raCoreConfig = this.getRaCoreConfig()
    if (raCoreConfigPath && raCoreConfig) {
      this.writeConfig({
        path: `${raCoreConfigDir}${raCoreConfigPath}`,
        config: raCoreConfig,
      })
    }
  }

  private prepareRaConfigFile() {
    const raConfig = {
      menu_driver: 'rgui',
      rewind_enable: true,
      notification_show_when_menu_is_alive: true,
      stdin_cmd_enable: true,
      quit_press_twice: false,

      rgui_menu_color_theme: 4,
      // rgui_particle_effect: 3,
      rgui_show_start_screen: false,
      savestate_file_compression: true,
      savestate_thumbnail_enable: true,
      save_file_compression: true,

      input_rewind_btn: 6, // L2
      // input_hold_fast_forward_btn: 7, // R2
      input_menu_toggle_gamepad_combo: 6, // L1+R1
      rewind_granularity: 4,
    }
    this.writeConfig({ path: raConfigPath, config: raConfig })
  }

  private runMain() {
    const { Module, JSEvents } = this.emscripten
    const raArgs: string[] = []
    if (this.rom) {
      raArgs.push(`/home/web_user/retroarch/userdata/content/${this.rom.fileSummary.name}`)
    }
    Module.callMain(raArgs)
    // Module.resumeMainLoop()

    // Emscripten module register keyboard events to document, which make custome interactions unavilable.
    // Let's modify the default event liseners
    const keyboardEvents = new Set(['keyup', 'keydown', 'keypress'])
    const globalKeyboardEventHandlers = JSEvents.eventHandlers.filter(
      ({ eventTypeString, target }) => keyboardEvents.has(eventTypeString) && target === document
    )
    for (const globalKeyboardEventHandler of globalKeyboardEventHandlers) {
      const { eventTypeString, target, handlerFunc } = globalKeyboardEventHandler
      JSEvents.registerOrRemoveHandler({ eventTypeString, target })
      JSEvents.registerOrRemoveHandler({
        ...globalKeyboardEventHandler,
        handlerFunc: (...args) => {
          const [event] = args
          if (event?.target === this.canvasContainer) {
            handlerFunc(...args)
          }
        },
      })
    }

    // tell retroarch that controllers are connected
    for (const gamepad of navigator.getGamepads?.() ?? []) {
      if (gamepad) {
        window.dispatchEvent(new GamepadEvent('gamepadconnected', { gamepad }))
      }
    }
  }

  private resizeCanvas() {
    requestAnimationFrame(() => {
      const { Module } = this.emscripten
      Module.setCanvasSize(innerWidth, innerHeight)
    })
  }
}
