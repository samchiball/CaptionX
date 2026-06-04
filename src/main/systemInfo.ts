import { exec } from 'node:child_process'
import * as os from 'node:os'
import { promisify } from 'node:util'
import type { GpuMemoryInfo, HardwareInfo } from '@shared/types'

const execAsync = promisify(exec)

let cachedGpu: GpuMemoryInfo | undefined
let isGpuCached = false

export async function getHardwareInfo(): Promise<HardwareInfo> {
  const ramTotal = Math.round(os.totalmem() / (1024 * 1024))
  const ramFree = Math.round(os.freemem() / (1024 * 1024))

  if (!isGpuCached) {
    isGpuCached = true
    try {
      // 1. Try nvidia-smi (cross-platform for NVIDIA GPUs)
      const { stdout } = await execAsync(
        'nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits'
      )
      const parts = stdout.trim().split('\n')[0].split(', ')
      if (parts.length >= 3) {
        cachedGpu = {
          name: parts[0],
          total: parseInt(parts[1], 10),
          free: parseInt(parts[2], 10)
        }
      }
    } catch {
      // Fallbacks per platform
      if (process.platform === 'win32') {
        try {
          const { stdout } = await execAsync(
            'powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json"'
          )
          interface Win32Controller {
            Name?: string
            AdapterRAM?: number
          }
          const data = JSON.parse(stdout)
          const controllers = (Array.isArray(data) ? data : [data]) as Win32Controller[]
          const active = controllers.find(
            (c) => c && typeof c.AdapterRAM === 'number' && c.AdapterRAM > 0
          )
          if (active?.AdapterRAM && active.Name) {
            // Win32_VideoController.AdapterRAM은 uint32라 4GiB(=4096MiB)에서 캡된다.
            // 4GB 초과 GPU는 실제보다 작게 보고되므로, 캡에 근접한 값은 신뢰할 수 없는
            // 추정치로 보고 total은 비워 둔다(이름만 노출, 리소스 추정은 RAM 기반 폴백).
            const totalMb = Math.round(active.AdapterRAM / (1024 * 1024))
            const UINT32_CAP_MB = 4095
            const capped = totalMb >= UINT32_CAP_MB
            cachedGpu = {
              name: active.Name,
              total: capped ? 0 : totalMb,
              free: capped ? 0 : Math.round(totalMb * 0.7) // estimate
            }
          }
        } catch {
          // ignore
        }
      } else if (process.platform === 'darwin') {
        try {
          // On macOS (Apple Silicon/AMD/Intel), we can query system_profiler
          const { stdout } = await execAsync('system_profiler SPDisplaysDataType')
          const lines = stdout.split('\n')
          let chipName = 'Apple Silicon'
          let vramMb = 0
          for (const line of lines) {
            if (line.includes('Chipset Model:')) {
              chipName = line.split('Chipset Model:')[1].trim()
            }
            if (line.includes('VRAM (Total):') || line.includes('VRAM (Dynamic, Max):')) {
              const rawVram = line.split(':')[1].trim()
              if (rawVram.toLowerCase().includes('gb')) {
                vramMb = parseInt(rawVram, 10) * 1024
              } else if (rawVram.toLowerCase().includes('mb')) {
                vramMb = parseInt(rawVram, 10)
              }
            }
          }

          if (chipName.startsWith('Apple') || vramMb === 0) {
            vramMb = Math.round(ramTotal * 0.5) // default M-series unified memory estimate
          }

          cachedGpu = {
            name: chipName,
            total: vramMb,
            free: Math.round(vramMb * 0.8)
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return {
    ram: { total: ramTotal, free: ramFree },
    gpu: cachedGpu
  }
}
