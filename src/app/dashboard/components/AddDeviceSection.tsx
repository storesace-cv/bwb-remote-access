"use client";

import Link from "next/link";
import QRCode from "react-qr-code";

type RustdeskAbi = "arm64" | "armeabi" | "x86_64" | null;

interface AddDeviceSectionProps {
  jwt: string | null;
  selectedRustdeskAbi: RustdeskAbi;
  onSelectAbi: (abi: RustdeskAbi) => void;
  onOpenQrModal: () => void;
  rustdeskApkUrls: Record<"arm64" | "armeabi" | "x86_64", string>;
}

export function AddDeviceSection({
  jwt,
  selectedRustdeskAbi,
  onSelectAbi,
  onOpenQrModal,
  rustdeskApkUrls,
}: AddDeviceSectionProps) {
  return (
    <section
      className="bg-gradient-to-br from-sky-900/20 to-slate-900/40 border border-sky-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm"
      data-testid="add-device-section"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-sky-400" data-testid="add-device-title">
            📱 Adicionar Dispositivo
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Escolhe o método de provisionamento que melhor se adapta ao teu dispositivo
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onOpenQrModal}
          disabled={!jwt}
          className={`group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20 text-left ${
            !jwt ? "opacity-50 cursor-not-allowed" : ""
          }`}
          data-testid="scan-qr-button"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xl">
              📷
            </div>
            <svg
              className="w-5 h-5 text-slate-600 group-hover:text-sky-400 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="font-medium text-white mb-1">Escanear QR Code</h3>
          <p className="text-xs text-slate-400">
            Gera um QR code para dispositivos móveis com câmara (smartphones, tablets Android)
          </p>
          <div className="mt-3 inline-flex items-center text-xs text-sky-400 font-medium">
            <span>Abrir modal QR</span>
            <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </button>

        <Link
          href="/provisioning"
          className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-sky-900/20 block"
          data-testid="provisioning-link"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl">
              🔢
            </div>
            <svg
              className="w-5 h-5 text-slate-600 group-hover:text-sky-400 transition-colors"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="font-medium text-white mb-1">Provisionamento sem QR</h3>
          <p className="text-xs text-slate-400">
            Gera código de 4 dígitos para Android TV, boxes e dispositivos sem câmara
          </p>
          <div className="mt-3 inline-flex items-center text-xs text-sky-400 font-medium">
            <span>Ir para Provisioning</span>
            <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </Link>
      </div>

      {/* APK Download QR Codes */}
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
          <button
            type="button"
            onClick={() => onSelectAbi("arm64")}
            className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
              selectedRustdeskAbi === "arm64"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
            }`}
          >
            arm64‑v8a (recomendado)
          </button>
          <button
            type="button"
            onClick={() => onSelectAbi("armeabi")}
            className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
              selectedRustdeskAbi === "armeabi"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
            }`}
          >
            armeabi‑v7a (dispositivos mais antigos, 32‑bit)
          </button>
          <button
            type="button"
            onClick={() => onSelectAbi("x86_64")}
            className={`px-3 py-2 text-xs sm:text-sm rounded-md border transition ${
              selectedRustdeskAbi === "x86_64"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
            }`}
          >
            x86_64 (Android TV / x86)
          </button>
        </div>

        {selectedRustdeskAbi ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="bg-white p-3 rounded-md shadow-sm">
              <QRCode
                value={rustdeskApkUrls[selectedRustdeskAbi]}
                size={128}
                bgColor="#ffffff"
                fgColor="#020617"
              />
            </div>
            <p className="text-xs font-semibold text-slate-100">
              {selectedRustdeskAbi === "arm64" && "arm64‑v8a (a maioria dos dispositivos Android recentes)"}
              {selectedRustdeskAbi === "armeabi" && "armeabi‑v7a (dispositivos mais antigos, 32‑bit)"}
              {selectedRustdeskAbi === "x86_64" && "x86_64 (Android TV / boxes e ambientes x86_64)"}
            </p>
            <p className="text-[11px] text-center text-slate-400">
              Aponta a câmara do dispositivo Android para este QR code para descarregar o APK correspondente.
            </p>
            <p className="text-[10px] text-center text-slate-500 break-all">
              {rustdeskApkUrls[selectedRustdeskAbi]}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center">
            Escolhe primeiro o tipo de processador para ver o QR‑code correspondente.
          </p>
        )}
      </div>
    </section>
  );
}

export type { RustdeskAbi };
