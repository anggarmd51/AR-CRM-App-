export function shouldUseFirebaseEmulators(isDevelopment: boolean, setting: string | undefined): boolean {
  return isDevelopment && setting !== 'false';
}
