# OtoFlow AI RPA

KOBİ odaklı, uyum katmanlı RPA SaaS prototipi.

## Özellikler

- Recorder Studio: kullanıcı işini kaydetme, olayları analiz etme ve workflow taslağı üretme.
- Chrome Recorder extension: dış web uygulamalarında tıklama, input, form ve URL olaylarını yakalama.
- Local Agent: Playwright ile gerçek Chrome/ERP adımlarını, macOS Accessibility ile masaüstü tıklama/yazma/kısayol adımlarını çalıştırır.
- Adım bazlı teknik kullanıcı onayı: robot seçilen adımda durur ve onaydan sonra kaldığı yerden devam eder.
- Şifresiz `.otomasyon` içe/dışa aktarma ve AES-256-GCM ile şifrelenmiş hesap kasası.
- WEBM/MP4 ekran kaydını iş oturumuna yükleme ve masaüstü tıklama kaydı.
- Workflow, job, queue, approval, doküman işleme, entegrasyon ve KVKK/audit modülleri.
- E-imza PIN'i, OTP, SMS kodu, banka şifresi ve secret alanlarını saklamama/maskleme politikası.

## Çalıştırma

```bash
npm install
npm run setup:agent
npm run dev:all
```

Uygulama:

```text
http://localhost:5173/dashboard
http://localhost:5173/recorder
```

API:

```text
http://localhost:4100/api/health
```

## Chrome Extension

Chrome'da `chrome://extensions` sayfasını açıp Developer Mode ile şu klasörü `Load unpacked` olarak yükleyin:

```text
extension/chrome-recorder
```

## Local Agent

```bash
cd agents/local-agent
npm start
```

macOS ilk kullanımda Terminal/Node için **Sistem Ayarları → Gizlilik ve Güvenlik → Erişilebilirlik** izni ister. Ekran videosu kaydında tarayıcının **Ekran ve Sistem Sesi Kaydı** izni gerekir.

## Gerçek Çalışma Döngüsü

1. Entegrasyonlar ekranında ERP/portal hesabını kasaya ekleyin.
2. Recorder Studio'da iş kaydını başlatın; web için Chrome eklentisini, masaüstü için Yerel Ajan kaydını kullanın.
3. Kaydı otomasyona çevirin, her adımın seçici/koordinat/değerini kontrol edin ve onay istenecek adımları işaretleyin.
4. Hesap profilini bağlayıp workflow'u yayınlayın.
5. Çalıştırıldığında Yerel Ajan adımları gerçek uygulamada yürütür; Onaylar ekranında seçilen kapılarda bekler.
6. Otomasyonlar ekranından şifre içermeyen `.otomasyon` dosyasını dışa aktarın.

## Gerçek Doküman Girişi

Dokümanlar sekmesi gerçek dosya yüklemeyi destekler:

- Desteklenen tipler: PDF, PNG, JPG, WEBP, TXT, CSV, JSON.
- Boyut sınırı: 10MB.
- TXT/CSV/JSON içeriklerinden taraf, tutar, tarih ve belge no alanları çıkarılır.
- PDF/görsel dosyalar saklanır ve OCR/AI sağlayıcısı bağlanana kadar insan onayına düşer.

## Prisma/PostgreSQL Hazırlığı

Yerel demo SQLite state store ile çalışır. Canlı PostgreSQL geçişi için Prisma şeması hazırdır:

```bash
npm run prisma:generate
npm run prisma:push
```

## Coolify

Tek container deploy için:

- Dockerfile: `Dockerfile`
- Port: `4100`
- Health path: `/api/health`
- Domain örneği: `https://seymata.com`

Docker Compose deploy için:

```text
docker-compose.coolify.yml
```
