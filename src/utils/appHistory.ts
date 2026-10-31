export const APP_MODAL_NAMES = ['quickLead', 'activityLogger', 'leadDetail', 'whatsapp', 'securitySettings'] as const;
export type AppModalName = typeof APP_MODAL_NAMES[number];
export type AppModalLeadIds = Array<string | null>;
export interface AppHistoryState<Tab extends string = string> {
  __arCrmHistory: true;
  tab: Tab;
  modalStack: AppModalName[];
  /** Parallel to modalStack. IDs only, never CRM records or contact details. */
  modalLeadIds?: AppModalLeadIds;
}
const modalNameSet: ReadonlySet<string> = new Set(APP_MODAL_NAMES);
const validLeadId = (id: unknown): id is string => typeof id === 'string'
  && id.length > 0 && id.length <= 1500 && id !== '.' && id !== '..'
  && !/[\/\u0000-\u001f\u007f]/.test(id);

export function createAppHistoryState<Tab extends string>(
  tab: Tab, modalStack: readonly AppModalName[] = [], modalLeadIds?: readonly (string | null)[],
): AppHistoryState<Tab> {
  const ids = modalStack.map((_, index) => modalLeadIds?.[index] ?? null);
  return { __arCrmHistory: true, tab, modalStack: [...modalStack],
    ...(ids.some((id) => id !== null) ? { modalLeadIds: ids } : {}) };
}

/** Accept current and legacy app entries, not malformed tabs/routes/IDs. */
export function readAppHistoryState<Tab extends string>(value: unknown, validTabs: readonly Tab[]): AppHistoryState<Tab> | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (typeof state.tab !== 'string' || !validTabs.includes(state.tab as Tab)) return null;
  const isCurrentState = state.__arCrmHistory === true;
  const isLegacyState = !isCurrentState && (state.root === true || 'tab' in state || state.modal === true);
  if (!isCurrentState && !isLegacyState) return null;
  let modalStack: AppModalName[] = [];
  if (Array.isArray(state.modalStack)) {
    if (state.modalStack.length > 10 || !state.modalStack.every((name): name is AppModalName => typeof name === 'string' && modalNameSet.has(name))) return null;
    modalStack = [...state.modalStack];
  } else if (state.modalStack !== undefined) return null;
  else if (state.modal === true && typeof state.modalName === 'string' && modalNameSet.has(state.modalName)) modalStack = [state.modalName as AppModalName];
  let ids: AppModalLeadIds | undefined;
  if (state.modalLeadIds !== undefined) {
    const raw = state.modalLeadIds;
    if (!Array.isArray(raw) || raw.length > modalStack.length || !raw.every((id) => id === null || validLeadId(id))) return null;
    ids = modalStack.map((_, index) => raw[index] ?? null);
  }
  return createAppHistoryState(state.tab as Tab, modalStack, ids);
}

export function getModalLeadId(state: AppHistoryState, modalName: AppModalName): string | null {
  const index = state.modalStack.lastIndexOf(modalName);
  const id = index >= 0 ? state.modalLeadIds?.[index] : null;
  return validLeadId(id) ? id : null;
}

/** Drop an unrestorable layer and its children, while always keeping its tab. */
export function canonicalizeModalHistoryState<Tab extends string>(state: AppHistoryState<Tab>, availableLeadIds: ReadonlySet<string>): AppHistoryState<Tab> {
  let length = state.modalStack.length;
  for (let index = 0; index < state.modalStack.length; index += 1) {
    const name = state.modalStack[index];
    const id = state.modalLeadIds?.[index] ?? null;
    const requiresLead = name === 'leadDetail' || name === 'whatsapp';
    if ((requiresLead && (!id || !availableLeadIds.has(id)))
      || (name === 'activityLogger' && id !== null && !availableLeadIds.has(id))) {
      length = index;
      break;
    }
  }
  return createAppHistoryState(state.tab, state.modalStack.slice(0, length), state.modalLeadIds?.slice(0, length));
}

/** Removed layers in top-first order; a changed lead is also a changed layer. */
export function getClosedModalNames(previous: AppHistoryState, next: AppHistoryState): AppModalName[] {
  let common = 0;
  while (common < previous.modalStack.length && common < next.modalStack.length
    && previous.modalStack[common] === next.modalStack[common]
    && (previous.modalLeadIds?.[common] ?? null) === (next.modalLeadIds?.[common] ?? null)) common += 1;
  return previous.modalStack.slice(common).reverse();
}
