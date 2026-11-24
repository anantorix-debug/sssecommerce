export type JobStatus = 'PROCESSING' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
export type ItemStatus = 'PENDING' | 'DOWNLOADING' | 'READY' | 'DUPLICATE' | 'FAILED' | 'APPROVED' | 'REJECTED';
export type Job = {
  id: string;
  name: string;
  source: 'CSV' | 'ZIP' | 'MANUAL';
  status: JobStatus;
  licenceSource: string;
  licenceNote: string;
  createdByEmail: string | null;
  createdAt: string;
  finishedAt: string | null;
  counts: Partial<Record<ItemStatus, number>>;
};

export const JOB_TONE: Record<JobStatus, 'accent' | 'warning' | 'success' | 'neutral'> = { PROCESSING: 'accent', REVIEW: 'warning', COMPLETED: 'success', CANCELLED: 'neutral' };
export const JOB_LABEL: Record<JobStatus, string> = { PROCESSING: 'Processing', REVIEW: 'Needs review', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
export const countAll = (c: Job['counts']) => Object.values(c).reduce((s, n) => s + (n ?? 0), 0);
