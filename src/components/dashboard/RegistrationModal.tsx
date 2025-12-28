"use client";

import Image from "next/image";
import { useCallback } from "react";

interface RegistrationModalProps {
  showModal: boolean;
  qrLoading: boolean;
  qrError: string;
  qrImageUrl: string;
  timeRemaining: number;
  status: "awaiting" | "completed" | "expired";
  matchedDevice: { device_id: string; friendly_name?: string } | null;
  hybridDeviceIdInput: string;
  hybridSubmitLoading: boolean;
  hybridSubmitError: string | null;
  hybridSubmitSuccess: string | null;
  onClose: () => void;
  onRestart: () => void;
  onHybridInputChange: (value: string) => void;
  onHybridSubmit: () => void;
}

export function RegistrationModal({
  showModal,
  qrLoading,
  qrError,
  qrImageUrl,
  timeRemaining,
  status,
  matchedDevice,
  hybridDeviceIdInput,
  hybridSubmitLoading,
  hybridSubmitError,
  hybridSubmitSuccess,
  onClose,
  onRestart,
  onHybridInputChange,
  onHybridSubmit,
}: RegistrationModalProps) {
  if (!showModal) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Clipboard paste handler
  const handlePasteFromClipboard = useCallback(async () => {
    try {
      // Check if clipboard API is available
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        // Fallback: show error
        console.warn("Clipboard API not available");
        return;
      }

      const text = await navigator.clipboard.readText();
      // Clean the pasted text - remove whitespace and keep only digits
      const cleanedText = text.replace(/\s+/g, "").replace(/\D/g, "");
      
      if (cleanedText) {
        onHybridInputChange(cleanedText);
      }
    } catch (err) {
      // User denied clipboard access or other error
      console.warn("Failed to read clipboard:", err);
    }
  }, [onHybridInputChange]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">📱 Registar Dispositivo</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {status === "completed" ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-lg font-medium text-emerald-400 mb-2">
              Dispositivo Registado!
            </h3>
            <p className="text-sm text-slate-400">
              {matchedDevice?.device_id || "O dispositivo foi associado com sucesso."}
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition"
            >
              Fechar
            </button>
          </div>
        ) : status === "expired" ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⏰</div>
            <h3 className="text-lg font-medium text-amber-400 mb-2">Sessão Expirada</h3>
            <p className="text-sm text-slate-400 mb-4">
              O tempo para registar o dispositivo expirou.
            </p>
            <button
              onClick={onRestart}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-500 rounded-lg text-white transition"
            >
              Tentar Novamente
            </button>
          </div>
        ) : (
          <>
            {/* QR Code Section */}
            <div className="flex flex-col items-center">
              {qrLoading ? (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-800 rounded-lg">
                  <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
                </div>
              ) : qrError && !hybridSubmitSuccess ? (
                <div className="w-48 h-48 flex items-center justify-center bg-red-950/30 rounded-lg border border-red-800">
                  <p className="text-xs text-red-400 text-center px-4">{qrError}</p>
                </div>
              ) : qrImageUrl ? (
                <div className="bg-white p-3 rounded-lg">
                  <Image
                    src={qrImageUrl}
                    alt="QR Code"
                    width={192}
                    height={192}
                    className="w-48 h-48"
                    unoptimized
                  />
                </div>
              ) : null}

              <div className="mt-4 text-center">
                <p className="text-sm text-slate-400">Tempo restante:</p>
                <p
                  className={`text-2xl font-mono font-bold ${
                    timeRemaining < 60 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {formatTime(timeRemaining)}
                </p>
              </div>

              <p className="text-xs text-slate-500 text-center mt-4">
                Abra a app RustDesk no dispositivo e escaneie este QR code para
                configurar automaticamente.
              </p>
            </div>

            {/* ================================================================
                HYBRID QR-CODE ADOPTION SECTION
                ================================================================ */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <div className="mb-4">
                <p className="text-sm text-slate-300 text-center font-medium mb-1">
                  📋 Introduza o RustDesk ID do dispositivo:
                </p>
                <p className="text-xs text-slate-500 text-center">
                  O ID aparece no canto superior esquerdo da app RustDesk (ex: 123456789)
                </p>
              </div>

              {/* RustDesk ID Input Row */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={hybridDeviceIdInput}
                  onChange={(e) => {
                    // Only allow digits
                    const value = e.target.value.replace(/\D/g, "");
                    onHybridInputChange(value);
                  }}
                  placeholder="RustDesk ID (ex: 123456789)"
                  maxLength={12}
                  className="flex-1 px-3 py-2.5 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                />
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="px-3 py-2.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white transition whitespace-nowrap"
                  title="Colar RustDesk ID da área de transferência"
                >
                  📋 PASTE RD ID
                </button>
              </div>

              {/* Submit Button */}
              <button
                type="button"
                onClick={onHybridSubmit}
                disabled={hybridSubmitLoading || !hybridDeviceIdInput.trim()}
                className="w-full px-4 py-3 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition flex items-center justify-center gap-2"
              >
                {hybridSubmitLoading ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    A REGISTAR...
                  </>
                ) : (
                  <>📤 ENVIAR RUSTDESK ID</>
                )}
              </button>

              {/* Error/Success Messages */}
              {hybridSubmitError && (
                <div className="mt-3 p-2 bg-red-950/40 border border-red-800 rounded-lg">
                  <p className="text-xs text-red-400 text-center">{hybridSubmitError}</p>
                </div>
              )}
              {hybridSubmitSuccess && (
                <div className="mt-3 p-2 bg-emerald-950/40 border border-emerald-800 rounded-lg">
                  <p className="text-xs text-emerald-400 text-center">{hybridSubmitSuccess}</p>
                </div>
              )}

              {/* Validation hint */}
              {hybridDeviceIdInput && (
                <p className="text-xs text-slate-500 text-center mt-2">
                  {hybridDeviceIdInput.length < 6 ? (
                    <span className="text-amber-400">⚠️ O ID deve ter pelo menos 6 dígitos</span>
                  ) : hybridDeviceIdInput.length > 12 ? (
                    <span className="text-amber-400">⚠️ O ID deve ter no máximo 12 dígitos</span>
                  ) : (
                    <span className="text-emerald-400">✓ Formato válido ({hybridDeviceIdInput.length} dígitos)</span>
                  )}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
