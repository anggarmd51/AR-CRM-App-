export interface ActivitySubmissionState {
  selectedLeadId: string;
  notes: string;
  isSubmitting: boolean;
  isSummarizing: boolean;
  isCompressingPhoto: boolean;
}

export function canSubmitActivity(state: ActivitySubmissionState): boolean {
  return Boolean(state.selectedLeadId.trim() && state.notes.trim())
    && !state.isSubmitting
    && !state.isSummarizing
    && !state.isCompressingPhoto;
}
