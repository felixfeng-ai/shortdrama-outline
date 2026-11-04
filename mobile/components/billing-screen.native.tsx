import { Feather } from '@expo/vector-icons';
import { useIAP, type Purchase, type ProductSubscription } from 'expo-iap';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BodyText,
  IconButton,
  Kicker,
  MonoText,
  Panel,
  PrimaryButton,
  ScreenFade,
  ScreenHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/ui';
import { colors, fonts, radii, spacing, type } from '@/constants/tokens';
import { fetchBillingProducts, submitBillingPurchase, type BillingConfig } from '@/lib/billing-api';
import { useAuth } from '@/lib/auth-store';
import { workspaceApiBaseUrl } from '@/lib/workspace-api';
import { useWorkspace } from '@/lib/workspace-store';

function purchaseToken(purchase: Purchase): string {
  return purchase.purchaseToken?.trim() || '';
}

export default function BillingScreen() {
  const { status, authorizedFetch } = useAuth();
  const { refresh: refreshWorkspace } = useWorkspace();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'buying' | 'verifying' | 'unavailable'>('loading');
  const [message, setMessage] = useState('');
  const submitted = useRef(new Set<string>());
  const [pendingPurchase, setPendingPurchase] = useState<Purchase | null>(null);

  const finishPurchase = useCallback(async (purchase: Purchase) => {
    const token = purchaseToken(purchase);
    if (!token || submitted.current.has(purchase.id)) return;
    submitted.current.add(purchase.id);
    setState('verifying');
    setMessage('');
    try {
      const result = await submitBillingPurchase(workspaceApiBaseUrl, {
        platform: Platform.OS === 'android' ? 'android' : 'ios',
        productId: purchase.productId,
        transactionId: purchase.transactionId?.trim() || purchase.id,
        purchaseToken: token,
      }, authorizedFetch);
      if (result.verified) {
        refreshWorkspace();
        setMessage('购买已核验，额度正在同步。');
      } else if (result.status === 'pending') {
        setMessage('交易已提交，等待服务端核验。核验前不会增加额度。');
      } else {
        setMessage('交易未通过核验，请联系支持。');
        submitted.current.delete(purchase.id);
      }
    } catch (reason) {
      submitted.current.delete(purchase.id);
      setMessage(reason instanceof Error ? reason.message : '交易核验失败');
    } finally {
      setState('ready');
    }
  }, [authorizedFetch, refreshWorkspace]);

  const iap = useIAP({
    onPurchaseSuccess: (purchase) => {
      const token = purchaseToken(purchase);
      if (!token) {
        setMessage('商店没有返回可核验的购买凭据');
        return;
      }
      setPendingPurchase(purchase);
    },
    onPurchaseError: (error) => {
      setMessage(error.message || '购买未完成');
      setState('ready');
    },
    onError: (error) => setMessage(error.message),
  });

  useEffect(() => {
    if (status !== 'authenticated') {
      setState('unavailable');
      return;
    }
    void fetchBillingProducts(workspaceApiBaseUrl, authorizedFetch)
      .then((next) => {
        setConfig(next);
        setState(next.enabled ? 'ready' : 'unavailable');
      })
      .catch((reason: unknown) => {
        setState('unavailable');
        setMessage(reason instanceof Error ? reason.message : '订阅商品读取失败');
      });
  }, [authorizedFetch, status]);

  useEffect(() => {
    if (!iap.connected || !config?.enabled || config.skus.length === 0) return;
    void iap.fetchProducts({ skus: config.skus, type: 'subs' }).catch(() => {});
  }, [config, iap.connected]);

  useEffect(() => {
    if (pendingPurchase) void finishPurchase(pendingPurchase);
  }, [finishPurchase, pendingPurchase]);

  async function buy(product: ProductSubscription) {
    if (state === 'buying' || state === 'verifying') return;
    setState('buying');
    setMessage('');
    try {
      await iap.requestPurchase({
        type: 'subs',
        request: {
          apple: { sku: product.id },
          google: {
            skus: [product.id],
            subscriptionOffers: product.platform === 'android'
              ? product.subscriptionOffers
                  .filter((offer) => Boolean(offer.offerTokenAndroid))
                  .map((offer) => ({
                    sku: product.id,
                    offerToken: offer.offerTokenAndroid as string,
                  }))
              : undefined,
          },
        },
      });
    } catch (reason) {
      setState('ready');
      setMessage(reason instanceof Error ? reason.message : '无法发起购买');
    }
  }

  async function restore() {
    if (!iap.connected) {
      setMessage('商店尚未连接');
      return;
    }
    setMessage('正在恢复购买…');
    try {
      await iap.restorePurchases();
      await iap.getAvailablePurchases();
      const purchases = iap.availablePurchases.filter((purchase) => purchaseToken(purchase));
      if (purchases.length === 0) {
        setMessage('没有可恢复的购买');
        return;
      }
      for (const purchase of purchases) await finishPurchase(purchase);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : '恢复购买失败');
    }
  }

  const storeUnavailable =
    Platform.OS === 'web' ||
    !config?.enabled ||
    !iap.connected ||
    iap.subscriptions.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenFade>
        <ScreenHeader
          kicker="SUBSCRIPTION"
          title="订阅"
          left={<IconButton icon="arrow-left" label="返回账户" onPress={() => router.back()} />}
          right={<StatusBadge tone={config?.verification === 'external' ? 'success' : 'warning'}>
            {config?.verification === 'external' ? '可核验' : '待接入核验'}
          </StatusBadge>}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <Panel elevated style={styles.hero}>
            <Kicker>成剧创作额度</Kicker>
            <Text style={styles.title}>按商店本地价格订阅</Text>
            <BodyText dim>
              购买由 Apple App Store 或 Google Play 完成；只有服务端核验通过后才会同步权益。
            </BodyText>
          </Panel>

          {(state === 'loading' || (config?.enabled && !iap.connected)) ? (
            <Panel style={styles.state}>
              <ActivityIndicator color={colors.textSecondary} />
              <BodyText dim>正在连接商店并读取商品…</BodyText>
            </Panel>
          ) : null}

          {config?.enabled && iap.subscriptions.length > 0 ? (
            <View style={styles.products}>
              {iap.subscriptions.map((product) => (
                <Panel key={product.id} style={styles.product}>
                  <View style={styles.productHead}>
                    <View style={styles.icon}>
                      <Feather name="award" size={19} color={colors.info} />
                    </View>
                    <View style={styles.productCopy}>
                      <Text style={styles.productTitle}>{product.displayName || product.title}</Text>
                      <Text style={styles.productMeta}>{product.description || product.id}</Text>
                    </View>
                    <MonoText style={styles.price}>{product.displayPrice}</MonoText>
                  </View>
                  <PrimaryButton
                    label={state === 'buying' ? '正在打开商店…' : '订阅'}
                    icon="credit-card"
                    disabled={state === 'buying' || state === 'verifying'}
                    onPress={() => void buy(product)}
                  />
                </Panel>
              ))}
            </View>
          ) : null}

          {storeUnavailable ? (
            <Panel style={styles.state}>
              <View style={styles.icon}><Feather name="shopping-bag" size={18} color={colors.textSecondary} /></View>
              <Text style={styles.stateTitle}>
                {Platform.OS === 'web' ? '订阅仅在原生商店构建中可用' : '商店商品暂不可用'}
              </Text>
              <BodyText dim style={styles.center}>
                {!config?.enabled
                  ? '服务端尚未配置订阅 SKU。'
                  : '请确认已使用开发构建、登录商店沙盒账号并配置商品。'}
              </BodyText>
            </Panel>
          ) : null}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <SecondaryButton
            label="恢复购买"
            icon="refresh-cw"
            disabled={!iap.connected || state === 'verifying'}
            onPress={() => void restore()}
          />
          <BodyText dim style={styles.notice}>
            自动续费可在系统订阅管理中取消。退款、恢复与到期状态以 Apple 或 Google 的最终结果为准。
          </BodyText>
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
  hero: { padding: spacing.md, gap: spacing.xs },
  title: { color: colors.text, fontSize: type.title, fontWeight: '600' },
  products: { gap: spacing.sm },
  product: { padding: spacing.md, gap: spacing.md },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
  },
  productCopy: { flex: 1, minWidth: 0, gap: 2 },
  productTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  productMeta: { color: colors.textMuted, fontSize: type.micro, lineHeight: 16 },
  price: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  state: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.xl },
  stateTitle: { color: colors.text, fontSize: type.body, fontWeight: '600' },
  center: { textAlign: 'center', fontSize: type.caption },
  message: { color: colors.warningInk, fontSize: type.caption, lineHeight: 19, textAlign: 'center' },
  notice: { textAlign: 'center', fontSize: type.micro, lineHeight: 17 },
});
