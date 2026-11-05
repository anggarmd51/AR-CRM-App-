import type { SyncQueueOperation } from './offlineWriteQueue.ts';

type DiscardCandidate = Pick<SyncQueueOperation, 'id' | 'label' | 'state'>;
export type QueueDiscardResult = 'cancelled' | 'ineligible' | 'unchanged' | 'discarded';

export async function confirmAndDiscardFailedQueueOperation(
  operation: DiscardCandidate | undefined,
  confirm: (message: string) => boolean,
  discard: (id: string) => Promise<boolean>,
): Promise<QueueDiscardResult> {
  if (!operation || operation.state !== 'failed') return 'ineligible';
  const accepted = confirm(
    `Buang / Hapus item gagal “${operation.label}” dari antrean lokal? Item yang berhasil dibuang tidak akan dicoba ulang dari antrean halaman ini.`,
  );
  if (!accepted) return 'cancelled';
  return await discard(operation.id) ? 'discarded' : 'unchanged';
}
