export const APP_MODAL_NAMES = [
  'quickLead',
  'activityLogger',
  'leadDetail',
  'whatsapp',
  'securitySettings',
] as const;

export type AppModalName = typeof APP_MODAL_NAMES[number];

export interface AppHistoryState<Tab extends string = string> {
  __arCrmHistory: true;
  tab: Tab;
  modalStack: AppModalName[];
}

const modalNameSet: ReadonlySet<string> = new Set(APP_MODAL_NAMES);

export function createAppHistoryState<Tab extends string>(
  tab: Tab,
  modalStack: readonly AppModalName[] = [],
): AppHistoryState<Tab> {
  return { __arCrmHistory: true, tab, modalStack: [...modalStack] };
}

/** Read current and legacy app entries without accepting unrelated history state. */
export function readAppHistoryState<Tab extends string>(
  value: unknown,
  validTabs: readonly Tab[],
): AppHistoryState<Tab> | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (typeof state.tab !== 'string' || !validTabs.includes(state.tab as Tab)) return null;

  const isCurrentState = state.__arCrmHistory === true;
  const isLegacyState = !isCurrentState && (state.root === true || 'tab' in state || state.modal === true);
  if (!isCurrentState && !isLegacyState) return null;

  let modalStack: AppModalName[] = [];
  if (Array.isArray(state.modalStack)) {
    if (!state.modalStack.every((name): name is AppModalName => typeof name === 'string' && modalNameSet.has(name))) {
      return null;
    }
    modalStack = [...state.modalStack];
  } else if (state.modalStack !== undefined) {
    return null;
  } else if (state.modal === true && typeof state.modalName === 'string' && modalNameSet.has(state.modalName)) {
    modalStack = [state.modalName as AppModalName];
  }

  return createAppHistoryState(state.tab as Tab, modalStack);
}

/** Returns removed modal names in top-first (LIFO) order. */
export function getClosedModalNames(
  previous: AppHistoryState,
  next: AppHistoryState,
): AppModalName[] {
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < previous.modalStack.length
    && commonPrefixLength < next.modalStack.length
    && previous.modalStack[commonPrefixLength] === next.modalStack[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  return previous.modalStack.slice(commonPrefixLength).reverse();
}
