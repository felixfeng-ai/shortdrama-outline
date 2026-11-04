import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyText, IconButton, Kicker, Panel, ScreenFade, ScreenHeader } from '@/components/ui';
import { colors, radii, spacing, type } from '@/constants/tokens';

export default function BillingScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="SUBSCRIPTION"
          title="订阅"
          left={<IconButton icon="arrow-left" label="返回账户" onPress={() => router.back()} />}
        />
        <View style={styles.content}>
          <Panel elevated style={styles.card}>
            <Kicker>原生商店内购</Kicker>
            <Text style={styles.title}>请在 iOS 或 Android 构建中订阅</Text>
            <BodyText dim>
              订阅使用 Apple App Store 或 Google Play 完成。Web 预览不加载平台内购模块，也不会创建交易。
            </BodyText>
            <View style={styles.icon}>
              <Feather name="smartphone" size={20} color={colors.info} />
            </View>
          </Panel>
        </View>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: spacing.md },
  card: { padding: spacing.md, gap: spacing.sm },
  title: { color: colors.text, fontSize: type.title, fontWeight: '600' },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
});
