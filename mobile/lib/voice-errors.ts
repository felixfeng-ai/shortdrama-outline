export interface VoiceAvailabilityInput {
  available: boolean;
  platform: string;
  services: readonly string[];
}

export function voiceAvailabilityMessage(input: VoiceAvailabilityInput): string | null {
  if (!input.available) {
    return '当前设备没有可用的语音识别服务，请在系统设置中启用语音服务';
  }
  if (input.platform === 'android' && input.services.length === 0) {
    return '设备未安装或未启用系统语音识别服务，请检查系统语音设置';
  }
  return null;
}

export function voiceErrorMessage(
  code: string,
  rawMessage?: string,
  nativeCode?: number,
): string | null {
  switch (code) {
    case 'aborted':
      return null;
    case 'no-speech':
    case 'speech-timeout':
      return '没有听到声音，请再说一次';
    case 'not-allowed':
      return '麦克风或语音识别权限未开启，请在系统设置中允许';
    case 'service-not-allowed':
      return '当前设备没有可用的语音识别服务';
    case 'language-not-supported':
      return '当前设备不支持中文语音识别';
    case 'network':
      return '语音识别需要网络，请检查连接后重试';
    case 'audio-capture':
      return '没有读到麦克风声音，请检查是否被其他应用占用';
    case 'interrupted':
      return '语音识别被打断了，请再试一次';
    case 'busy':
      return '语音识别正在忙，请稍后再试';
    case 'too-many-requests':
      return '语音识别请求太频繁，请稍后再试';
    case 'client':
      return '系统语音服务启动失败，请检查系统语音识别设置';
    default:
      if (/abort/i.test(rawMessage ?? '')) return null;
      if (/service|recognizer|not.?available/i.test(rawMessage ?? '') || nativeCode === 5) {
        return '系统语音服务不可用，请检查系统语音识别设置';
      }
      return '系统语音识别被中断，请再试一次';
  }
}
