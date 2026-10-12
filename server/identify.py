#!/usr/bin/env python3
"""Reconnaissance d'une pièce photographiée par un modèle de vision (aucune dépendance, Python 3 standard).

  GET  /api/identify → {"enabled": true|false}
  POST /api/identify {"check": true} → {"ok": true}   (le code PIN de l'en-tête est le bon)
  POST /api/identify {"photo": "data:image/jpeg;base64,…"}
       → {"country": "fr"|null, "value": "2e"|null, "commemorative": bool, "year": 2012|null}
  POST /api/identify {"photo": "…", "candidates": ["/coins/…webp", …]}
       → {"index": n|null}   (la pièce candidate qui est sur la photo)

Deux temps, enchaînés par le site (src/coinIdentify.ts) : le modèle lit d'abord la pièce (pays,
valeur, année), le site en déduit les pièces possibles de son catalogue, puis le modèle compare la
photo aux visuels de ces pièces. Les visuels sont lus ici, sur le disque : le site n'envoie que
leurs chemins.

Le modèle est appelé par OpenRouter ; la clé (OPEN_ROUTER_API_KEY) ne quitte jamais ce service.

Accès réservé à l'administrateur : chaque requête POST porte le code PIN (ADMIN_ACCESS) dans
l'en-tête X-EuroCoins-Pin ; code absent ou faux : 401, et dix essais faux par adresse et par heure
au plus. Sans clé ou sans code PIN configuré, le service répond {"enabled": false} et le site
garde sa reconnaissance locale.

Garde-fous (la clé est payante) : requêtes venant du site uniquement, quota par adresse et par
heure, plafond global par jour, taille de photo et nombre de candidates bornés. La photo n'est ni
écrite ni journalisée. Écoute en local, derrière nginx (location /api/identify).
Voir deploy/systemd/eurocoins-identify.service.
"""

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("IDENTIFY_HOST", "127.0.0.1")
PORT = int(os.environ.get("IDENTIFY_PORT", "8097"))
API_KEY = os.environ.get("OPEN_ROUTER_API_KEY", "").strip()
PIN = os.environ.get("ADMIN_ACCESS", "").strip()
MODEL = os.environ.get("IDENTIFY_MODEL", "qwen/qwen2.5-vl-72b-instruct")
# Dossier servi par le site : les chemins « /coins/… » y sont résolus.
SITE_DIR = os.path.realpath(os.environ.get("IDENTIFY_SITE_DIR", "/var/www/eurocoins/current"))
ALLOWED_ORIGINS = {o for o in os.environ.get("IDENTIFY_ORIGINS", "https://eurocoins.vieilledent.eu").split(",") if o}
PER_HOUR = int(os.environ.get("IDENTIFY_PER_HOUR", "30"))  # requêtes par adresse et par heure
PER_DAY = int(os.environ.get("IDENTIFY_PER_DAY", "2000"))  # requêtes par jour, tous visiteurs confondus
PIN_TRIES = 10  # codes PIN faux tolérés par adresse et par heure
MAX_BODY = 600_000  # octets (photo ≈ 100 ko en base64)
MAX_CANDIDATES = 24
PHOTO = re.compile(r"^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$")
CANDIDATE = re.compile(r"^/coins/[A-Za-z0-9_\-./]+\.webp$")
VALUES = ("1c", "2c", "5c", "10c", "20c", "50c", "1e", "2e")
COUNTRIES = {
    "ad": "Andorra", "at": "Austria", "be": "Belgium", "bg": "Bulgaria", "cy": "Cyprus", "de": "Germany",
    "ee": "Estonia", "es": "Spain", "fi": "Finland", "fr": "France", "gr": "Greece", "hr": "Croatia",
    "ie": "Ireland", "it": "Italy", "lt": "Lithuania", "lu": "Luxembourg", "lv": "Latvia", "mc": "Monaco",
    "mt": "Malta", "nl": "Netherlands", "pt": "Portugal", "si": "Slovenia", "sk": "Slovakia",
    "sm": "San Marino", "va": "Vatican City",
}

