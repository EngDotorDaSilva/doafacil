import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from '../api/client';

function getProjectId(): string | null {
  // Prefer env override for dev.
  const env = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (env) return env;
  const anyConstants = Constants as any;
  return (
    anyConstants.easConfig?.projectId ||
    anyConstants.expoConfig?.extra?.eas?.projectId ||
    null
  );
}

export async function registerPushTokenIfPossible() {
  // Remote push is not supported in Expo Go (SDK 53+). Only attempt in dev/standalone builds.
  if ((Constants as any).appOwnership === 'expo') return;
  if (!Device.isDevice) return;

  const perms = await Notifications.getPermissionsAsync();
  const granted = perms.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const projectId = getProjectId();
  if (!projectId) return;

  const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResp.data;

  await api.post('/me/push-token', {
    token,
    platform: Device.osName || undefined
  });
}

