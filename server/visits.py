#!/usr/bin/env python3
"""Compteur de visites d'EuroCoins (aucune dépendance, Python 3 standard).

  GET  /api/visits  → {"count": N}
  POST /api/visits  → compte une visite, renvoie {"count": N}

Une « visite » = un visiteur par heure : une même adresse n'est comptée qu'une fois par heure
(empreinte hachée et salée, gardée en mémoire une heure, jamais écrite). Aucun cookie, aucune
adresse IP enregistrée.

Robots et attaques ne sont pas comptés :
  - il faut exécuter le JavaScript du site (les scanners ne le font pas) ;
  - la requête doit venir du site (Origin / Sec-Fetch-Site) et porter l'en-tête X-EuroCoins ;
  - les agents de robots connus (bot, crawler, curl, python, navigateurs automatisés…) sont ignorés.

Le total est écrit dans un fichier JSON (écriture atomique). Écoute uniquement en local,
derrière le nginx du site (location /api/). Voir deploy/systemd/eurocoins-visits.service.
"""

import hashlib
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("VISITS_HOST", "127.0.0.1")
PORT = int(os.environ.get("VISITS_PORT", "8096"))
DATA_FILE = os.environ.get("VISITS_FILE", "/var/www/eurocoins/data/visits.json")
WINDOW = 60 * 60  # une même adresse ne compte qu'une fois par heure
ALLOWED_ORIGINS = {o for o in os.environ.get("VISITS_ORIGINS", "https://eurocoins.vieilledent.eu").split(",") if o}
BOT_MARKERS = (
    "bot", "crawl", "spider", "slurp", "curl", "wget", "python", "httpclient", "java/", "go-http",
    "headless", "phantomjs", "selenium", "puppeteer", "playwright", "lighthouse", "pingdom", "uptime",
)

lock = threading.Lock()
salt = secrets.token_bytes(16)  # renouvelé à chaque démarrage : empreintes non réutilisables
recent: dict[str, float] = {}


def load() -> int:
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return int(json.load(f).get("count", 0))
    except (FileNotFoundError, ValueError, json.JSONDecodeError):
        return 0


def save(count: int) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    tmp = f"{DATA_FILE}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"count": count, "updated": int(time.time())}, f)
    os.replace(tmp, DATA_FILE)


count = load()


class Handler(BaseHTTPRequestHandler):
    server_version = "EuroCoinsVisits/1.0"

    def _reply(self, status: int, payload: dict | None = None) -> None:
        body = json.dumps(payload or {}).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/api/visits":
            return self._reply(404, {"error": "not found"})
        self._reply(200, {"count": count})

    def _is_real_visit(self) -> bool:
        """Requête envoyée par le site, dans un vrai navigateur (pas un robot ni un script)."""
        h = self.headers
        if h.get("X-EuroCoins") != "1":
            return False
        if h.get("Origin") not in ALLOWED_ORIGINS:
            return False
        if h.get("Sec-Fetch-Site", "same-origin") != "same-origin":
            return False
        agent = (h.get("User-Agent") or "").lower()
        return bool(agent) and "mozilla" in agent and not any(m in agent for m in BOT_MARKERS)

    def do_POST(self) -> None:  # noqa: N802
        global count
        if self.path != "/api/visits":
            return self._reply(404, {"error": "not found"})
        if not self._is_real_visit():
            # Réponse normale (pas d'indice pour contourner), mais rien n'est compté.
            return self._reply(200, {"count": count})
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        key = hashlib.sha256(salt + ip.encode()).hexdigest()
        now = time.time()
        with lock:
            for k in [k for k, t in recent.items() if now - t > WINDOW]:
                del recent[k]
            if key not in recent:
                recent[key] = now
                count += 1
                save(count)
        self._reply(200, {"count": count})

    def log_message(self, *args) -> None:  # pas de journal (aucune donnée personnelle conservée)
        pass


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
