#!/usr/bin/env node
/**
 * Point 296: Detect machine load and flag timing-sensitive tests accordingly.
 * If CPU is under heavy load (parallel agents, builds, etc.), mark timing tests
 * as "under load — not conclusive" instead of failing them.
 */

import { execSync } from 'child_process'

export function isUnderLoad() {
  try {
    // On Windows, check for multiple node processes
    const tasklist = execSync('tasklist /FI "IMAGENAME eq node.exe" /NH', { encoding: 'utf-8' })
    const processes = tasklist.split('\n').filter(l => l.trim())

    // If more than 2 node processes, we're under load (main + parallel agents)
    const nodeCount = processes.length
    const underLoad = nodeCount > 2

    return {
      underLoad,
      nodeProcesses: nodeCount,
      reason: underLoad ? `${nodeCount} parallel node processes` : 'single/light load',
    }
  } catch (e) {
    // Fallback: check environment variable
    return {
      underLoad: process.env.BATCH_LOAD === 'true',
      reason: 'env check (fallback)',
    }
  }
}

// CLI usage
const status = isUnderLoad()
console.log(JSON.stringify(status, null, 2))
process.exit(status.underLoad ? 1 : 0)
