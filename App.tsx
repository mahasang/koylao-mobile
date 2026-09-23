import React from 'react';
import { StatusBar, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { I18nProvider, useI18n } from './src/data/i18n';
import { AuthProvider } from './src/data/auth';
import HomeScreen    from './src/screens/HomeScreen';
import CheckScreen   from './src/screens/CheckScreen';
import LuckyScreen   from './src/screens/LuckyScreen';
import StatsScreen   from './src/screens/StatsScreen';
import RiskScreen        from './src/screens/RiskScreen';
import RiskBuyScreen     from './src/screens/RiskBuyScreen';
import RiskResultsScreen from './src/screens/RiskResultsScreen';
import RiskHistoryScreen from './src/screens/RiskHistoryScreen';
import AppHeader from './src/components/AppHeader';
import { C } from './src/theme';

const Tab = createBottomTabNavigator();
const RiskStackNav = createNativeStackNavigator();

function RiskStack() {
  const { t } = useI18n();
  return (
    <RiskStackNav.Navigator>
      <RiskStackNav.Screen name="RiskHome" component={RiskScreen} options={{ headerShown: false }} />
      <RiskStackNav.Screen name="RiskBuy" component={RiskBuyScreen} options={{ title: t('goBuyBtn') as string }} />
      <RiskStackNav.Screen name="RiskResults" component={RiskResultsScreen} options={{ title: t('resultsHistoryTitle') as string }} />
      <RiskStackNav.Screen name="RiskHistory" component={RiskHistoryScreen} options={{ title: t('purchaseHistory') as string }} />
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

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
          <NavigationContainer>
            <Tabs />
          </NavigationContainer>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
