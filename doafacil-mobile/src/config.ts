import Constants from 'expo-constants';

function getHostUri() {
  // Works across different Expo versions/dev modes.
  const anyConstants = Constants as any;
  return (
    Constants.expoConfig?.hostUri ||
    anyConstants.expoGoConfig?.debuggerHost ||
    anyConstants.manifest?.debuggerHost ||
    anyConstants.manifest2?.extra?.expoClient?.hostUri ||
    null
  );
}

function getDevServerIp() {
  const hostUri = getHostUri();
  if (!hostUri) return null;
  return String(hostUri).split(':')[0] || null;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || (getDevServerIp() ? `http://${getDevServerIp()}:3000` : 'http://localhost:3000');

