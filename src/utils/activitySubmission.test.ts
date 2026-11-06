import assert from 'node:assert/strict';
import test from 'node:test';
import { canSubmitActivity } from './activitySubmission.ts';

const validSubmission = {
  selectedLeadId: 'lead-1',
  availableLeadIds: ['lead-1'],
  notes: 'Catatan kunjungan',
  isSubmitting: false,
  isSummarizing: false,
  isCompressingPhoto: false,
};

test('Activity can be saved only after photo compression has completed', () => {
  assert.equal(canSubmitActivity(validSubmission), true);
  assert.equal(canSubmitActivity({ ...validSubmission, isCompressingPhoto: true }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, isSubmitting: true }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, isSummarizing: true }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, notes: '   ' }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, selectedLeadId: '' }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, availableLeadIds: [] }), false);
  assert.equal(canSubmitActivity({ ...validSubmission, availableLeadIds: ['lead-2'] }), false);
});
