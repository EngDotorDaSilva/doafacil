import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

type PendingNav =
  | { type: 'message'; threadId: number }
  | null;

let pendingNav: PendingNav = null;

function tryNavigatePending() {
  if (!pendingNav) return;
  if (!navigationRef.isReady()) return;

  const nav = pendingNav;
  pendingNav = null;

  if (nav.type === 'message') {
    // Tab: Chat -> Stack screen: ChatThread
    navigationRef.navigate('Chat', { screen: 'ChatThread', params: { threadId: nav.threadId } });
  }
}

export function queueNavigationFromNotification(data: any) {
  const type = data?.type ? String(data.type) : null;
  if (type === 'message') {
    const threadId = Number(data?.threadId);
    if (!Number.isFinite(threadId)) return;
    pendingNav = { type: 'message', threadId };
    tryNavigatePending();
  }
}

export function flushPendingNavigation() {
  tryNavigatePending();
}

