# OtoFlow Local Agent

Bu ajan web ve masaüstü workflow adımlarını kullanıcının bilgisayarında gerçek olarak yürütür.

Desteklenen çalışma alanları:

- Chrome/Edge/Chromium: sayfa açma, tıklama, alan doldurma, seçim, bekleme ve veri okuma.
- macOS: uygulama açma, ekran koordinatına tıklama, yazma, kısayol ve bekleme.
- macOS masaüstü tıklamalarını Recorder oturumuna aktarma.
- İş kuyruğunu dinleme, kontrollü tekrar deneme ve adım bazlı onaydan sonra devam.
- Şifreleri loglamadan yalnızca aktif credential adımında kullanma.

## Çalıştırma

```bash
cd agents/local-agent
npm install
OTOFLOW_API_BASE=http://localhost:4100 npm start
```

Demo event:

```bash
OTOFLOW_RECORDING_SESSION_ID=rec_xxxxx npm run demo:event
```

`OTOFLOW_AGENT_TOKEN` sunucudaki değerle aynı olmalıdır. Üretimde varsayılan geliştirme anahtarını kullanmayın.

Canlı Coolify sunucusuna bağlanma örneği:

```bash
OTOFLOW_API_BASE=https://rpa.example.com \
OTOFLOW_AGENT_TOKEN=strong-shared-secret \
OTOFLOW_ALLOWED_PATHS="$HOME/Documents,$HOME/Downloads,$HOME/Desktop" \
npm start
```

Haftalık dosya otomasyonu bu üç klasörü birlikte tarar. Proje bağımlılıkları, derleme klasörleri ve tarayıcı önbellekleri rapora alınmaz.

macOS tıklama/yazma ve kayıt işlemleri için Terminal veya Node uygulamasına Erişilebilirlik izni verin.
