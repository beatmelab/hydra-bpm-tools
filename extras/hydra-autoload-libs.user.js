// ==UserScript==
// @name         Hydra autoload libs
// @namespace    https://github.com/beatmelab/hydra-bpm-tools
// @version      1.0
// @description  Auto-load external Hydra libraries
// @author       @alt234vj | @beatmelab | https://www.beatmelab.com
// @license      GPL-3.0-only
// @homepageURL  https://github.com/beatmelab/hydra-bpm-tools
// @supportURL   https://github.com/beatmelab/hydra-bpm-tools/issues
// @downloadURL  none
// @updateURL    none
// @match        https://hydra.ojack.xyz/
// @match        https://hydra.ojack.xyz/?*
// @exclude      https://hydra.ojack.xyz/docs/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
  "use strict"

  const libs = [
    {
      url: "https://cdn.statically.io/gl/metagrowing/extra-shaders-for-hydra@a0a2898b2a4048ae78b671a006f1fbd64c92a9ee/lib/all.js",
    }, // doc: https://gitlab.com/metagrowing/extra-shaders-for-hydra
    // { url: "https://another-url.com/lib.js" },
  ]
  const hydraReadyTimeoutMs = 15_000
  const libraryLoadTimeoutMs = 30_000
  const initialPollDelayMs = 50
  const maxPollDelayMs = 500

  const s = document.createElement("script")
  s.textContent = `
    ;(async () => {
      "use strict"

      const libs = ${JSON.stringify(libs)}
      const hydraReadyTimeoutMs = ${hydraReadyTimeoutMs}
      const libraryLoadTimeoutMs = ${libraryLoadTimeoutMs}
      const initialPollDelayMs = ${initialPollDelayMs}
      const maxPollDelayMs = ${maxPollDelayMs}
      const abortController = new AbortController()
      const { signal } = abortController
      const cancel = () => abortController.abort()

      const createAbortError = () => {
        const error = new Error("Hydra library autoload cancelled")
        error.name = "AbortError"
        return error
      }

      const sleep = (delayMs) => new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(createAbortError())
          return
        }

        const timeoutId = setTimeout(() => {
          signal.removeEventListener("abort", onAbort)
          resolve()
        }, delayMs)
        const onAbort = () => {
          clearTimeout(timeoutId)
          reject(createAbortError())
        }

        signal.addEventListener("abort", onAbort, { once: true })
      })

      const waitForHydra = async () => {
        const deadline = Date.now() + hydraReadyTimeoutMs
        let pollDelayMs = initialPollDelayMs

        while (typeof window.loadScript !== "function") {
          const remainingMs = deadline - Date.now()
          if (remainingMs <= 0) {
            throw new Error(
              "Timed out waiting for Hydra to expose window.loadScript"
            )
          }

          await sleep(Math.min(pollDelayMs, remainingMs))
          pollDelayMs = Math.min(pollDelayMs * 2, maxPollDelayMs)
        }
      }

      const loadLibrary = ({ url }) => new Promise((resolve, reject) => {
        if (signal.aborted) {
          reject(createAbortError())
          return
        }

        const script = document.createElement("script")
        const timeoutId = setTimeout(() => {
          finish(new Error(\`Timed out loading external Hydra library: \${url}\`))
        }, libraryLoadTimeoutMs)

        const cleanup = () => {
          clearTimeout(timeoutId)
          signal.removeEventListener("abort", onAbort)
          script.removeEventListener("load", onLoad)
          script.removeEventListener("error", onError)
        }
        const finish = (error) => {
          cleanup()
          if (error) {
            script.remove()
            reject(error)
          } else {
            resolve()
          }
        }
        const onAbort = () => finish(createAbortError())
        const onLoad = () => finish()
        const onError = () => finish(
          new Error(\`Failed to load external Hydra library: \${url}\`)
        )

        script.src = url
        script.referrerPolicy = "no-referrer"
        script.addEventListener("load", onLoad, { once: true })
        script.addEventListener("error", onError, { once: true })
        signal.addEventListener("abort", onAbort, { once: true })
        document.head.appendChild(script)
      })

      window.addEventListener("pagehide", cancel, { once: true })

      try {
        await waitForHydra()
        for (const lib of libs) {
          try {
            await loadLibrary(lib)
          } catch (error) {
            if (error.name === "AbortError") throw error
            console.error("[Hydra autoload libs]", error)
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("[Hydra autoload libs]", error)
        }
      } finally {
        window.removeEventListener("pagehide", cancel)
      }
    })()
  `
  document.documentElement.appendChild(s)
  s.remove()
})()
