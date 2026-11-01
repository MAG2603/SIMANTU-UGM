"""
Supertonic 3 TTS Microservice Server for SIMANTU-UGM
Runs a lightweight HTTP server implementing /v1/audio/speech and /synthesize.
Equipped with built-in intelligent Indonesian and English text normalization
for clear, articulate, and stutter-free public address speech synthesis.
Default port: 8765
"""

import os
import sys
import json
import io
import re
import time
import threading
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

HOST = os.environ.get("SUPERTONIC_HOST", "127.0.0.1")
PORT = int(os.environ.get("SUPERTONIC_PORT", 8765))

# Dedicated CPU thread allocation for Supertonic (onnxruntime)
_LOGICAL_CPUS = os.cpu_count() or 4
_TTS_THREADS = max(2, min(8, _LOGICAL_CPUS - 2))

SUPERTONIC_AVAILABLE = False
SUPERTONIC_LOADING = False
SUPERTONIC_ERROR = ""
SUPERTONIC_INIT_ATTEMPTED = False
tts_engine = None
_init_lock = threading.Lock()
# Inference is CPU bound: serialize synthesis, but keep the server threaded so
# /health keeps answering while a long announcement is being generated.
_synth_lock = threading.Lock()
LOCK_WAIT_SECONDS = float(os.environ.get("SUPERTONIC_LOCK_WAIT_SECONDS", 180))


# ==============================================================================
# INDONESIAN & ENGLISH SPEECH TEXT NORMALIZATION
# Resolves hours, times, numbers, abbreviations, and acronyms into natural words
# to prevent stuttering ("belibet") and ensure clear, authoritative announcements.
# ==============================================================================

