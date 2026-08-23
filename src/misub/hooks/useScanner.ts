import { useMemo, useRef } from 'react'
import { useMiSubStore, type ScanResult } from '../store'
// @ts-ignore plain JS
import { testIpMultiRound, scanBatchViaWorker } from '../lib/scanner/scannerEngine.js'
// @ts-ignore plain JS
import { testDownloadSpeed } from '../lib/scanner/speedtest.js'
// @ts-ignore plain JS
import { getWorkerUrl } from '../lib/workerApi.js'

/**
 * React port of the Vue useScanner composable. Same real logic (TCP
 * handshake probing via a configured Cloudflare Worker, falling back to
 * local client-side probing) — only the reactivity layer changed.
 */

function normalizeScanResult(value: unknown): ScanResult {
  const r = (value && typeof value === 'object') ? value as Record<string, unknown> : {}
  const status = r.status === 'ok' || r.status === 'error' || r.status === 'testing'
    ? r.status
    : 'error'
  return {
    ...r,
    ip: String(r.ip ?? ''),
    latency: typeof r.latency === 'number' ? r.latency : null,
    jitter: typeof r.jitter === 'number' ? r.jitter : 0,
    status,
  }
}

export function useScanner() {
  const s = useMiSubStore()
  // A ref (not React state) so stopScan() can signal the running startScan()
  // loop synchronously, without waiting for a re-render — React state read
  // inside the async loop's closure would otherwise stay stale.
  const stopFlagRef = useRef(false)

  const healthyCount = useMemo(() => s.scannerResults.filter((r) => r && r.status === 'ok').length, [s.scannerResults])
  const failedCount = useMemo(() => s.scannerResults.filter((r) => r && r.status === 'error').length, [s.scannerResults])

  const displayResults = useMemo(() => {
    const list = [...s.scannerResults].filter(Boolean)
    return list.sort((a, b) => {
      if (a.latency === null && b.latency === null) return 0
      if (a.latency === null) return 1
      if (b.latency === null) return -1
      return (a.latency as number) - (b.latency as number)
    })
  }, [s.scannerResults])

  const startScan = async () => {
    const ips = s.scannerIpsInput.split('\n').map((i) => i.trim()).filter(Boolean)
    if (!ips.length || s.isScanning) return

    s.setIsScanning(true)
    s.setShouldStopScanning(false)
    let results: ScanResult[] = ips.map((ip) => ({ ip, latency: null, jitter: 0, status: 'testing' }))
    s.setScannerResults(results)
    s.setScanProgress({ current: 0, total: ips.length })

    // Local mutable mirror so we can write results incrementally without
    // waiting for React state round-trips between chunks/threads.
    const localResults = results.slice()
    const flush = () => s.setScannerResults(localResults.slice())

    const worker = getWorkerUrl()
    stopFlagRef.current = false

    if (worker) {
      const CHUNK_SIZE = 40
      for (let i = 0; i < ips.length; i += CHUNK_SIZE) {
        if (stopFlagRef.current) break
        const chunk = ips.slice(i, i + CHUNK_SIZE)
        try {
          const chunkResults = await scanBatchViaWorker(chunk, {
            port: 443,
            mode: 'both',
            concurrency: Math.min(s.concurrency * 3, 40),
            timeoutMs: s.timeoutMs * 6,
          })
          chunkResults.forEach((r: unknown, j: number) => { localResults[i + j] = normalizeScanResult(r) })
        } catch {
          for (let j = 0; j < chunk.length; j++) {
            localResults[i + j] = normalizeScanResult(await testIpMultiRound(chunk[j], 2, s.timeoutMs))
          }
        }
        flush()
        s.setScanProgress((prev) => ({ current: Math.min(i + CHUNK_SIZE, ips.length), total: prev.total }))
      }
    } else {
      const threadCount = s.concurrency
      let idx = 0
      let doneCount = 0
      const localWorker = async () => {
        while (idx < ips.length) {
          if (stopFlagRef.current) break
          const targetIdx = idx++
          const ip = ips[targetIdx]
          const res = normalizeScanResult(await testIpMultiRound(ip, 2, s.timeoutMs))
          localResults[targetIdx] = res
          flush()
          doneCount++
          s.setScanProgress((prev) => ({ current: doneCount, total: prev.total }))
        }
      }
      const pool = Array.from({ length: Math.min(threadCount, ips.length) }, () => localWorker())
      await Promise.all(pool)
    }

    s.setIsScanning(false)
    return localResults
  }

  const stopScan = () => {
    stopFlagRef.current = true
    s.setShouldStopScanning(true)
    s.setIsScanning(false)
  }

  const runSpeed = async (item: ScanResult) => {
    s.setScannerResults((prev) => prev.map((r) => r.ip === item.ip ? { ...r, speedTesting: true } : r))
    const res = await testDownloadSpeed(item.ip, 5000000, 8000)
    s.setScannerResults((prev) => prev.map((r) => r.ip === item.ip ? { ...r, speedMbps: res.speedMbps, speedTesting: false } : r))
  }

  return {
    rawIpsInput: s.scannerIpsInput, setRawIpsInput: s.setScannerIpsInput,
    concurrency: s.concurrency, setConcurrency: s.setConcurrency,
    timeoutMs: s.timeoutMs, setTimeoutMs: s.setTimeoutMs,
    isScanning: s.isScanning,
    results: s.scannerResults,
    scanProgress: s.scanProgress,
    healthyCount,
    failedCount,
    displayResults,
    startScan,
    stopScan,
    runSpeed,
  }
}
