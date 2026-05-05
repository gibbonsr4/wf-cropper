import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { StatusToast } from "@/components/ui/status-toast";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info";
  text: string;
}

interface ToastContext {
  toast: (msg: Omit<ToastMessage, "id">) => string;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastContext | null>(null);

const MAX_VISIBLE = 3;

export function StatusToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const toast = useCallback(
    (msg: Omit<ToastMessage, "id">) => {
      const id = `toast-${++counterRef.current}`;
      const full: ToastMessage = { ...msg, id };
      setMessages((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), full]);

      // Auto-dismiss success/info after 5s; errors persist until dismissed.
      if (msg.type !== "error") {
        setTimeout(() => dismiss(id), 5000);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <Ctx.Provider value={{ toast, dismiss }}>
      {children}
      <StatusToast messages={messages} onDismiss={dismiss} />
    </Ctx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useToast must be used within StatusToastProvider");
  }
  return ctx;
}
