import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/tab-bar';

// Tab order is fixed by the spec: 記録 | ノート | タイマー(center) | 復習 | マイページ
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="records" options={{ title: '記録' }} />
      <Tabs.Screen name="notes" options={{ title: 'ノート' }} />
      <Tabs.Screen name="timer" options={{ title: 'タイマー' }} />
      <Tabs.Screen name="review" options={{ title: '復習' }} />
      <Tabs.Screen name="mypage" options={{ title: 'マイページ' }} />
    </Tabs>
  );
}
