import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../auth/AuthContext';
import { useChat } from '../chat/ChatContext';
import { LoadingScreen } from '../screens/LoadingScreen';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { RegisterScreen } from '../screens/Auth/RegisterScreen';
import { ForgotPasswordScreen } from '../screens/Auth/ForgotPasswordScreen';
import { FeedScreen } from '../screens/Feed/FeedScreen';
import { PostDetailScreen } from '../screens/Feed/PostDetailScreen';
import { CentersScreen } from '../screens/Centers/CentersScreen';
import { CenterDetailScreen } from '../screens/Centers/CenterDetailScreen';
import { ChatsScreen } from '../screens/Chat/ChatsScreen';
import { ChatThreadScreen } from '../screens/Chat/ChatThreadScreen';
import { ProfileScreen } from '../screens/Profile/ProfileScreen';
import { ChangePasswordScreen } from '../screens/Profile/ChangePasswordScreen';
import { UserProfileScreen } from '../screens/Profile/UserProfileScreen';
import { AdminDashboardScreen } from '../screens/Admin/AdminDashboardScreen';
import { AdminPendingCentersScreen } from '../screens/Admin/AdminPendingCentersScreen';
import { AdminUsersScreen } from '../screens/Admin/AdminUsersScreen';
import { AdminPostsScreen } from '../screens/Admin/AdminPostsScreen';
import { AdminCommentsScreen } from '../screens/Admin/AdminCommentsScreen';
import { AdminLogsScreen } from '../screens/Admin/AdminLogsScreen';
import { AdminReportsScreen } from '../screens/Admin/AdminReportsScreen';
import { AdminReportsManagementScreen } from '../screens/Admin/AdminReportsManagementScreen';
import { ReportScreen } from '../screens/Moderation/ReportScreen';
import { CenterPostEditorScreen } from '../screens/Posts/CenterPostEditorScreen';
import { MyPostsScreen } from '../screens/Posts/MyPostsScreen';
import { ItemsScreen } from '../screens/Donations/ItemsScreen';
import { AvailableItemsScreen } from '../screens/Donations/AvailableItemsScreen';
import { DonationRequestsScreen } from '../screens/Donations/DonationRequestsScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: 'Criar conta' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: true, title: 'Recuperar senha' }} />
    </Stack.Navigator>
  );
}

function FeedStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="FeedHome" component={FeedScreen} options={{ title: 'Feed' }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: 'Publicação' }} />
      <Stack.Screen name="PostEditor" component={CenterPostEditorScreen} options={{ title: 'Publicação' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="AvailableItems" component={AvailableItemsScreen} options={{ title: 'Itens Disponíveis' }} />
      <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Denunciar' }} />
    </Stack.Navigator>
  );
}

function CentersStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="CentersHome" component={CentersScreen} options={{ title: 'Centros' }} />
      <Stack.Screen name="CenterDetail" component={CenterDetailScreen} options={{ title: 'Centro' }} />
    </Stack.Navigator>
  );
}

function ChatStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ChatsHome" component={ChatsScreen} options={{ title: 'Mensagens' }} />
      <Stack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: 'Chat' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Perfil' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} options={{ title: 'Mudar senha' }} />
      <Stack.Screen name="MyPosts" component={MyPostsScreen} options={{ title: 'Minhas publicações' }} />
      <Stack.Screen name="PostEditor" component={CenterPostEditorScreen} options={{ title: 'Publicação' }} />
      <Stack.Screen name="AdminPendingCenters" component={AdminPendingCentersScreen} options={{ title: 'Aprovar centros' }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: 'Perfil' }} />
      <Stack.Screen name="Items" component={ItemsScreen} options={{ title: 'Gerenciar Itens' }} />
      <Stack.Screen name="AvailableItems" component={AvailableItemsScreen} options={{ title: 'Itens Disponíveis' }} />
      <Stack.Screen name="DonationRequests" component={DonationRequestsScreen} options={{ title: 'Pedidos de Doação' }} />
      <Stack.Screen name="Report" component={ReportScreen} options={{ title: 'Denunciar' }} />
    </Stack.Navigator>
  );
}

function AdminStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Dashboard Admin' }} />
      <Stack.Screen name="AdminPendingCenters" component={AdminPendingCentersScreen} options={{ title: 'Centros pendentes' }} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: 'Usuários' }} />
      <Stack.Screen name="AdminPosts" component={AdminPostsScreen} options={{ title: 'Publicações' }} />
      <Stack.Screen name="AdminComments" component={AdminCommentsScreen} options={{ title: 'Comentários' }} />
      <Stack.Screen name="AdminLogs" component={AdminLogsScreen} options={{ title: 'Logs de moderação' }} />
      <Stack.Screen name="AdminReports" component={AdminReportsScreen} options={{ title: 'Relatórios' }} />
      <Stack.Screen name="AdminReportsManagement" component={AdminReportsManagementScreen} options={{ title: 'Denúncias' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const { user } = useAuth();
  const { unreadByThread } = useChat();
  const unreadTotal = Object.values(unreadByThread).reduce((a, b) => a + b, 0);
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, string> = {
            Feed: 'newspaper-outline',
            Centros: 'business-outline',
            Chat: 'chatbubbles-outline',
            Perfil: 'person-circle-outline',
            Admin: 'shield-checkmark-outline'
          };
          const icon = map[route.name] || 'apps-outline';
          return <Ionicons name={icon as any} size={size} color={color} />;
        }
      })}
    >
      <Tabs.Screen name="Feed" component={FeedStack} />
      <Tabs.Screen name="Centros" component={CentersStack} />
      <Tabs.Screen
        name="Chat"
        component={ChatStack}
        options={{
          tabBarBadge: unreadTotal ? unreadTotal : undefined
        }}
      />
      <Tabs.Screen name="Perfil" component={ProfileStack} />
      {user?.role === 'admin' ? (
        <Tabs.Screen name="Admin" component={AdminStack} />
      ) : null}
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const { isLoading, token } = useAuth();
  if (isLoading) return <LoadingScreen />;
  return token ? <MainTabs /> : <AuthStack />;
}

