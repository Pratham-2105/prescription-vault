import { Redirect, Stack } from 'expo-router';
import { useSession } from '@/state/session';

export default function AuthLayout() {
  const { user, isRestoring } = useSession();

  if (isRestoring) return null;
  if (user) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}