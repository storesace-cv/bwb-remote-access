"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColors = {
    success: "bg-emerald-600 border-emerald-500",
    error: "bg-red-600 border-red-500",
    info: "bg-blue-600 border-blue-500",
  };

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-md rounded-lg border px-4 py-3 shadow-lg transition-all duration-300 ${
        bgColors[type]
      } ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl font-bold text-white">{icons[type]}</span>
        <p className="flex-1 text-sm text-white">{message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="text-white hover:text-slate-200 transition"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "success" | "error" | "info" }>>([]);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return {
    toasts,
    showToast,
    removeToast,
    showSuccess: (message: string) => showToast(message, "success"),
    showError: (message: string) => showToast(message, "error"),
    showInfo: (message: string) => showToast(message, "info"),
  };
}

export function ToastContainer({ toasts, onRemove }: { toasts: Array<{ id: string; message: string; type: "success" | "error" | "info" }>; onRemove: (id: string) => void }) {
  return (
    <>
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ top: `${16 + index * 80}px` }} className="fixed right-4 z-50">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => onRemove(toast.id)}
          />
        </div>
      ))}
    </>
  );
}