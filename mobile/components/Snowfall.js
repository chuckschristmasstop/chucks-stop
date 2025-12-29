import React, { useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withDelay,
    Easing,
    cancelAnimation
} from 'react-native-reanimated';

const NUM_SNOWFLAKES = 50;
const { height, width } = Dimensions.get('window');

const Snowflake = ({ index }) => {
    // Randomize initial properties
    const startX = Math.random() * width;
    const startY = -10 - (Math.random() * 100); // Start above screen
    const size = Math.random() * 4 + 2; // 2-6px
    const duration = Math.random() * 5000 + 3000; // 3-8s
    const delay = Math.random() * 2000;

    const translateY = useSharedValue(startY);
    const translateX = useSharedValue(startX);
    const opacity = useSharedValue(0.8);

    useEffect(() => {
        // Fall animation
        translateY.value = withDelay(
            delay,
            withRepeat(
                withTiming(height + 50, {
                    duration: duration,
                    easing: Easing.linear
                }),
                -1 // Infinite
            )
        );

        // Sway animation (simple sine-like movement via random destination)
        translateX.value = withDelay(
            delay,
            withRepeat(
                withTiming(startX + (Math.random() * 100 - 50), {
                    duration: duration / 2,
                    easing: Easing.sin,
                }),
                -1,
                true // Auto reverse
            )
        );

        return () => {
            cancelAnimation(translateY);
            cancelAnimation(translateX);
        };
    }, []);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateY: translateY.value },
                { translateX: translateX.value }
            ],
            opacity: opacity.value,
        };
    });

    return (
        <Animated.View
            style={[
                styles.flake,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    left: 0, // Positioned via transform
                    top: 0,
                },
                animatedStyle
            ]}
        />
    );
};

export default function Snowfall() {
    return (
        <View style={styles.container} pointerEvents="none">
            {[...Array(NUM_SNOWFLAKES)].map((_, i) => (
                <Snowflake key={i} index={i} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999, // On top of everything
    },
    flake: {
        position: 'absolute',
        backgroundColor: 'white',
    },
});
