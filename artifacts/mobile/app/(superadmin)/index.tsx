import { StyleSheet, Text, View } from 'react-native';

export default function SuperAdminDashboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Super Admin Dashboard</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16 },
});
