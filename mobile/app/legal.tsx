import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyText, IconButton, Kicker, Panel, ScreenFade, ScreenHeader } from '@/components/ui';
import { colors, spacing, type } from '@/constants/tokens';

const filingNo = process.env.EXPO_PUBLIC_APP_FILING_NO?.trim() ?? '';
const icpNo = process.env.EXPO_PUBLIC_ICP_NUMBER?.trim() ?? '';

export default function LegalScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="LEGAL / AI"
          title="法律与 AI 说明"
          left={<IconButton icon="arrow-left" label="返回账户" onPress={() => router.back()} />}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <Panel style={styles.card}>
            <Kicker>隐私</Kicker>
            <Text style={styles.title}>你的项目与生成资产</Text>
            <BodyText>
              账号、项目、快照和创作上下文保存在服务端项目空间。本地参考图默认只留在当前设备；
              生成资产可单独下载。账号注销会删除项目、生成图片、推送 Token、交易记录和分析事件。
            </BodyText>
          </Panel>

          <Panel style={styles.card}>
            <Kicker>AI 生成</Kicker>
            <Text style={styles.title}>生成内容有明确标识</Text>
            <BodyText>
              关键帧、定妆图和场景图使用“AI 生成”标识，并在资产响应中携带 AI 来源信息。
              发布到其他平台时，仍需遵守目标平台的 AI 内容标识规则。
            </BodyText>
          </Panel>

          <Panel style={styles.card}>
            <Kicker>内容规则</Kicker>
            <Text style={styles.title}>不得制作违法或侵权内容</Text>
            <BodyText>
              禁止违法、仇恨、骚扰、诈骗、未经同意的他人肖像或隐私内容，也禁止提交无权使用的剧本和图片。
              发现异常内容可通过举报入口提交，服务端会记录为待处理事项。
            </BodyText>
          </Panel>

          <Panel style={styles.card}>
            <Kicker>运营信息</Kicker>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>App 备案号</Text>
              <Text style={styles.factValue}>{filingNo || '测试构建，正式发布前配置'}</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factLabel}>ICP备案号</Text>
              <Text style={styles.factValue}>{icpNo || '测试构建，正式发布前配置'}</Text>
            </View>
            <BodyText dim>
              当前页面是产品事实说明，不替代正式法律审定文本。
            </BodyText>
          </Panel>
        </ScrollView>
      </ScreenFade>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: { padding: spacing.md, gap: spacing.xs },
  title: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  factRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  factLabel: { color: colors.textMuted, fontSize: type.caption },
  factValue: { flex: 1, color: colors.textSecondary, fontSize: type.caption, textAlign: 'right' },
});
