"use client";

import { useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";

interface AddDevicePanelProps {
  onStartRegistration: () => void;
}

const RUSTDESK_APK_URLS = {
  arm64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=arm64-v8a",
  armeabi: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=armeabi-v7a",
  x86_64: "https://rustdesk.bwb.pt/apk/rustdesk/latest?abi=x86_64",
};

export function AddDevicePanel({ onStartRegistration }: AddDevicePanelProps) {
  const [selectedRustdeskAbi, setSelectedRustdeskAbi] = useState<"arm64" | "armeabi" | "x86_64" | null>(null);

  return (
    <section className="bg-gradient-to-br from-sky-900/20 to-slate-900/40 border border-sky-700/40 rounded-2xl p-6 mb-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-sky-400 mb-4">📱 Adicionar Dispositivo</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onStartRegistration}
          className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4 text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-600/20 flex items-center justify-center text-xl mb-3">
            📷
          </div>
          <h3 className="font-medium text-white mb-1">Escanear QR Code</h3>
          <p className="text-xs text-slate-400">Para dispositivos com câmara</p>
        </button>
        <Link
          href="/provisioning"
          className="group bg-slate-900/70 border border-slate-700 hover:border-sky-600 rounded-xl p-4"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center text-xl mb-3">
            🔢
          </div>
          <h3 className="font-medium text-white mb-1">Provisionamento sem QR</h3>
          <p className="text-xs text-slate-400">Para Android TV e boxes</p>
        </Link>
      </div>

      {/* APK Download Section */}
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2 justify-center">
          {(["arm64", "armeabi", "x86_64"] as const).map((abi) => (
            <button
              key={abi}
              type="button"
              onClick={() => setSelectedRustdeskAbi(abi)}
              className={`px-3 py-2 text-xs rounded-md border transition ${
                selectedRustdeskAbi === abi
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700"
              }`}
            >
              {abi === "arm64"
                ? "arm64‑v8a (recomendado)"
                : abi === "armeabi"
                  ? "armeabi‑v7a (32‑bit)"
                  : "x86_64 (Android TV)"}
            </button>
          ))}
        </div>
        {selectedRustdeskAbi && (
          <div className="flex flex-col items-center space-y-2">
            <div className="bg-white p-3 rounded-md">
              <QRCode value={RUSTDESK_APK_URLS[selectedRustdeskAbi]} size={128} />
            </div>
            <p className="text-xs text-slate-400 text-center">
              Aponta a câmara para descarregar o APK
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
