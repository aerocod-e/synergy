import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "@/constants/theme";

export default function TripAdminHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Trip Admin Home</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  text: {
    color: theme.colors.primary,
    fontSize: 18,
    fontWeight: "600",
  },
});
