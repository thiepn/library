import {
  getReadingActivity,
  recordReadingActivity,
  type ReadingActivityFormat,
  type ReadingActivitySource,
} from '../client/library-db';
import {
  getReadingContinuity,
  subscribeUnifiedReadingState,
  type ReadingContinuityRequest,
} from '../reader-entry/client';
import {
  deriveReadingLibraryState,
  isExactReadingActivity,
  type ReadingLibraryState,
} from './model';

export interface ReadingOpenInput {
  workId: string;
  edition: number;
  releaseVersion: string;
  format: ReadingActivityFormat;
  source: ReadingActivitySource;
}

export async function recordReadingOpen(input: ReadingOpenInput): Promise<void> {
  await recordReadingActivity({
    workId: input.workId,
    edition: input.edition,
    releaseVersion: input.releaseVersion,
    format: input.format,
    source: input.source,
  });
}

export async function getReadingLibraryState(
  request: ReadingContinuityRequest,
): Promise<ReadingLibraryState> {
  const [continuity, activity] = await Promise.all([
    getReadingContinuity(request),
    getReadingActivity(request.workId).catch(() => undefined),
  ]);
  const exactActivity = isExactReadingActivity(activity, request) ? activity : undefined;
  return deriveReadingLibraryState(continuity, exactActivity);
}

export function subscribeReadingLibraryState(listener: () => void): () => void {
  return subscribeUnifiedReadingState(listener);
}
