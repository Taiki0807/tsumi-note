import '../global.css';

import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import {
  MPLUSRounded1c_500Medium,
  MPLUSRounded1c_700Bold,
  MPLUSRounded1c_800ExtraBold,
} from '@expo-google-fonts/m-plus-rounded-1c';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SplashView } from '@/components/splash-view';
import { DatabaseProvider } from '@/db/database-provider';
import { useTheme } from '@/design';

// Keep the native splash until fonts are loaded, then hand over to <SplashView/> while the DB migrates.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colors = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    MPLUSRounded1c_500Medium,
    MPLUSRounded1c_700Bold,
    MPLUSRounded1c_800ExtraBold,
    Nunito_800ExtraBold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <DatabaseProvider
        fallback={<SplashView />}
        renderError={(error) => (
          <Text style={{ color: colors.danger, padding: 24 }} accessibilityRole="alert">
            データベースの初期化に失敗しました: {error.message}
          </Text>
        )}
      >
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
