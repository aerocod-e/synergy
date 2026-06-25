import { Tabs } from 'expo-router';

export default function StakeholderLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{ headerShown: false, animation: 'fade' }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
    </Tabs>
  );
}
