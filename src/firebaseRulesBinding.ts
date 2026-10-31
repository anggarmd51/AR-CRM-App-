export const FIREBASE_RULES_OWNER_UID = 'MlJVDEJvxrhdlwX87OGED0VfD6t1';
export const FIREBASE_RULES_WORKSPACE_ID = 'ar-crm-owner';
export const FIREBASE_STAGING_WORKSPACE_ID = 'ar-crm-staging-owner';

export function firebaseOwnerBindingMatchesRules(ownerUid: string, workspaceId: string): boolean {
  return ownerUid === FIREBASE_RULES_OWNER_UID && workspaceId === FIREBASE_RULES_WORKSPACE_ID;
}

export function firebaseStagingOwnerBindingMatchesRules(ownerUid: string, workspaceId: string): boolean {
  return ownerUid.length > 0
    && ownerUid !== FIREBASE_RULES_OWNER_UID
    && workspaceId === FIREBASE_STAGING_WORKSPACE_ID;
}
