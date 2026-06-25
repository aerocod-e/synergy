import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, ViewProps } from 'react-native';

interface Props extends ViewProps {
  children: React.ReactNode;
  sheet?: boolean;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function ScreenTransition({ children, style, sheet = false, ...props }: Props) {
  const opacity = useRef(new Animated.Value(sheet ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(sheet ? SCREEN_HEIGHT : 12)).current;

  useEffect(() => {
    if (sheet) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 68,
        friction: 11,
      }).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, []);

  return (
    <Animated.View
      style={[styles.container, { opacity, transform: [{ translateY }] }, style]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
