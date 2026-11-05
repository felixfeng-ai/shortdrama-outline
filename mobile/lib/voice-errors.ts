export function voiceErrorMessage(code: string, _rawMessage?: string): string | null {
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
    default:
      return '语音识别没有启动，请稍后重试';
  }
}
