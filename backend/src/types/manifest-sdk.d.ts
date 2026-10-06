// Type shim so the backend compiles before `@cks-systems/manifest-sdk` is
// installed (the SDK is loaded lazily at runtime — see src/solana/manifest.ts).
declare module '@cks-systems/manifest-sdk';
