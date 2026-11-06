export interface ActivitySubmissionState {
  selectedLeadId: string;
  availableLeadIds: readonly string[];
  notes: string;
  isSubmitting: boolean;
  isSummarizing: boolean;
  isCompressingPhoto: boolean;
}

export function canSubmitActivity(state: ActivitySubmissionState): boolean {
  return Boolean(state.selectedLeadId.trim()
    && state.availableLeadIds.includes(state.selectedLeadId)
    && state.notes.trim())
    && !state.isSubmitting
    && !state.isSummarizing
    && !state.isCompressingPhoto;
}
