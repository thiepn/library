/**
 * Pure lifecycle state comparator. Original Account authentication is read
 * separately; no session tokens, data or backup bytes cross this boundary.
 */
export function isOriginalLibraryLifecycleCurrent(input: {
  startedEpoch: number;
  currentEpoch: number;
  startedOwner: string;
  authenticatedOwner: string | null;
  startedDevice: string;
  currentDevice: string | null;
  enabled: boolean;
}): boolean {
  return input.startedEpoch === input.currentEpoch &&
    input.startedOwner === input.authenticatedOwner &&
    input.startedDevice === input.currentDevice && input.enabled;
}
