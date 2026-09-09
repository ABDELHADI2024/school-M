import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';
import LoginScreen from '../screens/LoginScreen';
import TeacherHomeScreen from '../screens/TeacherHomeScreen';
import ParentHomeScreen from '../screens/ParentHomeScreen';

export type RootStackParamList = {
  Login: undefined;
  TeacherHome: { profile: { role: string; school_id: string } };
  ParentHome: { profile: { role: string; school_id: string; user_id: string } };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  const [profile, setProfile] = useState<{ role: string; school_id: string; user_id: string } | null>(null);

  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('user_profiles')
          .select('role, school_id')
          .eq('user_id', session.user.id)
          .single();

        if (data) {
          const p = { role: data.role, school_id: data.school_id, user_id: session.user.id };
          setProfile(p);
          if (data.role === 'teacher' || data.role === 'staff' || data.role === 'director') {
            setInitialRoute('TeacherHome');
          } else {
            setInitialRoute('ParentHome');
          }
          return;
        }
      }
      setInitialRoute('Login');
    }
    checkSession();
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="TeacherHome"
          component={TeacherHomeScreen}
          initialParams={{ profile: profile || { role: 'teacher', school_id: '' } }}
        />
        <Stack.Screen
          name="ParentHome"
          component={ParentHomeScreen}
          initialParams={{ profile: profile || { role: 'student', school_id: '', user_id: '' } }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
