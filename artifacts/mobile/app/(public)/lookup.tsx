import { StyleSheet, Text, View } from 'react-native';

export default function VehicleLookup() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Vehicle Lookup</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16 },
});
