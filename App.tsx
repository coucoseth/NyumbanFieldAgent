import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import HomeNavigator from './src/navigation/HomeNavigator';
import {navigationRef} from './src/navigation/RootNavigation';

const App = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <HomeNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
