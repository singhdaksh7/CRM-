// Test-only stub for the "server-only" package. The real package throws
// unconditionally unless a Next.js bundler substitutes it via package.json
// export conditions - under plain vitest/node there's no such substitution,
// so importing it for real would break every test that (transitively)
// imports a server-only module. Aliased in vitest.config.ts. Next's actual
// build still uses the real package, so the client-bundle safety guarantee
// is unaffected - this only relaxes the test runner.
export {};
