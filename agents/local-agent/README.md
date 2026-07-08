# OtoFlow Local Agent

Bu ajan masaüstü uygulamaları, yerel ERP ekranları, Excel masaüstü ve uzak masaüstü gibi browser dışı işlerin ileride kaydedilmesi için temel bridge katmanıdır.

İlk sürümde:

- OtoFlow Recorder session'a event gönderir.
- Secret/PIN/OTP/şifre/banka/e-imza benzeri değerleri maskeler.
- Lokal HTTP bridge sağlar: `http://localhost:4687/event`.

## Çalıştırma

```bash
cd agents/local-agent
OTOFLOW_API_BASE=http://localhost:4100 \
OTOFLOW_RECORDING_SESSION_ID=rec_xxxxx \
npm start
```

Demo event:

```bash
OTOFLOW_RECORDING_SESSION_ID=rec_xxxxx npm run demo:event
```

## Sonraki gerçek ajan fazı

- macOS Accessibility API / Windows UI Automation adapter.
- OCR/screenshot ile ekran bölgesi tanıma.
- Excel/ERP adapterleri.
- Attended robot: kullanıcı bilgisayarında çalışır, riskli aksiyonda OtoFlow onayı bekler.
