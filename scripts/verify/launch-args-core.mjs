// Pure launch policy for the verify browsers (point 475). scripts/verify/_browser.mjs
// is the single launcher for every browser suite; this module holds the decisions it
// makes, side-effect-free, so the Vitest layer can sweep them without opening a
// browser (scripts/verify/launch-args-core.test.mjs).
//
// Why it exists (measured 03.08.2026, when the project moved to a Linux container):
// the WebGL 2 lane launched with `--use-angle=d3d11`, a Direct3D backend that exists
// only on Windows, and the WebGPU lane launched `channel:'chrome'` — a system Chrome
// that is simply absent on the new host. Neither failure was a code bug; both were a
// hard-coded HOST assumption. The lane args are therefore chosen BY PLATFORM here,
// and the WebGPU lane states out loud when the host cannot run it at all instead of
// quietly producing a WebGL 2 run under a WebGPU label.

/** The ANGLE backend each platform can actually provide.
 *
 *  win32 keeps `d3d11` — the historical value, unchanged byte for byte; the Windows
 *  host is the one this project has always verified on and nothing about it moved.
 *
 *  Linux headless gets `gl` (point 493, 04.08.2026). The earlier `swiftshader` was
 *  chosen on 03.08.2026 from a premise that has since been measured false — "the
 *  container has no GPU, no DRI driver and no system libEGL/libGL". It has all three:
 *  /dev/dxg is passed through, /usr/lib/wsl/lib carries libd3d12/libd3d12core/libdxcore,
 *  and Mesa's d3d12 Gallium driver turns that into hardware GL. With `gl` the lane comes
 *  up as "ANGLE (Microsoft Corporation, D3D12 (NVIDIA GeForce RTX 4070 Ti), OpenGL 4.2)"
 *  against SwiftShader's "Vulkan 1.3.0 (SwiftShader Device (Subzero))" — measured on the
 *  identical scene at 170 vs 22.7 renderer calls per second, a 7.5× picture rate. What
 *  the host needs for it is installed by scripts/verify-host-setup.sh (libgl1, libegl1,
 *  mesa DRI) and by the devcontainer's X11 socket.
 *
 *  It DEGRADES rather than breaks: with the X socket gone the same flags still come up,
 *  on SwiftShader (measured — the 03.08 note's "context-less page" does not happen here),
 *  so a host without the graphics stack loses speed and keeps its picture. Which one a
 *  run actually got is not left to inference: backend-lane-check.mjs prints the renderer
 *  string and names a software rasteriser as one.
 *
 *  darwin gets `metal`, the only backend ANGLE has there.
 */
const ANGLE_BY_PLATFORM = {
  win32: 'd3d11',
  darwin: 'metal',
  linux: 'gl',
}

/** Fallback for a platform not named above — software, so it cannot assume a driver. */
const ANGLE_FALLBACK = 'swiftshader'

/** The ANGLE backend for the WebGL 2 lane. `override` is the raw VERIFY_ANGLE value:
 *  an escape hatch for a host whose graphics stack differs from its platform's norm
 *  (a Linux box with a real GPU wanting `gl` or `vulkan`). Empty/absent means "decide
 *  by platform". */
export function angleBackend(platform, override) {
  const forced = typeof override === 'string' ? override.trim().toLowerCase() : ''
  if (forced) return forced
  return ANGLE_BY_PLATFORM[platform] ?? ANGLE_FALLBACK
}

/** The Gallium driver the ANGLE `gl` backend should load, as an ENVIRONMENT value —
 *  Mesa reads it there, not from a browser flag.
 *
 *  Linux gets `d3d12`, the driver that reaches /dev/dxg (point 493). Mesa 22.3.6 picked it
 *  by itself; Mesa 25 does not — with the variable unset the identical host reports
 *  "ANGLE (Mesa, llvmpipe …)" and every suite runs on the CPU while looking perfectly
 *  healthy. That silent downgrade is why it is pinned rather than left to the loader.
 *
 *  `override` is the raw VERIFY_GALLIUM value, for a Linux host with a different stack;
 *  the literal `none` sets nothing at all. Empty/absent means "decide by platform". */
export function galliumDriver(platform, override) {
  const forced = typeof override === 'string' ? override.trim().toLowerCase() : ''
  if (forced) return forced === 'none' ? '' : forced
  return platform === 'linux' ? 'd3d12' : ''
}

/** The environment a lane's browser launches with: `baseEnv` plus what the graphics stack
 *  needs. Handed over WHOLE because Playwright REPLACES the environment when given one —
 *  passing the delta alone would strip PATH, HOME and the display the driver needs. */
export function laneEnv(platform, baseEnv, galliumOverride) {
  const gallium = galliumDriver(platform, galliumOverride)
  const base = { ...(baseEnv ?? {}) }
  return gallium ? { ...base, GALLIUM_DRIVER: gallium } : base
}

