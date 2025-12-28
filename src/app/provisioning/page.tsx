"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface ProvisionCode {
  code: string;
  expires_at: string;
  install_url: string;
  status: string;
}

type CodesApiResponse = {
  code?: string;
  expires_at?: string;
  install_url?: string;
  status?: string;
  error?: string;
  message?: string;
};

const CODES_ENDPOINT = "/api/provision/codes";

function getJwtFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("rustdesk_jwt");
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export default function ProvisioningPage() {
  const [jwtMissing, setJwtMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeData, setCodeData] = useState<ProvisionCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = getJwtFromStorage();
    if (!token) {
      setJwtMissing(true);
      return;
    }

    try {
      const parts = token.split(".");
      if (parts.length >= 2) {
        const payloadJson = atob(
          parts[1].replace(/-/g, "+").replace(/_/g, "/"),
        );
        const payload = JSON.parse(payloadJson) as { sub?: string };
        if (
          payload.sub === "9ebfa3dd-392c-489d-882f-8a1762cb36e8"
        ) {
          setIsAdmin(true);
        }
      }
    } catch (decodeError) {
      console.error(
        "Erro ao decodificar JWT em /provisioning:",
        decodeError,
      );
    }
  }, []);

  const expiresInSeconds = useMemo(() => {
    if (!codeData) return null;
    const expiresAt = new Date(codeData.expires_at).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((expiresAt - now) / 1000));
  }, [codeData]);

  useEffect(() => {
    if (!codeData) return;
    const id = window.setInterval(() => {
      setCodeData((prev) => (prev ? { ...prev } : prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, [codeData]);

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);

    const token = getJwtFromStorage();
    if (!token) {
      setJwtMissing(true);
      setLoading(false);
      return;
    }

    if (isAdmin) {
      setError(
        "Esta conta é apenas para gestão. Usa uma conta de técnico/loja para gerar códigos de instalação.",
      );
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(CODES_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const contentType = response.headers.get("content-type") ?? "";
      let json: CodesApiResponse | null = null;

      if (contentType.includes("application/json")) {
        try {
          json = (await response.json()) as CodesApiResponse;
        } catch (parseError) {
          // Evita expor stack trace na UI; log apenas em consola
          // para ajudar no debug sem quebrar a página.
          console.error(
            "Failed to parse JSON from /api/provision/codes:",
            parseError,
          );
        }
      } else {
        const textBody = await response.text().catch(() => null);
        console.error(
          "Non-JSON response from /api/provision/codes",
          {
            status: response.status,
            bodyPreview: textBody?.slice(0, 200),
          },
        );
      }

      if (!response.ok) {
        if (response.status === 504) {
          setError(
            "O servidor demorou demasiado tempo a responder ao gerar o código. Tenta novamente em alguns segundos.",
          );
        } else if (json?.message) {
          setError(json.message);
        } else {
          setError(
            `Falha ao gerar código de instalação (HTTP ${response.status}).`,
          );
        }
        setCodeData(null);
        return;
      }

      if (!json || !json.code || !json.expires_at || !json.install_url) {
        setError(
          "Resposta inesperada do servidor ao gerar o código de instalação.",
        );
        setCodeData(null);
        return;
      }

      setCodeData({
        code: json.code,
        expires_at: json.expires_at,
        install_url: json.install_url,
        status: json.status ?? "unused",
      });
    } catch (err) {
      console.error("Error calling /api/provision/codes:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao chamar a API.",
      );
      setCodeData(null);
    } finally {
      setLoading(false);
    }
  };

  if (jwtMissing) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
    return null;
  }

  if (isAdmin) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-3xl space-y-6">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Provisionamento sem QR
              </h1>
              <p className="mt-1 text-sm md:text-base text-slate-300 max-w-xl">
                Esta conta é reservada para gestão e triagem de dispositivos.
                Usa uma conta de técnico/loja para gerar códigos de instalação
                e iniciar fluxos de provisionamento.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-colors"
            >
              ← Voltar ao painel
            </Link>
          </header>
        </div>
      </main>
    );
  }

  const formattedCountdown =
    expiresInSeconds !== null
      ? `${Math.floor(expiresInSeconds / 60)
          .toString()
          .padStart(2, "0")}:${(expiresInSeconds % 60)
          .toString()
          .padStart(2, "0")}`
      : "—";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-10">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Provisionamento sem QR
            </h1>
            <p className="mt-1 text-sm md:text-base text-slate-300 max-w-xl">
              Gera códigos de instalação de 4 dígitos para Android TV / AOSP.
              Cada código é válido por 15 minutos e qualquer dispositivo que o
              use ficará associado à tua conta como &quot;por adotar&quot;.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-colors"
          >
            ← Voltar ao painel
          </Link>
        </header>

        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-xl shadow-black/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg md:text-xl font-semibold">
                Gerar código de instalação
              </h2>
              <p className="mt-1 text-sm text-slate-300 max-w-xl">
                Entrega o código ao técnico. Ele abre{" "}
                <span className="font-mono text-emerald-300">
                  rustdesk.bwb.pt/i/&lt;código&gt;
                </span>{" "}
                numa Android TV / AOSP ou usa a app Provisioner para completar
                o onboarding sem QR.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm md:text-base font-semibold text-slate-950 shadow-md shadow-emerald-500/30 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "A gerar código..." : "Gerar Código de Instalação"}
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          )}

          {codeData && (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div className="flex flex-col items-start space-y-4">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Código
                </span>
                <div className="rounded-2xl bg-slate-950/40 px-6 py-5 border border-slate-800">
                  <div className="text-6xl md:text-7xl font-mono tracking-[0.25em]">
                    {codeData.code}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Estado:{" "}
                  <span className="font-medium text-slate-100">
                    {codeData.status}
                  </span>
                </p>
              </div>

              <div className="flex flex-col space-y-4">
                <div>
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    Expira em
                  </span>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-950/60 px-4 py-1.5 text-sm text-slate-100">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono">{formattedCountdown}</span>
                    <span className="text-slate-400 text-xs">
                      (aprox. 15 minutos no total)
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                    URL de Instalação
                  </span>
                  <div className="mt-2 rounded-xl bg-slate-950/40 border border-slate-800 px-4 py-3 text-xs md:text-sm text-emerald-200 break-all">
                    {codeData.install_url}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Partilha este link com o técnico ou abre-o directamente na
                    Android TV. A página mostra o código em grande e tenta
                    abrir a app Provisioner via deep link.
                  </p>
                </div>
              </div>
            </div>
          )}

          {!codeData && !error && (
            <p className="text-xs text-slate-500">
              Ainda não há código gerado. Clica em{" "}
              <span className="font-semibold text-slate-200">
                &quot;Gerar Código de Instalação&quot;
              </span>{" "}
              para começar um novo fluxo de provisionamento sem QR.
            </p>
          )}
        </section>

        <section className="text-xs md:text-sm text-slate-500 max-w-3xl">
          <h3 className="mb-1 font-semibold text-slate-300">
            Como funciona o provisionamento sem QR
          </h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Gerar o código e partilhá-lo com o técnico.</li>
            <li>
              O técnico abre{" "}
              <span className="font-mono text-emerald-300">
                rustdesk.bwb.pt/i/&lt;código&gt;
              </span>{" "}
              numa Android TV / AOSP.
            </li>
            <li>
              A app Provisioner reclama o código, descarrega o bundle de
              configuração e instala o RustDesk correto para o ABI do
              dispositivo.
            </li>
            <li>
              O dispositivo aparece no teu dashboard como{" "}
              <span className="font-semibold">Dispositivo por Adotar</span>,
              pronto para ser organizado em grupo/subgrupo.
            </li>
          </ol>
        </section>
      </div>
    </main>
  );
}