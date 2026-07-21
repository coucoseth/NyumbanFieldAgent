import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import colors from '../config/colors';
import Directory from '../screens/Directory';
import Inspection from '../screens/Inspection';
import Reconciliation from '../screens/Reconciliation';
import SyncCenter from '../screens/SyncCenter';

export type BottomTabParamList = {
  Directory: undefined;
  Inspection: undefined;
  Reconciliation: undefined;
  SyncCenter: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

const BottomTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Directory"
      backBehavior="history"
      screenOptions={({ route }) => ({
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.lightGreen,
        tabBarInactiveTintColor: colors.darkGray,
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          const iconSize = focused ? size + 11 : size + 5;
          let iconName = 'home-city-outline';
          if (route.name === 'Inspection') {
            iconName = focused ? 'clipboard-check' : 'clipboard-check-outline';
          } else if (route.name === 'Directory') {
            iconName = focused ? 'home-city' : 'home-city-outline';
          } else if (route.name === 'Reconciliation') {
            iconName = focused ? 'database-check' : 'database-check-outline';
          } else if (route.name === 'SyncCenter') {
            iconName = focused ? 'cloud-sync' : 'cloud-sync-outline';
          }
          return <Icon name={iconName} size={iconSize} color={color} />;
        },
      })}>
      <Tab.Screen name="Directory" component={Directory} />
      <Tab.Screen name="Inspection" component={Inspection} />
      <Tab.Screen name="Reconciliation" component={Reconciliation} />
      <Tab.Screen name="SyncCenter" component={SyncCenter} />
    </Tab.Navigator>
  );
};

export default BottomTabNavigator;
