let shouldRefreshFeed = false;

export function requestFeedRefresh() {
  shouldRefreshFeed = true;
}

export function consumeFeedRefresh() {
  const v = shouldRefreshFeed;
  shouldRefreshFeed = false;
  return v;
}

