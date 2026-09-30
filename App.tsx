import React from 'react';
import { StatusBar, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { I18nProvider, useI18n } from './src/data/i18n';
import { AuthProvider } from './src/data/auth';
import { NotificationsProvider } from './src/data/notifications';
import HomeScreen    from './src/screens/HomeScreen';
import CheckScreen   from './src/screens/CheckScreen';
import LuckyScreen   from './src/screens/LuckyScreen';
import StatsScreen   from './src/screens/StatsScreen';
import RiskScreen        from './src/screens/RiskScreen';
import RiskBuyScreen     from './src/screens/RiskBuyScreen';
import RiskResultsScreen from './src/screens/RiskResultsScreen';
import RiskHistoryScreen from './src/screens/RiskHistoryScreen';
import WalletScreen      from './src/screens/WalletScreen';
import VerifyTicketScreen from './src/screens/VerifyTicketScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import HelpScreen from './src/screens/HelpScreen';
import AppHeader from './src/components/AppHeader';
import { C } from './src/theme';

const Tab = createBottomTabNavigator();
const RiskStackNav = createNativeStackNavigator();
const RootStackNav = createNativeStackNavigator();

function RiskStack() {
  const { t } = useI18n();
  return (
    <RiskStackNav.Navigator>
      <RiskStackNav.Screen name="RiskHome" component={RiskScreen} options={{ headerShown: false }} />
      <RiskStackNav.Screen name="RiskBuy" component={RiskBuyScreen} options={{ title: t('goBuyBtn') as string }} />
      <RiskStackNav.Screen name="RiskResults" component={RiskResultsScreen} options={{ title: t('resultsHistoryTitle') as string }} />
      <RiskStackNav.Screen name="RiskHistory" component={RiskHistoryScreen} options={{ title: t('purchaseHistory') as string }} />
      <RiskStackNav.Screen name="Wallet" component={WalletScreen} options={{ title: t('walletTitle') as string }} />
      <RiskStackNav.Screen name="VerifyTicket" component={VerifyTicketScreen} options={{ title: t('verifyTitle') as string }} />
    </RiskStackNav.Navigator>
  );
}

const TAB_ICONS: Record<string, string> = {
  Home:  '🏠',
  Check: '🎫',
  Risk:  '⏰',
  Lucky: '🔮',
  Stats: '📊',
};

function TabIcon({ route, focused }: { route: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>
      {TAB_ICONS[route]}
    </Text>
  );
}

function Tabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header:                 () => <AppHeader />,
        tabBarStyle:            { backgroundColor: C.card, borderTopColor: C.border },
        tabBarActiveTintColor:  C.accent,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle:       { fontSize: 11 },
        tabBarIcon:             ({ focused }) => <TabIcon route={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home"  component={HomeScreen}  options={{ title: t('tabHome')  as string }} />
      <Tab.Screen name="Check" component={CheckScreen} options={{ title: t('tabCheck') as string }} />
      <Tab.Screen name="Risk"  component={RiskStack}   options={{ title: t('tabRisk')  as string }} />
      <Tab.Screen name="Lucky" component={LuckyScreen} options={{ title: t('tabLucky') as string }} />
      <Tab.Screen name="Stats" component={StatsScreen} options={{ title: t('tabStats') as string }} />
    </Tab.Navigator>
  );
}

function Root() {
  const { t } = useI18n();
  return (
    <RootStackNav.Navigator>
      <RootStackNav.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <RootStackNav.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notifTitle') as string }} />
      <RootStackNav.Screen name="Help" component={HelpScreen} options={{ title: t('helpTitle') as string }} />
    </RootStackNav.Navigator>
  );
}

export default function App() {
  const navRef = useNavigationContainerRef<any>();

  // Tapping a phone notification opens the screen it is about.
  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(resp => {
      const data = resp.notification.request.content.data as { screen?: string; tab?: string } | undefined;
      if (!navRef.isReady()) return;
      if (data?.tab) navRef.navigate('Tabs', { screen: data.tab });
      else navRef.navigate('Tabs', { screen: 'Risk', params: { screen: data?.screen ?? 'RiskHome' } });
    });
    return () => sub.remove();
  }, [navRef]);

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <NotificationsProvider>
            <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
            <NavigationContainer ref={navRef}>
              <Root />
            </NavigationContainer>
          </NotificationsProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