def num2words_id(n: int) -> str:
    """Convert integer to Indonesian words (0 to 999,999,999)."""
    if n == 0:
        return "nol"
    satuan = [
        "", "satu", "dua", "tiga", "empat", "lima", "enam",
        "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"
    ]
    if n < 12:
        return satuan[n]
    if n < 20:
        return satuan[n - 10] + " belas"
    if n < 100:
        s = satuan[n // 10] + " puluh"
        rem = n % 10
        return (s + " " + satuan[rem]) if rem else s
    if n < 200:
        rem = n % 100
        return ("seratus " + num2words_id(rem)) if rem else "seratus"
    if n < 1000:
        s = satuan[n // 100] + " ratus"
        rem = n % 100
        return (s + " " + num2words_id(rem)) if rem else s
    if n < 2000:
        rem = n % 1000
        return ("seribu " + num2words_id(rem)) if rem else "seribu"
    if n < 1000000:
        s = num2words_id(n // 1000) + " ribu"
        rem = n % 1000
        return (s + " " + num2words_id(rem)) if rem else s
    if n < 1000000000:
        s = num2words_id(n // 1000000) + " juta"
        rem = n % 1000000
        return (s + " " + num2words_id(rem)) if rem else s
    return str(n)


def format_time_words_id(h: int, m: int) -> str:
    """Format jam:menit menjadi kata Indonesia yang singkat dan natural.

    Contoh: (8, 0) → 'delapan', (8, 5) → 'delapan lewat lima', (16, 30) → 'enam belas tiga puluh'
    """
    h_str = num2words_id(int(h))
    m_int = int(m)
    if m_int == 0:
        return h_str
    elif m_int < 10:
        return f"{h_str} lewat {num2words_id(m_int)}"
    else:
        return f"{h_str} {num2words_id(m_int)}"


def _tz_abbr(tz: str) -> str:
    """Konversi singkatan zona waktu ke ejaan huruf terpisah yang ringkas untuk TTS."""
    t = tz.upper()
    if t == "WIB":
        return "W I B"
    if t == "WITA":
        return "W I T A"
    return "W I T"


_NUM_WORDS_EN = {
    0: "twelve", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen",
    16: "sixteen", 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty",
    30: "thirty", 40: "forty", 50: "fifty"
}

def num2words_en_under_60(n: int) -> str:
    n = int(n)
    if n in _NUM_WORDS_EN:
        return _NUM_WORDS_EN[n]
    tens = (n // 10) * 10
    ones = n % 10
    return f"{_NUM_WORDS_EN.get(tens, '')} {_NUM_WORDS_EN.get(ones, '')}".strip()

def format_time_words_en(h: int, m: int, period: str = None) -> str:
    h = int(h)
    m = int(m)
    if period:
        p_clean = "P M" if "p" in str(period).lower() else "A M"
        h12 = 12 if (h == 0 or h == 12) else (h % 12)
    else:
        if h == 0:
            h12 = 12
            p_clean = "A M"
        elif h < 12:
            h12 = h
            p_clean = "A M"
        elif h == 12:
            h12 = 12
            p_clean = "P M"
        else:
            h12 = h - 12
            p_clean = "P M"

    h_word = _NUM_WORDS_EN.get(h12, str(h12))
    if m == 0:
        return f"{h_word} {p_clean}"
    elif m < 10:
        return f"{h_word} oh {num2words_en_under_60(m)} {p_clean}"
    else:
        return f"{h_word} {num2words_en_under_60(m)} {p_clean}"

def normalize_speech_text(text: str, lang: str = "id") -> str:
    """Normalize raw announcement text into fluent, crystal-clear spoken words."""
    if not text:
        return ""

    is_english = str(lang).strip().lower().startswith("en")
    if is_english:
        res = text
        # 1. Conjunctions & symbols
        res = re.sub(r"\s*&\s*", " and ", res)

        # 2. Time range with AM/PM: 8:00 AM - 5:00 PM or 8:00 AM to 5:00 PM
        _T12 = r"([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm)"
        _SEP_EN = r"(?:\s*-\s*|\s*–\s*|\s*to\s*|\s*until\s*)"
        res = re.sub(
            rf"{_T12}{_SEP_EN}{_T12}",
            lambda m: f"{format_time_words_en(int(m.group(1)), int(m.group(2)), m.group(3))} to {format_time_words_en(int(m.group(4)), int(m.group(5)), m.group(6))}",
            res,
            flags=re.IGNORECASE
        )

        # 3. Time with AM/PM (optional timezone): 3:00 PM, 03:00 PM, 11:45 a.m., 3:00 PM WIB
        _TZ_EN = r"(?:\s*(WIB|WITA|WIT))?"
        res = re.sub(
            rf"\b([0-1]?[0-9])[:.]([0-5][0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm){_TZ_EN}\b",
            lambda m: f"{format_time_words_en(int(m.group(1)), int(m.group(2)), m.group(3))}{', W I B' if m.group(4) and 'wib' in m.group(4).lower() else ''}",
            res,
            flags=re.IGNORECASE
        )

        # 4. Simple hour with AM/PM without minutes: 3 PM, 3:00pm, 10 AM
        res = re.sub(
            rf"\b([0-1]?[0-9])\s*(AM|PM|a\.m\.|p\.m\.|am|pm){_TZ_EN}\b",
            lambda m: f"{format_time_words_en(int(m.group(1)), 0, m.group(2))}{', W I B' if m.group(3) and 'wib' in m.group(3).lower() else ''}",
            res,
            flags=re.IGNORECASE
        )

        # 5. 24h format with timezone: 15:00 WIB, 15.00 WIB
        res = re.sub(
            rf"\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\s*(WIB|WITA|WIT)\b",
            lambda m: f"{format_time_words_en(int(m.group(1)), int(m.group(2)))}, W I B",
            res,
            flags=re.IGNORECASE
        )

        # 6. Standalone 24h format (e.g. at 15:00 or 08:30)
        res = re.sub(
            r"\b(?:at\s+)?([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b",
            lambda m: format_time_words_en(int(m.group(1)), int(m.group(2))),
            res
        )

        # 7. English ordinals: 1st, 2nd, 3rd, 4th, etc.
        _ORDINALS = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth"}
        res = re.sub(
            r"\b([1-9]|10)(st|nd|rd|th)\b",
            lambda m: _ORDINALS.get(int(m.group(1)), m.group(0)),
            res,
            flags=re.IGNORECASE
        )

        # 8. Campus abbreviations
        res = re.sub(r"\bUGM\b", "U G M", res, flags=re.IGNORECASE)
        res = re.sub(r"\bETD\b", "E T D", res, flags=re.IGNORECASE)
        res = re.sub(r"\bWIB\b", "W I B", res, flags=re.IGNORECASE)
        res = re.sub(r"\bL1\b", "Level One", res, flags=re.IGNORECASE)
        res = re.sub(r"\bL2\b", "Level Two", res, flags=re.IGNORECASE)
        res = re.sub(r"\bL3\b", "Level Three", res, flags=re.IGNORECASE)
        res = re.sub(r"\bL4\b", "Level Four", res, flags=re.IGNORECASE)
        res = re.sub(r"\bL5\b", "Level Five", res, flags=re.IGNORECASE)
        return res

    res = text

    # 1. Clean up slashes, colons, symbols, and conjunctions
    res = re.sub(r":([^\s\d])", r": \1", res)
    res = re.sub(r":\s*([0-9])", r": \1", res)
    res = re.sub(r"\s*&\s*", " dan ", res)
    res = re.sub(r"\s*\/\s*atau\s*", " atau ", res, flags=re.IGNORECASE)
    res = re.sub(r"\bdan\/atau\b", "dan atau", res, flags=re.IGNORECASE)
    res = re.sub(r"\b(?:bapak\/ibu|ibu\/bapak)\b", "Bapak atau Ibu", res, flags=re.IGNORECASE)

    # 2. Key campus abbreviations & landmarks
    res = re.sub(r"\bUGM\b", "U G M", res, flags=re.IGNORECASE)
    res = re.sub(r"\bETD\b", "E T D", res, flags=re.IGNORECASE)
    res = re.sub(r"\bKTM\b", "K T M", res, flags=re.IGNORECASE)
    res = re.sub(r"\bOPAC\b", "O-Pac", res, flags=re.IGNORECASE)
    res = re.sub(r"\bSIMANTU\b", "Simantu", res, flags=re.IGNORECASE)
    res = re.sub(r"\b(?:wi-?fi)\b", "Wai-Fai", res, flags=re.IGNORECASE)
    res = re.sub(r"\bAC\b", "A C", res)
    res = re.sub(r"\bPC\b", "P C", res)
    res = re.sub(r"\bCS\b", "Customer Service", res)
    res = re.sub(r"\bL1\b", "Lantai satu", res, flags=re.IGNORECASE)
    res = re.sub(r"\bL2\b", "Lantai dua", res, flags=re.IGNORECASE)
    res = re.sub(r"\bL3\b", "Lantai tiga", res, flags=re.IGNORECASE)
    res = re.sub(r"\bL4\b", "Lantai empat", res, flags=re.IGNORECASE)
    res = re.sub(r"\bL5\b", "Lantai lima", res, flags=re.IGNORECASE)

    # Pola jam: jam/menit (HH.MM atau HH:MM)
    _T = r"([01]?[0-9]|2[0-3])[:.]([0-5][0-9])"
    _TZ = r"(WIB|WITA|WIT|Waktu Indonesia (?:Barat|Tengah|Timur))"
    _SEP = r"(?:-|–|—|\bs\.?d\.?\b|\bs\/d\b|\bsampai\b)"
    _PRE = r"(?:pukul|jam|pk\.?)"

    # 3. Time ranges (HARUS diproses paling awal sebelum pola waktu tunggal)
    # Contoh: 08.00 - 16.30 WIB  |  pukul 08:00 s.d. 16:00
    def _replace_time_range(m):
        h1, m1, h2, m2 = m.group(1), m.group(2), m.group(3), m.group(4)
        tz = m.group(5)
        t1 = format_time_words_id(int(h1), int(m1))
        t2 = format_time_words_id(int(h2), int(m2))
        out = f"pukul {t1} sampai pukul {t2}"
        if tz:
            out += f", {tz if len(tz) > 4 else _tz_abbr(tz)}"
        return out

    res = re.sub(
        rf"(?:{_PRE}\s*)?{_T}\s*{_SEP}\s*(?:{_PRE}\s*)?{_T}(?:\s*{_TZ})?",
        _replace_time_range,
        res,
        flags=re.IGNORECASE
    )

    # 4. Jam+menit dengan timezone (tanpa/dengan prefix): 15.00 WIB, pukul 08:00 WIB
    def _replace_time_tz(m):
        h, m_val, tz = m.group(1), m.group(2), m.group(3)
        t = format_time_words_id(int(h), int(m_val))
        return f"pukul {t}, {tz if len(tz) > 4 else _tz_abbr(tz)}"

    res = re.sub(
        rf"(?:{_PRE}\s*)?{_T}\s*{_TZ}\b",
        _replace_time_tz,
        res,
        flags=re.IGNORECASE
    )

    # 5. Jam dengan prefix pukul/jam/pk tanpa timezone: pukul 16.30, jam 08.00 tepat
    def _replace_prefixed_time(m):
        h, m_val, tepat = m.group(1), m.group(2), m.group(3)
        t = format_time_words_id(int(h), int(m_val))
        out = f"pukul {t}"
        if tepat:
            out += " tepat"
        return out

    res = re.sub(
        rf"\b{_PRE}\s*{_T}(\s*tepat)?\b",
        _replace_prefixed_time,
        res,
        flags=re.IGNORECASE
    )

    # 6. Standalone HH.MM / HH:MM tanpa prefix dan tanpa timezone
    # Contoh: 16.30, 08:00, 15.00 → pukul enam belas tiga puluh
    res = re.sub(
        r"\b([01]?[0-9]|2[0-3])[:.]([0-5][0-9])\b",
        lambda m: f"pukul {format_time_words_id(int(m.group(1)), int(m.group(2)))}",
        res
    )

    # 7. Remaining timezone abbreviations (belum ter-replace)
    res = re.sub(r"\bWIB\b", "W I B", res, flags=re.IGNORECASE)
    res = re.sub(r"\bWITA\b", "W I T A", res, flags=re.IGNORECASE)
    res = re.sub(r"\bWIT\b", "W I T", res, flags=re.IGNORECASE)

    # 8. Common abbreviations (consuming trailing dot if present)
    res = re.sub(r"\bs\.d\.|\bs\.d\b|\bs\/d\b", "sampai dengan", res, flags=re.IGNORECASE)
    res = re.sub(r"\bd\.a\.|\bd\.a\b|\bd\/a\b", "dengan alamat", res, flags=re.IGNORECASE)
    res = re.sub(r"\bdll\b\.?", "dan lain-lain", res, flags=re.IGNORECASE)
    res = re.sub(r"\bdsb\b\.?", "dan sebagainya", res, flags=re.IGNORECASE)
    res = re.sub(r"\bdst\b\.?", "dan seterusnya", res, flags=re.IGNORECASE)
    res = re.sub(r"\bttd\b\.?", "tertanda", res, flags=re.IGNORECASE)
    res = re.sub(r"\byth\b\.?", "Yang terhormat", res, flags=re.IGNORECASE)
    res = re.sub(r"\bno\b\.?", "nomor", res, flags=re.IGNORECASE)
    res = re.sub(r"\btgl\b\.?", "tanggal", res, flags=re.IGNORECASE)
    res = re.sub(r"\bthn\b\.?", "tahun", res, flags=re.IGNORECASE)
    res = re.sub(r"\bbln\b\.?", "bulan", res, flags=re.IGNORECASE)
    res = re.sub(r"\bdr\.\s+", "Dokter ", res, flags=re.IGNORECASE)
    res = re.sub(r"\bprof\.\s+", "Profesor ", res, flags=re.IGNORECASE)
    res = re.sub(r"\bbpk\.?\s+", "Bapak ", res, flags=re.IGNORECASE)
    res = re.sub(r"\bsdr\.?\s+", "Saudara ", res, flags=re.IGNORECASE)
    res = re.sub(r"\bsdri\.?\s+", "Saudari ", res, flags=re.IGNORECASE)

    # 9. Rupiah currency
    def _replace_rupiah(m):
        raw_num = m.group(1).replace(".", "")
        try:
            return f"{num2words_id(int(raw_num))} rupiah"
        except Exception:
            return m.group(0)

    res = re.sub(r"(?:rp\.?|idr)\s*([0-9]+(?:\.[0-9]{3})+|[0-9]+)", _replace_rupiah, res, flags=re.IGNORECASE)

    # 10. Ordinals: ke-1, ke-2, ke 3
    def _replace_ordinal(m):
        val = int(m.group(1) or m.group(2))
        return "pertama" if val == 1 else f"ke{num2words_id(val)}"

    res = re.sub(r"\bke\s*-\s*([0-9]+)\b|\bke\s+([0-9]+)\b", _replace_ordinal, res, flags=re.IGNORECASE)

    # 11. Entity + number: Lantai 2, Pintu 1, Ruang 3, Meja 4, Loket 5, Gedung 6
    def _replace_entity_num(m):
        prefix = m.group(1).lower()
        if prefix.startswith("lt"):
            prefix = "lantai"
        elif prefix.startswith("gd"):
            prefix = "gedung"
        return f"{prefix} {num2words_id(int(m.group(2)))}"

    res = re.sub(
        r"\b(lantai|lt\.?|pintu|ruang|meja|loket|gedung|gd\.?|kelas|tingkat|tahap)\s+([0-9]+)\b",
        _replace_entity_num,
        res,
        flags=re.IGNORECASE
    )

    # 12. Duration: 15 menit, 30 detik, 2 jam
    res = re.sub(
        r"\b([0-9]+)\s*(menit|detik|jam|hari|minggu|bulan|tahun)\b",
        lambda m: f"{num2words_id(int(m.group(1)))} {m.group(2)}",
        res,
        flags=re.IGNORECASE
    )

    # 13. Percentages: 100%
    res = re.sub(r"\b([0-9]+)\s*%", lambda m: f"{num2words_id(int(m.group(1)))} persen", res)

    # 14. Remaining standalone integers (1 to 6 digits)
    res = re.sub(r"\b([0-9]{1,6})\b", lambda m: num2words_id(int(m.group(1))), res)

    # 15. Digit sequences > 6 digits (e.g. phone numbers)
    digit_words = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"]
    res = re.sub(
        r"\b([0-9]{7,})\b",
        lambda m: " ".join(digit_words[int(d)] for d in m.group(1)),
        res
    )

    return re.sub(r"\s+", " ", res).strip()


def init_supertonic():
    global SUPERTONIC_AVAILABLE, SUPERTONIC_LOADING, SUPERTONIC_ERROR
    global SUPERTONIC_INIT_ATTEMPTED, tts_engine
    with _init_lock:
        if SUPERTONIC_AVAILABLE or SUPERTONIC_LOADING:
            return
        if SUPERTONIC_INIT_ATTEMPTED and SUPERTONIC_ERROR:
            return
        SUPERTONIC_LOADING = True
        SUPERTONIC_ERROR = ""

    try:
        from supertonic import TTS
        print("[Supertonic Server] Menginisialisasi Supertonic 3 TTS engine...")
        engine = TTS(
            auto_download=True,
            intra_op_num_threads=_TTS_THREADS,
            inter_op_num_threads=1,
        )
        print(
            f"[Supertonic Server] onnxruntime dialokasikan {_TTS_THREADS} thread "
            f"dari {_LOGICAL_CPUS} logical core (performa optimal)."
        )
        tts_engine = engine
        SUPERTONIC_AVAILABLE = True
        SUPERTONIC_LOADING = False
        print("[Supertonic Server] Supertonic 3 TTS engine siap digunakan!")
    except Exception as e:
        SUPERTONIC_ERROR = str(e)
        SUPERTONIC_LOADING = False
        SUPERTONIC_AVAILABLE = False
        print(f"[Supertonic Server] Error inisialisasi: {e}")
    finally:
        SUPERTONIC_INIT_ATTEMPTED = True


class SupertonicHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _set_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def log_message(self, format, *args):
        # Suppress verbose standard HTTP request logging
        pass

    def _send_json(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        try:
            self.send_response(code)
            self._set_cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (ConnectionError, OSError):
            pass

    def _send_audio(self, audio_bytes):
        try:
            self.send_response(200)
            self._set_cors()
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio_bytes)))
            self.end_headers()
            self.wfile.write(audio_bytes)
        except (ConnectionError, OSError):
            pass

    def do_OPTIONS(self):
        try:
            self.send_response(204)
            self._set_cors()
            self.send_header("Content-Length", "0")
            self.end_headers()
        except (ConnectionError, OSError):
            pass

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ["/", "/health", "/v1/models"]:
            self._send_json(200, {
                "status": "online",
                "service": "Supertonic 3 TTS Server",
                "engine_loaded": SUPERTONIC_AVAILABLE,
                "loading": SUPERTONIC_LOADING,
                "error": SUPERTONIC_ERROR if SUPERTONIC_ERROR else None,
                "version": "3.0",
                "default_port": PORT,
            })
            return

        self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path not in ["/v1/audio/speech", "/synthesize", "/generate", "/tts"]:
            self._send_json(404, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(content_length).decode("utf-8")
        except (ConnectionError, OSError, ValueError):
            return

        try:
            data = json.loads(body)
        except Exception:
            self._send_json(400, {"error": "Invalid JSON body"})
            return

        raw_text = data.get("input") or data.get("text") or ""
        voice = data.get("voice") or data.get("voice_style") or "M1"
        lang = data.get("language") or data.get("lang") or "id"
        try:
            # Default speed 1.0 (calm, clear, natural broadcast pace)
            speed = float(data.get("speed", 1.0))
        except (TypeError, ValueError):
            speed = 1.0
        # Batasi rentang kecepatan agar suara tetap jelas (0.5x - 2.0x)
        speed = max(0.5, min(2.0, speed))

        if not str(raw_text).strip():
            self._send_json(400, {"error": "Teks tidak boleh kosong"})
            return

        # Normalize text into natural spoken words before synthesis
        text = normalize_speech_text(str(raw_text), lang=lang)

        # Wait if engine is still loading (up to 30 seconds)
        wait_start = time.time()
        while SUPERTONIC_LOADING and (time.time() - wait_start < 30):
            time.sleep(0.5)

        if not SUPERTONIC_AVAILABLE:
            init_supertonic()

        if not (SUPERTONIC_AVAILABLE and tts_engine):
            self._send_json(503, {
                "error": f"Supertonic engine tidak siap. Status: error={SUPERTONIC_ERROR or 'belum diinisialisasi'}",
                "engine_loaded": False,
            })
            return

        try:
            import soundfile as sf
            import numpy as np

            clean_voice = str(voice).strip().upper()
            if not (clean_voice.startswith("M") or clean_voice.startswith("F")):
                clean_voice = "M1" if ("M" in clean_voice or "LAKI" in clean_voice or "PRIA" in clean_voice) else "F1"

            try:
                style = tts_engine.get_voice_style(voice_name=clean_voice)
            except Exception:
                style = tts_engine.get_voice_style(voice_name="M1")

            if not _synth_lock.acquire(timeout=LOCK_WAIT_SECONDS):
                self._send_json(503, {
                    "error": "Supertonic 3 masih menyintesis permintaan sebelumnya. Coba lagi sebentar lagi.",
                    "busy": True,
                })
                return

            try:
                tp = getattr(getattr(tts_engine, "model", None), "text_processor", None)
                if tp and hasattr(tp, "validate_text"):
                    is_valid, unsupported = tp.validate_text(text)
                    if not is_valid and unsupported:
                        for bad_ch in unsupported:
                            text = text.replace(bad_ch, " ")
                        text = re.sub(r"\s{2,}", " ", text).strip()
                wav_data, _duration = tts_engine.synthesize(
                    text=text,
                    voice_style=style,
                    speed=speed,
                    lang=lang,
                )
            finally:
                _synth_lock.release()

            sample_rate = getattr(tts_engine, "sample_rate", 24000)
            buf = io.BytesIO()
            sf.write(buf, np.squeeze(wav_data), sample_rate, format="WAV")
            self._send_audio(buf.getvalue())
        except (ConnectionError, OSError):
            pass
        except Exception as synth_err:
            print(f"[Supertonic Server] Error sintesis: {synth_err}")
            self._send_json(500, {"error": f"Sintesis gagal: {str(synth_err)}"})


class SupertonicHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, ConnectionResetError, BrokenPipeError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def run():
    threading.Thread(target=init_supertonic, daemon=True).start()

    server = SupertonicHTTPServer((HOST, PORT), SupertonicHandler)
    print("=====================================================")
    print(f"  Supertonic 3 TTS Server aktif di http://{HOST}:{PORT}")
    print(f"  Endpoint: POST http://{HOST}:{PORT}/v1/audio/speech")
    print(f"  Health:   GET  http://{HOST}:{PORT}/health")
    print("=====================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Supertonic Server] Server dihentikan.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