/** What a Linux container launch needs beyond the ANGLE choice.
 *
 *  --no-sandbox: Chromium's sandbox needs unprivileged user namespaces, which container
 *  images routinely withhold.
 *  --ignore-gpu-blocklist: Chrome blocklists the D3D12-through-Mesa driver by default and
 *  would drop to software without ever saying so.
 *  --disable-dev-shm-usage: /dev/shm is 64 MB in a default container; the GPU process
 *  dies on a large frame otherwise.
 *
 *  Windows and macOS keep exactly the argument list they always had. */
function platformArgs(platform) {
  return platform === 'linux' ? ['--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--no-sandbox'] : []
}

/** What the WebGL 2 lane says about WebGPU. The lane's whole job is the FALLBACK
 *  backend, so the safe answer would always be "off" — but Windows keeps
 *  `--enable-unsafe-webgpu` byte for byte, because there the bundled Chromium brings up
 *  no headless WebGPU adapter at all (point 184) and the flag has never done anything.
 *
 *  On Linux it does. Measured 03.08.2026 in the container: SwiftShader DOES expose a
 *  WebGPU adapter under that flag, the game initialises it in preference to WebGL 2, and
 *  it dies on its first attribute buffer ("createBuffer failed, size (288) is too large
 *  for the implementation") — the page never finishes loading, so `assertBackend` never
 *  gets to notice the wrong backend. Turning WebGPU off is what makes the fallback lane
 *  exercise the fallback. */
function webgpuArg(platform) {
  return platform === 'linux' ? '--disable-features=WebGPU' : '--enable-unsafe-webgpu'
}

/** Launch options for the WebGL 2 fallback lane (Playwright's bundled Chromium).
 *
 *  `baseEnv` is the environment to build the browser's on (the caller's process.env).
 *  It is OPT-IN: given one, the options carry a complete `env`; without one they are
 *  args only, exactly as before. Playwright replaces the environment when handed one,
 *  so half an environment is worse than none — the opt-in makes that explicit rather
 *  than leaving a caller to discover it. */
export function webglLaunchOptions(platform, angleOverride, baseEnv, galliumOverride) {
  const env = laneEnv(platform, baseEnv, galliumOverride)
  return {
    args: [
      webgpuArg(platform),
      `--use-angle=${angleBackend(platform, angleOverride)}`,
      '--enable-gpu',
      ...platformArgs(platform),
    ],
    ...(baseEnv ? { env } : {}),
  }
}

/** The three flags a GPU-less Linux host needs before the WebGPU lane DRAWS (measured
 *  04.08.2026, point 493). Without them system Chrome still reports a WebGPU adapter and
 *  three.js still initialises `isWebGPUBackend` — and then every frame goes nowhere: the
 *  page throws "OperationError: Instance dropped in popErrorScope" ~2 s in, the canvas
 *  stays BLACK behind a live HUD, and `info.memory.renderTargets` climbs past 1000 while
 *  the renderer re-creates what the dropped instance ate. Exactly the trap point 493
 *  names: an interface that answers, and no picture.
 *
 *  The cause is two graphics stacks disagreeing. Dawn picks Chrome's bundled SwiftShader
 *  Vulkan, while ANGLE (the compositor's GL side) finds no `libGL.so.1` and the loader's
 *  only system ICD is Mesa 22.3.6 lavapipe; the GPU process then drops the Dawn instance
 *  under it. Pinning BOTH sides to the browser's own bundled SwiftShader ends the
 *  disagreement. All three are required — measured, every proper subset of them still
 *  dropped the instance on 2/2 runs, while the full set drew the real game on 3/3
 *  (~4 fps, the same order as the WebGL 2 lane's SwiftShader).
 *
 *  Linux only, and deliberately so: the flags describe a host with no usable driver.
 *  Windows and macOS keep the argument list byte for byte. */
const LINUX_WEBGPU_SOFTWARE_ARGS = ['--use-angle=swiftshader', '--enable-features=Vulkan', '--use-vulkan=swiftshader']

