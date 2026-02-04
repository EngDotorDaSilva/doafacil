import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/auth/AuthContext';
import { ChatProvider } from './src/chat/ChatContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { flushPendingNavigation, navigationRef, queueNavigationFromNotification } from './src/navigation/navigationRef';
import { colors } from './src/ui/theme';
import * as Notifications from 'expo-notifications';
import React from 'react';

// SDK 53+: Expo Go no longer supports *remote* push notifications.
// We use local notifications; ignore the Expo Go remote-push warning noise.
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go'
]);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.primary
  }
};

export default function App() {
  React.useEffect(() => {
    let isMounted = true;

    // If the app was opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        const data = resp?.notification?.request?.content?.data;
        if (isMounted && data) queueNavigationFromNotification(data);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp?.notification?.request?.content?.data;
      if (data) queueNavigationFromNotification(data);
    });

    return () => {
      isMounted = false;
      sub.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ChatProvider>
          <NavigationContainer
            theme={navTheme}
            ref={navigationRef}
            onReady={() => flushPendingNavigation()}
          >
            <AppNavigator />
          </NavigationContainer>
        </ChatProvider>
      <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
