// Development uses the same readiness gate, with Vite middleware for hot reload.
process.argv.push('--dev');
await import('./start.mjs');