READ_PROMPT = (
    "The photo shows the national side of one euro coin. Identify it.\n"
    "Answer with a single JSON object and nothing else:\n"
    '{"country": "<code>", "value": "<value>", "commemorative": true|false, "year": <number or null>}\n'
    "- country: issuing country, one of " + ", ".join(f"{k} ({v})" for k, v in COUNTRIES.items()) + "; null if unsure.\n"
    "- value: face value, one of 1c, 2c, 5c, 10c, 20c, 50c, 1e, 2e. Copper coins are 1c/2c/5c, golden coins "
    "10c/20c/50c, a silver ring around a golden centre is 1e, a golden ring around a silver centre is 2e. "
    "null if unsure.\n"
    "- commemorative: true only for a 2 euro coin whose design is a commemorative issue, not the country's usual design.\n"
    "- year: the year engraved on the coin if you can read it, otherwise null."
)
COMPARE_PROMPT = (
    "The first image is a photo of a euro coin taken with a phone (it may be rotated, worn, tilted or badly "
    "lit). The following images, numbered from 1, are reference pictures of candidate coins. Which candidate "
    "shows the same design as the photo? Compare the engraved motif, the lettering and the layout, not the "
    "colour or the lighting.\n"
    'Answer with a single JSON object and nothing else: {"index": <number of the matching candidate, or 0 if '
    "none matches>}"
)

lock = threading.Lock()
salt = secrets.token_bytes(16)  # renouvelé à chaque démarrage : empreintes non réutilisables
recent: dict[str, list[float]] = {}
wrong: dict[str, list[float]] = {}
day = {"start": time.time(), "count": 0}


def fingerprint(ip: str) -> str:
    return hashlib.sha256(salt + ip.encode()).hexdigest()


def pin_ok(ip: str, given: str) -> bool | None:
    """Code PIN juste ? None quand l'adresse a épuisé ses essais de l'heure."""
    key = fingerprint(ip)
    now = time.time()
    with lock:
        tries = [t for t in wrong.get(key, []) if now - t < 3600]
        if len(tries) >= PIN_TRIES:
            wrong[key] = tries
            return None
        if hmac.compare_digest(given.encode(), PIN.encode()):
            wrong.pop(key, None)
            return True
        wrong[key] = [*tries, now]
        return False


def allowed(ip: str) -> bool:
    """Quota par adresse (une heure glissante) et plafond du jour."""
    key = fingerprint(ip)
    now = time.time()
    with lock:
        if now - day["start"] > 86400:
            day["start"], day["count"] = now, 0
        for k in [k for k, times in recent.items() if now - times[-1] > 3600]:
            del recent[k]
        times = [t for t in recent.get(key, []) if now - t < 3600]
        if len(times) >= PER_HOUR or day["count"] >= PER_DAY:
            return False
        recent[key] = [*times, now]
        day["count"] += 1
        return True


def candidate_url(path: str) -> str | None:
    """Visuel d'une pièce du site, en data URL ; None si le chemin sort du dossier des pièces."""
    if not CANDIDATE.match(path) or ".." in path:
        return None
    file = os.path.realpath(os.path.join(SITE_DIR, path.lstrip("/")))
    if not file.startswith(os.path.join(SITE_DIR, "coins") + os.sep):
        return None
    try:
        with open(file, "rb") as f:
            return "data:image/webp;base64," + base64.b64encode(f.read()).decode()
    except OSError:
        return None


