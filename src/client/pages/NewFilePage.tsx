import { FileUp, Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export function NewFilePage() {
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  async function handleUpload() {
    setProcessing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 1800));
    const file = await api.createFile();
    navigate(`/file/${file.id}/validate`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-normal">Yeni Gümrük Dosyası</h1>
        <p className="mt-1 muted">Belgeler mock olarak işlenir, sonuçlar API üzerinden kalıcı dosyaya dönüştürülür.</p>
      </div>

      <section className="panel p-6">
        <button
          onClick={handleUpload}
          disabled={processing}
          className="flex min-h-[360px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-slate-50 p-8 text-center transition hover:border-brand hover:bg-teal-50/40 disabled:hover:border-line disabled:hover:bg-slate-50"
        >
          {processing ? (
            <>
              <Loader2 className="animate-spin text-brand" size={42} />
              <div className="mt-5 text-lg font-semibold">Belgeler işleniyor</div>
              <p className="mt-2 max-w-md text-sm text-muted">
                OCR alanları, GTİP önerileri ve kontrol listesi hazırlanıyor.
              </p>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-brand shadow-soft">
                <UploadCloud size={34} />
              </div>
              <div className="mt-5 text-lg font-semibold">Fatura, çeki listesi ve konşimentoyu buraya bırak</div>
              <p className="mt-2 max-w-md text-sm text-muted">
                Demo için tıklaman yeterli; sistem seed belgelerden yeni bir iş dosyası üretir.
              </p>
              <span className="button-primary mt-6">
                <FileUp size={17} />
                Mock yüklemeyi başlat
              </span>
            </>
          )}
        </button>
      </section>
    </div>
  );
}
