import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import Login from '../screens/Auth/Login';
import PropertyDetail from '../screens/PropertyDetail';
import Inspection from '../screens/Inspection';

export type RootStackParamList = {
  LoginScreen: undefined;
  HomeScreen: undefined;
  PropertyDetailsScreen: { propertyId: string } | undefined;
  Inspection: { draftId: string } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const HomeNavigator: React.FC = () => (
  <Stack.Navigator initialRouteName="LoginScreen">
    <Stack.Screen
      name="LoginScreen"
      component={Login}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="HomeScreen"
      component={BottomTabNavigator}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="PropertyDetailsScreen"
      component={PropertyDetail}
      options={{ headerShown: false }}
    />
    <Stack.Screen
      name="Inspection"
      component={Inspection}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

export default HomeNavigator;
