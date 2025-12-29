import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient'; // Need to install
import Snowfall from './Snowfall';

// We'll use a Linear Gradient as a fallback if no image, or as an overlay.
// Since I haven't added expo-linear-gradient yet, let's use a solid view for now 
// or I can quickly add the dependency. Let's add the dependency in a moment.
// For now, I'll use a View with a festive background color.

export default function SnowyBackground({ children }) {
    return (
        <View style={styles.container}>
            {/* Festive Background Base */}
            <View style={[StyleSheet.absoluteFill, styles.background]} />

            {/* The Main Content */}
            <View style={styles.content}>
                {children}
            </View>

            {/* Snow Overlay (pointerEvents="none" is handled inside Snowfall) */}
            <Snowfall />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    background: {
        backgroundColor: '#1E3F35', // Deep Christmas Green
    },
    content: {
        flex: 1,
        zIndex: 1,
    }
});
