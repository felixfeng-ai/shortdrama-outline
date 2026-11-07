export async function register() {
  // Instrumentation also runs for edge compilation; the queue owns SQLite and Node timers.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
