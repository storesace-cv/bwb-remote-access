interface InstallCodePageProps {
  params: {
    code: string;
  };
}

export const dynamic = "force-static";

export default function InstallCodePage({ params }: InstallCodePageProps) {
  const code = params.code ?? "";
  const apkUrl = "/apk/bwb-android-provisioner/latest.apk";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center px-6">
      <div className="max-w-xl w-full flex flex-col items-center text-center space-y-10">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide">
          Provisionamento RustDesk
        </h1>

        <p className="text-slate-300 text-base md:text-lg">
          Introduz o código de instalação no dispositivo Android TV ou clica em
          &quot;Instalar&quot; para descarregar diretamente a app Provisioner
          (APK) neste dispositivo.
        </p>

        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl px-8 py-10 flex flex-col items-center space-y-6 w-full">
          <span className="text-sm uppercase tracking-[0.3em] text-slate-400">
            Código de Instalação
          </span>
          <div className="text-6xl md:text-7xl font-mono tracking-[0.2em]">
            {code}
          </div>

          <a
            href={apkUrl}
            download="bwb-android-provisioner-latest.apk"
            className="mt-6 inline-flex items-center justify-center px-8 py-4 rounded-xl bg-emerald-500 text-slate-950 text-lg font-semibold tracking-wide hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 transition-colors"
          >
            Instalar / Continuar Provisionamento
          </a>
        </div>

        <div className="w-full max-w-xl mt-4 text-sm md:text-base text-slate-300 bg-slate-900/60 border border-slate-700 rounded-2xl px-6 py-5 text-left space-y-3">
          <h2 className="text-base md:text-lg font-semibold text-slate-100">
            Verificar integridade do APK (SHA-256)
          </h2>
          <p>
            Para segurança adicional, podes verificar a assinatura SHA-256 do
            ficheiro APK descarregado.
          </p>
          <p className="text-xs md:text-sm text-slate-400">
            Quando o ficheiro{" "}
            <span className="font-mono">latest.apk.sha256</span> estiver
            disponível no mesmo diretório do APK, usa o valor abaixo para
            confirmar a integridade:
          </p>
          <p className="font-mono text-xs md:text-sm break-all text-slate-200">
            SHA-256: PREENCHER_NO_DEPLOY_COM_O_CHECKSUM_REAL
          </p>
        </div>

        <div className="text-sm md:text-base text-slate-400 leading-relaxed">
          <p className="mb-2">
            Se nada acontecer ao clicar em &quot;Instalar&quot;:
          </p>
          <ol className="space-y-1">
            <li>1. Abre a app Provisioner no teu dispositivo Android TV.</li>
            <li>2. Escolhe &quot;Introduzir código manualmente&quot;.</li>
            <li>3. Escreve o código acima: {code}.</li>
          </ol>
        </div>
      </div>
    </main>
  );
}