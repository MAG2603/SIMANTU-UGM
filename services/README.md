# Microservice TTS SIMANTU-UGM: Supertonic 3

Folder ini berisi server microservice lokal untuk Text-to-Speech (TTS) on-device pada aplikasi SIMANTU-UGM.

---

## Supertonic 3 TTS Server
Supertonic 3 adalah model TTS on-device ultra cepat berbasis ONNX Runtime dengan dukungan 31+ bahasa termasuk Bahasa Indonesia dan Bahasa Inggris. Server ini dilengkapi dengan normalisasi teks cerdas untuk pengucapan waktu/jam, angka, satuan, mata uang rupiah, dan singkatan institusi (UGM, WIB, L1-L5, dll.) agar terdengar fasih, jernih, dan tidak belibet.

### Instalasi Dependensi:
```bash
pip install -r services/requirements.txt
```
atau
```bash
pip install supertonic onnxruntime soundfile
```

### Menjalankan Server:
```bash
python services/supertonic_server.py
```
* Default URL: `http://127.0.0.1:8765`
* Health Check: `http://127.0.0.1:8765/health`
* Endpoint: `POST http://127.0.0.1:8765/v1/audio/speech`

---

## Catatan Penting
- **Edge-TTS** adalah engine cloud bawaan SIMANTU yang bekerja out-of-the-box tanpa perlu server Python tambahan.
- **Supertonic 3** adalah pilihan utama untuk operasional offline / on-device berkecepatan tinggi.
- Jika server Supertonic 3 belum aktif saat dipilih, SIMANTU secara otomatis melakukan fallback cerdas ke **Edge-TTS** sehingga pengumuman tetap berbunyi tanpa kendala.
