"use client";

import Image from "next/image";

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
            <div className="flex flex-col items-center">
              {qrLoading ? (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-800 rounded-lg">
                  <div className="h-8 w-8 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
                </div>
              ) : qrError ? (
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

            {/* Hybrid fallback form */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <p className="text-xs text-slate-400 text-center mb-3">
                Ou introduza o ID RustDesk manualmente:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={hybridDeviceIdInput}
                  onChange={(e) => onHybridInputChange(e.target.value)}
                  placeholder="ID RustDesk (ex: 123456789)"
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <button
                  onClick={onHybridSubmit}
                  disabled={hybridSubmitLoading}
                  className="px-4 py-2 text-sm bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg text-white transition"
                >
                  {hybridSubmitLoading ? "..." : "Associar"}
                </button>
              </div>
              {hybridSubmitError && (
                <p className="text-xs text-red-400 mt-2">{hybridSubmitError}</p>
              )}
              {hybridSubmitSuccess && (
                <p className="text-xs text-emerald-400 mt-2">{hybridSubmitSuccess}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
