export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeImageUrls({ imageUrl, imageUrls }) {
  const arr = Array.isArray(imageUrls) ? imageUrls : safeJsonParse(imageUrls, null);
  const cleaned = Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x.length > 0) : [];
  if (imageUrl && !cleaned.includes(imageUrl)) cleaned.unshift(imageUrl);
  return cleaned;
}
