import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { LocalImageAttachment } from './media-input';

interface MediaAttachmentState {
  attachments: LocalImageAttachment[];
  addAttachment: (attachment: LocalImageAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

const MediaAttachmentContext = createContext<MediaAttachmentState | null>(null);

export function MediaAttachmentProvider({ children }: { children: ReactNode }) {
  const [attachments, setAttachments] = useState<LocalImageAttachment[]>([]);
  const addAttachment = useCallback((attachment: LocalImageAttachment) => {
    setAttachments((previous) => [
      attachment,
      ...previous.filter((item) => item.id !== attachment.id),
    ].slice(0, 3));
  }, []);
  const removeAttachment = useCallback((id: string) => {
    setAttachments((items) => items.filter((item) => item.id !== id));
  }, []);
  const clearAttachments = useCallback(() => setAttachments([]), []);
  const value = useMemo(
    () => ({ attachments, addAttachment, removeAttachment, clearAttachments }),
    [addAttachment, attachments, clearAttachments, removeAttachment],
  );
  return (
    <MediaAttachmentContext.Provider value={value}>
      {children}
    </MediaAttachmentContext.Provider>
  );
}

export function useMediaAttachments(): MediaAttachmentState {
  const value = useContext(MediaAttachmentContext);
  if (!value) throw new Error('useMediaAttachments 必须在 MediaAttachmentProvider 中使用');
  return value;
}
