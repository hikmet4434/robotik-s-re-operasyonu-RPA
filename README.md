# OtoFlow AI RPA

KOBİ odaklı, uyum katmanlı RPA SaaS prototipi.

## Özellikler

- Recorder Studio: kullanıcı işini kaydetme, olayları analiz etme ve workflow taslağı üretme.
- Chrome Recorder extension: dış web uygulamalarında tıklama, input, form ve URL olaylarını yakalama.
- Local Agent bridge: masaüstü/ERP işleri için yerel event köprüsü.
- Workflow, job, queue, approval, doküman işleme, entegrasyon ve KVKK/audit modülleri.
- E-imza PIN'i, OTP, SMS kodu, banka şifresi ve secret alanlarını saklamama/maskleme politikası.

## Çalıştırma

```bash
npm install
npm run dev
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
OTOFLOW_RECORDING_SESSION_ID=rec_xxxxx npm start
```

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
