import { Stack } from 'expo-router';
import { colors } from '@/ui';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerBackTitle: 'Back',
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Prescriptions', headerLargeTitle: true }}
      />
      <Stack.Screen name="prescription/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="prescription/new" options={{ title: 'New visit' }} />
    </Stack>
  );
}