def ask(content: list[dict]) -> dict:
    """Envoie la question au modèle et renvoie l'objet JSON de sa réponse."""
    body = json.dumps({
        "model": MODEL,
        "temperature": 0,
        "max_tokens": 120,
        "messages": [{"role": "user", "content": content}],
    }).encode()
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://eurocoins.vieilledent.eu",
            "X-Title": "EuroCoins",
        },
    )
    with urllib.request.urlopen(request, timeout=40) as response:
        text = json.load(response)["choices"][0]["message"]["content"] or ""
    # Le modèle entoure parfois sa réponse de texte ou d'un bloc de code : on garde l'objet JSON.
    found = re.search(r"\{.*\}", text, re.S)
    return json.loads(found.group(0)) if found else {}


def image(url: str) -> dict:
    return {"type": "image_url", "image_url": {"url": url}}


def read_coin(photo: str) -> dict:
    answer = ask([image(photo), {"type": "text", "text": READ_PROMPT}])
    country = str(answer.get("country") or "").lower()
    value = str(answer.get("value") or "").lower()
    year = answer.get("year")
    return {
        "country": country if country in COUNTRIES else None,
        "value": value if value in VALUES else None,
        "commemorative": answer.get("commemorative") is True,
        "year": year if isinstance(year, int) and 1999 <= year <= 2100 else None,
    }


def compare(photo: str, urls: list[str]) -> dict:
    content = [image(photo)]
    for n, url in enumerate(urls, 1):
        content += [{"type": "text", "text": f"Candidate {n}:"}, image(url)]
    answer = ask([*content, {"type": "text", "text": COMPARE_PROMPT}])
    index = answer.get("index")
    return {"index": index - 1 if isinstance(index, int) and 1 <= index <= len(urls) else None}


class Handler(BaseHTTPRequestHandler):
    server_version = "EuroCoinsIdentify/1.0"

    def _reply(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/api/identify":
            return self._reply(404, {"error": "not found"})
        self._reply(200, {"enabled": bool(API_KEY and PIN)})

    def _from_site(self) -> bool:
        """Requête envoyée par le site lui-même, depuis un navigateur."""
        h = self.headers
        return (
            h.get("X-EuroCoins") == "1"
            # « * » : toute origine (développement local, téléphone sur le réseau de la maison).
            and ("*" in ALLOWED_ORIGINS or h.get("Origin") in ALLOWED_ORIGINS)
            and h.get("Sec-Fetch-Site", "same-origin") == "same-origin"
        )

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/identify":
            return self._reply(404, {"error": "not found"})
        if not API_KEY or not PIN:
            return self._reply(503, {"error": "disabled"})
        if not self._from_site():
            return self._reply(403, {"error": "forbidden"})
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        checked = pin_ok(ip, self.headers.get("X-EuroCoins-Pin") or "")
        if not checked:
            return self._reply(429 if checked is None else 401, {"error": "pin"})
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= MAX_BODY:
            return self._reply(413, {"error": "too large"})
        try:
            payload = json.loads(self.rfile.read(length))
            if payload.get("check") is True:
                return self._reply(200, {"ok": True})
            photo = payload["photo"]
            candidates = payload.get("candidates")
            if not isinstance(photo, str) or not PHOTO.match(photo):
                raise ValueError("photo")
            if candidates is not None and (
                not isinstance(candidates, list) or not 1 <= len(candidates) <= MAX_CANDIDATES
            ):
                raise ValueError("candidates")
        except (ValueError, KeyError, TypeError, AttributeError):
            return self._reply(400, {"error": "bad request"})
        if not allowed(ip):
            return self._reply(429, {"error": "quota"})
        try:
            if candidates is None:
                return self._reply(200, read_coin(photo))
            urls = [candidate_url(str(path)) for path in candidates]
            if None in urls:
                return self._reply(400, {"error": "bad candidate"})
            self._reply(200, compare(photo, urls))
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError):
            # Modèle injoignable ou réponse illisible : le site retombe sur sa reconnaissance locale.
            self._reply(502, {"error": "model"})

    def log_message(self, *args) -> None:  # pas de journal (aucune donnée personnelle conservée)
        pass


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
