export function shouldUseFirebaseEmulators(isDevelopment: boolean): boolean {
  // Development must never opt out to a live Firebase project. Production builds
  // intentionally use their configured Firebase project instead.
  return isDevelopment;
}
