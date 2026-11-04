import type { ScanCapabilities } from "../../shared/scan";
import type { CaptureBuffer } from "./capture-buffer";
import type { ScanWork } from "./work";

export const TRIAL_ENDED_MESSAGE =
  "Your 10-minute trial has ended. Your saved finds and preview are still available.";

export function trialCountdown(
  access: ScanCapabilities["trialAccess"],
  receivedAt: number,
  now: number,
): number | null {
  if (!access) return null;
  if (access.startedAt === null || access.expiresAt === null)
    return access.remainingSeconds;
  const serverNow = access.serverNow + Math.max(0, now - receivedAt);
  return Math.max(0, Math.ceil((access.expiresAt - serverNow) / 1000));
}

export function finishTrialInput(buffer: CaptureBuffer, work: ScanWork) {
  buffer.clear();
  work.finishInput();
}
