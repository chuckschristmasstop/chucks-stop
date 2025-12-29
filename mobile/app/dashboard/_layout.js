import { Tabs } from 'expo-router';
import { Gift, Home, PartyPopper, Trophy } from 'lucide-react-native';

export default function DashboardLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#D42426', // Christmas Red
                tabBarInactiveTintColor: '#aaa',
                tabBarStyle: {
                    backgroundColor: '#fff',
                    borderTopWidth: 1,
                    borderTopColor: '#eee',
                },
                sceneStyle: { backgroundColor: 'transparent' }
            }}
        >
            <Tabs.Screen
                name="home"
                options={{
                    title: 'Home',
                    tabBarIcon: ({ color }) => <Home size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Contests',
                    tabBarIcon: ({ color }) => <Trophy size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="white-elephant"
                options={{
                    title: 'White Elephant',
                    tabBarIcon: ({ color }) => <Gift size={24} color={color} />,
                }}
            />
            <Tabs.Screen
                name="trivia"
                options={{
                    title: 'Trivia',
                    tabBarIcon: ({ color }) => <PartyPopper size={24} color={color} />,
                }}
            />
        </Tabs>
    );
}

