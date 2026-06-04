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
            const totalMb = Math.round(active.AdapterRAM / (1024 * 1024))
            cachedGpu = {
              name: active.Name,
              total: totalMb,
              free: Math.round(totalMb * 0.7) // estimate
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
