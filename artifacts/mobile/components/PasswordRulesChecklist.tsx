import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { theme } from '@/constants/theme';

interface Rule {
  label: string;
  test: (pw: string) => boolean;
}

const RULES: Rule[] = [
  { label: '6 to 15 characters',             test: (pw) => pw.length >= 6 && pw.length <= 15 },
  { label: 'At least one uppercase letter',   test: (pw) => /[A-Z]/.test(pw) },
  { label: 'At least one number',             test: (pw) => /[0-9]/.test(pw) },
  { label: 'At least one special character',  test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function allRulesPass(password: string): boolean {
  return RULES.every((r) => r.test(password));
}

interface Props {
  password: string;
}

export default function PasswordRulesChecklist({ password }: Props) {
  return (
    <View style={styles.container}>
      {RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <View key={rule.label} style={styles.row}>
            {passed ? (
              <CheckCircle2 size={14} color={theme.colors.green} />
            ) : (
              <Circle size={14} color={theme.colors.grey1} />
            )}
            <Text style={[styles.label, passed && styles.labelPassed]}>
              {rule.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  label: {
    fontSize: 12,
    color: theme.colors.grey1,
  },
  labelPassed: {
    color: theme.colors.green,
  },
});