/** Launch options for the WebGPU lane. The
 *  point-184 breakthrough is a SYSTEM browser with --headless=new (Playwright's bundled
 *  Chromium fails requestDevice headless), and the host decides only WHETHER such a
 *  browser exists (see webgpuLaneVerdict) and which driver flags it needs
 *  (LINUX_WEBGPU_SOFTWARE_ARGS above).
 *
 *  `systemChrome` is the executable the caller PROBED (systemChromeCandidates →
 *  findSystemChrome). When there is one it is handed over as `executablePath`, so the
 *  lane opens EXACTLY the binary the bring-up reported. That is the whole point: the
 *  `chrome` CHANNEL resolves, inside playwright-core's registry, to /opt/google/chrome/
 *  chrome and its beta/dev/canary siblings and nothing else, so a host whose browser
 *  sits anywhere else — a distro `chromium`, a snap, a Chrome installed off that path —
 *  was reported "present" and then died on Playwright's generic channel error. With the
 *  path handed through, the report and the launch cannot disagree: Playwright takes
 *  executablePath in preference to the channel registry, and a path that vanished in
 *  between fails naming the path. `channel` is dropped in that case — it only ever
 *  selected the registry entry this launch no longer consults.
 *
 *  With nothing probed (Windows, macOS — see systemChromeCandidates) the options are
 *  byte for byte the historical `channel:'chrome'` launch and Playwright resolves it. */
export function webgpuLaunchOptions(systemChrome = null, platform = process.platform, baseEnv, galliumOverride) {
  const args = [
    '--headless=new',
    '--enable-unsafe-webgpu',
    '--enable-gpu',
    ...(platform === 'linux' ? [...LINUX_WEBGPU_SOFTWARE_ARGS, ...platformArgs(platform)] : []),
  ]
  const executablePath = typeof systemChrome === 'string' ? systemChrome.trim() : ''
  const env = baseEnv ? { env: laneEnv(platform, baseEnv, galliumOverride) } : {}
  return executablePath ? { executablePath, args, ...env } : { channel: 'chrome', args, ...env }
}

/** The options `_browser.mjs` hands chromium.launch for the requested backend. */
export function verifyLaunchOptions(backend, platform, angleOverride, systemChrome, baseEnv, galliumOverride) {
  return backend === 'webgpu'
    ? webgpuLaunchOptions(systemChrome, platform, baseEnv, galliumOverride)
    : webglLaunchOptions(platform, angleOverride, baseEnv, galliumOverride)
}

/** The loud headline of an unrunnable WebGPU lane. Verbatim in the thrown error so a
 *  log or a guard can recognise it without parsing prose. */
export const WEBGPU_UNAVAILABLE = 'WebGPU backend unavailable on this host'

/** Executables that can serve the WebGPU lane, in probe order. Names without a
 *  separator are looked up on PATH by the caller; the rest are absolute.
 *
 *  A distro `chromium` counts, and only because the resolved path is HANDED to the
 *  launch (webgpuLaunchOptions): a full Chromium build is the same engine, while the
 *  `chrome` channel alone would never have found it. Whether a given build really
 *  brings up a headless WebGPU adapter is not a question any probe can answer — the
 *  lane's own assertBackend answers it, loudly, on the running renderer.
 *
 *  Windows returns NOTHING deliberately — not "no Chrome", but "do not probe": Chrome's
 *  install location there varies (per-user, per-machine, an enterprise path), Playwright
 *  has resolved the `chrome` channel from the registry for years, and a probe that
 *  guessed wrong would break the one host this project has always verified on. macOS is
 *  left unprobed for the same reason. The probe exists for the Linux container the point
 *  measured, where the lane's absence is the whole finding. */
export function systemChromeCandidates(platform) {
  if (platform !== 'linux') return []
  return [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/opt/google/chrome/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ]
}

/**
 * Can the WebGPU lane run here? `systemChrome` is the executable the caller resolved
 * from systemChromeCandidates (null when none exists).
 *
 * On an unprobed platform the answer is "yes, let Playwright resolve the channel" —
 * that is the historical path, and a failure there still surfaces as Playwright's own
 * loud launch error. On a probed platform with nothing found, the answer is an explicit
 * UNAVAILABLE verdict. The caller throws it; it never downgrades to WebGL 2, and
 * because nothing launches, the run recorder is never armed — so no record exists for
 * render-verify-guard to mistake for WebGPU coverage.
 */
export function webgpuLaneVerdict({ platform, systemChrome } = {}) {
  if (systemChrome) return { available: true, systemChrome }
  if (systemChromeCandidates(platform).length === 0) {
    return { available: true, systemChrome: null, probed: false }
  }
  return {
    available: false,
    systemChrome: null,
    probed: true,
    reason:
      `${WEBGPU_UNAVAILABLE}: the lane needs a SYSTEM Chrome/Chromium (launched by path, ` +
      "--headless=new, point 184 — Playwright's bundled Chromium has no headless WebGPU " +
      'adapter), and none of ' +
      `[${systemChromeCandidates(platform).join(', ')}] exists on this ${platform} host. ` +
      'Install one (see the host bring-up in scripts/verify/README.md) and re-run. This run is ' +
      'NOT silently downgraded to WebGL 2: a WebGL 2 picture is no evidence about the WebGPU one ' +
      '(point 210), so nothing is recorded as backend coverage.',
  }
}
