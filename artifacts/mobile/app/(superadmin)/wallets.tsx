import { StyleSheet, Text, View } from 'react-native';

export default function AllWallets() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>All Wallets</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16 },
});
