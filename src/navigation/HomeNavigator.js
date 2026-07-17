import React from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import BottomTabNavigator from './BottomTabNavigator';
import Login from '../screens/Auth/Login';
import PropertyDetails from '../screens/PropertyDetails';

const Stack = createNativeStackNavigator();

const HomeNavigator = () => (
  <Stack.Navigator initialRouteName="LoginScreen" headerMode="float">
    <Stack.Screen
      name="LoginScreen"
      component={Login}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="HomeScreen"
      component={BottomTabNavigator}
      options={{headerShown: false}}
    />
    <Stack.Screen
      name="PropertyDetailsScreen"
      component={PropertyDetails}
      options={{headerShown: false}}
    />
  </Stack.Navigator>
);

export default HomeNavigator;
