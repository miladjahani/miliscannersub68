import { useMemo } from 'react'
import { useMiSubStore } from '../store'
// @ts-ignore plain JS
import { encodeBase64 } from '../lib/protocols/index.js'
// @ts-ignore plain JS
import { optimizeNodesBatch } from '../lib/optimizer/optimizerEngine.js'
// @ts-ignore plain JS
import { CS_STR, FM_STR, ARAS_CS, ARAS_FM, ARAS_FP } from '../lib/optimizer/araEngine.js'

/**
 * React port of the Vue useOptimizer composable. Runs the real
 * cf-optimizor batch engine — identical logic to the original, only the
 * reactivity primitives changed (Vue refs -> React state from the shared
 * MiSub store).
 */
export function useOptimizer() {
  const s = useMiSubStore()

  const optimizeAll = (): string[] => {
    const content = s.inputNodes.trim()
    if (!content) return []

    const opts = {
      cleanIp: s.cleanIp.trim(),
      cleanPort: s.cleanPort,
      customSni: s.customSni.trim(),
      prefix: s.prefix.trim(),
      fp: s.arasMode ? ARAS_FP : (s.fpValue || 'unsafe'),
      cs: s.arasMode ? ARAS_CS : (s.csValue.trim() || CS_STR),
      fm: s.arasMode ? ARAS_FM : (s.fmValue.trim() || FM_STR),
      fragment: s.fragmentEnabled ? {
        enabled: true,
        length: s.fragmentConfig.length,
        interval: s.fragmentConfig.interval,
        packets: s.fragmentConfig.packets,
      } : undefined,
    }

    const { rawList, errors } = optimizeNodesBatch(content, opts)
    const normalizedErrors = (errors as Array<unknown>).map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object') {
        const item = entry as Record<string, unknown>
        const line = item.line !== undefined ? `خط ${String(item.line)}: ` : ''
        return `${line}${String(item.error ?? 'خطای نامشخص')}`
      }
      return String(entry)
    })
    s.setActiveNodes(rawList as string[])
    s.setOptimizeErrors(normalizedErrors)
    return rawList as string[]
  }

  const optimizedNodes = s.activeNodes
  const optimizedRaw = useMemo(() => s.activeNodes.join('\n'), [s.activeNodes])
  const optimizedBase64 = useMemo(() => encodeBase64(optimizedRaw), [optimizedRaw])
  const lastErrors = s.optimizeErrors || []

  return {
    cleanIp: s.cleanIp, setCleanIp: s.setCleanIp,
    cleanPort: s.cleanPort, setCleanPort: s.setCleanPort,
    customSni: s.customSni, setCustomSni: s.setCustomSni,
    prefix: s.prefix, setPrefix: s.setPrefix,
    inputNodes: s.inputNodes, setInputNodes: s.setInputNodes,
    fragmentEnabled: s.fragmentEnabled, setFragmentEnabled: s.setFragmentEnabled,
    fragmentConfig: s.fragmentConfig, setFragmentConfig: s.setFragmentConfig,
    fpValue: s.fpValue, setFpValue: s.setFpValue,
    csValue: s.csValue, setCsValue: s.setCsValue,
    fmValue: s.fmValue, setFmValue: s.setFmValue,
    arasMode: s.arasMode, setArasMode: s.setArasMode,
    optimizedNodes,
    optimizedRaw,
    optimizedBase64,
    lastErrors,
    optimizeAll,
  }
}
