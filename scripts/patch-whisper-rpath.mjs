// Fixes the Linux whisper native addon's RUNPATH.
//
// The prebuilt `whisper.node` shipped by @kutalia/whisper-node-addon hard-codes
// its DT_RUNPATH to the upstream CI build directory
// (/home/runner/work/.../build/Release) and omits `$ORIGIN`. On Linux the
// dynamic loader therefore never looks next to whisper.node for its companion
// `libwhisper.so.1` / `libggml*.so`, so loading the addon fails at runtime with
// "libwhisper.so.1: cannot open shared object file". (Windows works because the
// OS searches the module's own directory by default.)
//
// We rewrite the RUNPATH string in place to `$ORIGIN`. `$ORIGIN` is shorter than
// the original path, and the string is NUL-terminated at a fixed offset in
// .dynstr, so overwriting it (padded with NULs) keeps the dynamic table valid
// without needing patchelf. Idempotent: a no-op once already patched.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'node_modules/@kutalia/whisper-node-addon/dist/linux-x64/whisper.node')

const OLD_RUNPATH =
  '/home/runner/work/whisper-node-addon/whisper-node-addon/deps/whisper.cpp/build/Release'
const NEW_RUNPATH = '$ORIGIN'

let buf
try {
  buf = readFileSync(target)
} catch {
  // Linux prebuild not present (e.g. installed on another platform) — nothing to do.
  console.log('[patch-whisper-rpath] linux-x64 whisper.node not found, skipping')
  process.exit(0)
}

const needle = Buffer.from(`${OLD_RUNPATH}\0`, 'latin1')
const idx = buf.indexOf(needle)
if (idx < 0) {
  if (buf.includes(Buffer.from(`${NEW_RUNPATH}\0`, 'latin1'))) {
    console.log('[patch-whisper-rpath] already patched ($ORIGIN), skipping')
  } else {
    console.log('[patch-whisper-rpath] RUNPATH string not found, skipping')
  }
  process.exit(0)
}

const replacement = Buffer.alloc(needle.length, 0)
Buffer.from(`${NEW_RUNPATH}\0`, 'latin1').copy(replacement, 0)
replacement.copy(buf, idx)
writeFileSync(target, buf)
console.log(`[patch-whisper-rpath] RUNPATH -> $ORIGIN (offset ${idx})`)
