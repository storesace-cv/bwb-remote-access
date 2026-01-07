"use client";

type RegistrationStatus = "awaiting" | "completed" | "expired";

interface MatchedDevice {
  device_id: string;
  friendly_name?: string;
}

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrationStatus: RegistrationStatus;
  qrLoading: boolean;
  qrError: string;
  qrImageUrl: string;
  timeRemaining: number;
  hybridDeviceIdInput: string;
  onHybridDeviceIdChange: (value: string) => void;
  hybridSubmitLoading: boolean;
  hybridSubmitError: string | null;
  hybridSubmitSuccess: string | null;
  onHybridSubmit: () => void;
  onRestart: () => void;
  matchedDevice: MatchedDevice | null;
  onTryAgain: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RegistrationModal({
  isOpen,
  onClose,
  registrationStatus,
  qrLoading,
  qrError,
  qrImageUrl,
  timeRemaining,
  hybridDeviceIdInput,
  onHybridDeviceIdChange,
  hybridSubmitLoading,
  hybridSubmitError,
  hybridSubmitSuccess,
  onHybridSubmit,
  onRestart,
  matchedDevice,
  onTryAgain,
}: RegistrationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl">
        {/* Awaiting Status */}
        {registrationStatus === "awaiting" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Escanear QR Code</h3>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition"
                disabled={qrLoading || hybridSubmitLoading}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col items-center mb-4">
              {qrLoading ? (
                <div className="w-64 h-64 rounded-lg bg-slate-800 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-slate-600 border-t-emerald-500"></div>
                </div>
              ) : qrError && !qrImageUrl ? (
                <div className="w-64 h-64 rounded-lg bg-slate-800 flex items-center justify-center text-center p-4">
                  <div>
                    <p className="text-red-400 font-semibold mb-2">Erro</p>
                    <p className="text-xs text-slate-400">{qrError}</p>
                  </div>
                </div>
              ) : (
                <img
                  src={qrImageUrl}
                  alt="RustDesk QR"
                  width={256}
                  height={256}
                  className="rounded-lg bg-white p-3"
                />
              )}
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Tempo restante:</span>
                <span className="text-2xl font-bold text-emerald-400 font-mono">
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-1000"
                  style={{ width: `${(timeRemaining / 300) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium text-slate-300">
                ID RustDesk do dispositivo
              </label>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  onHybridSubmit();
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Ex.: 123 456 789"
                  value={hybridDeviceIdInput}
                  onChange={(e) => onHybridDeviceIdChange(e.target.value)}
                  disabled={qrLoading || hybridSubmitLoading}
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={qrLoading || hybridSubmitLoading}
                >
                  {hybridSubmitLoading ? "A enviar..." : "ENVIAR"}
                </button>
              </form>
              <p className="text-xs text-slate-500">
                Podes escrever o ID com ou sem espaços, mas apenas dígitos são aceites.
              </p>
            </div>

            {hybridSubmitError && (
              <div className="mt-3 rounded-md border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400">
                {hybridSubmitError}
              </div>
            )}

            {hybridSubmitSuccess && (
              <div className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-400">
                {hybridSubmitSuccess}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
                onClick={onRestart}
                disabled={qrLoading || hybridSubmitLoading}
              >
                Tentar novamente
              </button>
              <button
                type="button"
                className="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                onClick={onClose}
                disabled={qrLoading || hybridSubmitLoading}
              >
                Fechar
              </button>
            </div>
          </>
        )}

        {/* Completed Status */}
        {registrationStatus === "completed" && matchedDevice && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-emerald-400">✅ Dispositivo Detectado!</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-300">
                <span className="font-semibold">ID:</span> {matchedDevice.device_id}
              </p>
              {matchedDevice.friendly_name && (
                <p className="text-sm text-slate-300">
                  <span className="font-semibold">Nome:</span> {matchedDevice.friendly_name}
                </p>
              )}
              <p className="text-xs text-amber-400 mt-2">
                ⚠️ O dispositivo aparecerá em &quot;Dispositivos por adoptar&quot;. Clica em &quot;Adoptar&quot; para adicionar informações adicionais.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onTryAgain}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
              >
                Adicionar Outro
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
              >
                Fechar
              </button>
            </div>
          </>
        )}

        {/* Expired Status */}
        {registrationStatus === "expired" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-amber-400">⏱️ Tempo Esgotado</h3>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition">
                ✕
              </button>
            </div>

            <div className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-4 mb-4">
              <p className="text-sm text-slate-300">
                A sessão de registro expirou. Por favor, tente novamente.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onTryAgain}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 transition text-white"
              >
                Tentar Novamente
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 transition text-white"
              >
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export type { RegistrationStatus, MatchedDevice };
