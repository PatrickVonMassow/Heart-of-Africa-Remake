/** Re-run the intercepted command in the caller's configured shell without
 * turning it into a login session. Profiles must not alter the harness-provided
 * environment or print text that is then charged to the command's budget. */
export function shellInvocation(
  command,
  { platform = process.platform, shell = process.env.SHELL || '/bin/bash' } = {},
) {
  if (platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] }
  }
  return { file: shell, args: ['-c', command] }
}
