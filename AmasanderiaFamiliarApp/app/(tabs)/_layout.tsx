import { Tabs } from 'expo-router';
import React from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          height: 70 + insets.bottom, // Respeta los botones del sistema Android/iOS
          paddingBottom: 10 + insets.bottom,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 14, // Larger text for tabs
          fontWeight: 'bold',
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <MaterialIcons size={32} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="productos"
        options={{
          title: 'Productos',
          tabBarIcon: ({ color }) => <MaterialIcons size={32} name="local-dining" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ventas"
        options={{
          title: 'Vender',
          tabBarIcon: ({ color }) => <MaterialIcons size={32} name="point-of-sale" color={color} />,
        }}
      />
      <Tabs.Screen
        name="encargos"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color }) => <MaterialIcons size={32} name="event-note" color={color} />,
        }}
      />
      <Tabs.Screen
        name="recetas"
        options={{
          title: 'Recetas',
          tabBarIcon: ({ color }) => <MaterialIcons size={32} name="menu-book" color={color} />,
        }}
      />
    </Tabs>
  );
}
