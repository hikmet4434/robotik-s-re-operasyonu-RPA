# OtoFlow Chrome Recorder

Bu uzantı dış web uygulamalarında yapılan işi OtoFlow Recorder Studio'ya aktarır.

## Kurulum

1. Chrome'da `chrome://extensions` adresini aç.
2. `Developer mode` seçeneğini aç.
3. `Load unpacked` butonuna bas.
4. Bu klasörü seç: `extension/chrome-recorder`.
5. OtoFlow uygulamasında `Recorder Studio` ekranında kayıt oturumu başlat veya popup içinden yeni oturum aç.

## Güvenlik

- Şifre, PIN, OTP, SMS kodu, token ve secret alanları `MASKED_SECRET` olarak maskelenir.
- Olaylar `http://localhost:4100/api/recordings/:id/events` endpointine gönderilir.
- Nihai e-posta/gönderim/finansal/yasal adımlar için OtoFlow onay kapısı devrededir.
