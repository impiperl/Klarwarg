# Klarwarg auf einem Server installieren

So kommt deine Klarwarg-Website ins Internet. Du brauchst etwa 15 Minuten und keine
Programmierkenntnisse.

**Du brauchst:**

- einen gemieteten Linux-Server mit Docker
- eine eigene Domain, zum Beispiel `praxis-muster.de`

## In drei Schritten

### 1. Einen Server mit Docker mieten

Miete bei einem Hosting-Anbieter einen kleinen Linux-Server (Ubuntu oder Debian) mit
**mindestens 2 GB Arbeitsspeicher**. Viele Anbieter haben Docker gleich dabei; das heißt dort
etwa „Docker“-Vorlage oder „Docker CE“-App. Ist Docker nicht dabei, installierst du es mit
einem Befehl (siehe Schritt 3).

Achte darauf, dass die Firewall des Anbieters die Ports **80** und **443** erlaubt (Web und
HTTPS). Meist ist das schon so.

### 2. Die Domain auf den Server zeigen lassen

Beim Anbieter deiner Domain gibt es „DNS-Einstellungen“. Lege dort einen Eintrag an:

| Typ | Name | Wert |
| --- | --- | --- |
| A | `@` (oder leer lassen) | die IP-Adresse deines Servers |

Die IP-Adresse steht in der Übersicht deines Servers. Bis der Eintrag überall bekannt ist, kann
es eine Weile dauern; meist sind es Minuten, selten einige Stunden.

### 3. Klarwarg installieren

Verbinde dich mit deinem Server. Der Anbieter zeigt, wie („SSH“ oder „Konsole“ im Browser).
Dann diese Zeilen nacheinander eingeben:

```bash
git clone https://github.com/impiperl/klarwerk.git /srv/klarwarg
cd /srv/klarwarg
sudo ./klarwarg.sh install
```

Meldet der Server `git: command not found`, vorher `sudo apt install -y git` eingeben. Falls
Docker noch fehlt, sagt dir das Skript das. Dann einmal
`curl -fsSL https://get.docker.com | sudo sh` eingeben und den letzten Befehl wiederholen.

Das Skript fragt, wie die Website erreichbar sein soll. Nimm **1** und gib deine Domain ein.
Danach baut und startet es Klarwarg; beim ersten Mal dauert das ein paar Minuten. Am Ende
siehst du:

```
Fertig. Klarwarg läuft.

  Editor:   https://praxis-muster.de/admin
  Website:  https://praxis-muster.de

  Einrichtungscode: 4AE951EB32
```

Öffne den Editor im Browser. Gib den Einrichtungscode ein und wähle einen Benutzernamen und ein
Passwort (mindestens 12 Zeichen). Fertig: Du kannst deine Website gestalten und veröffentlichen.

Das HTTPS-Zertifikat holt Klarwarg selbst und erneuert es auch selbst. Zeigt die Domain noch
nicht auf den Server, versucht Klarwarg es weiter, bis es klappt.

## Danach: die wichtigsten Befehle

Alle im Ordner `/srv/klarwarg` (vorher `cd /srv/klarwarg`):

| Was | Befehl |
| --- | --- |
| Neue Version einspielen (sichert vorher automatisch) | `sudo ./klarwarg.sh update` |
| Sicherung machen | `sudo ./klarwarg.sh backup` |
| Läuft alles? Einrichtungscode noch einmal anzeigen | `sudo ./klarwarg.sh status` |
| Neu starten | `sudo ./klarwarg.sh restart` |
| Wenn etwas nicht geht: Protokoll ansehen | `sudo ./klarwarg.sh logs` |

Sicherungen landen im Ordner `backups/`. Lade sie ab und zu auf deinen eigenen Rechner herunter.
Darin stecken deine Website, deine Bilder und dein Zugang.

Nach einem Neustart des Servers startet Klarwarg von selbst wieder.

## Umzug: eine bestehende Website mitnehmen

1. Auf dem alten Server: `sudo ./klarwarg.sh backup`. Die neueste Datei aus `backups/` auf den
   neuen Server kopieren.
2. Auf dem neuen Server Klarwarg holen wie in Schritt 3 (`git clone …`, `cd /srv/klarwarg`), aber
   **vor** dem Installieren die Sicherung auspacken:

   ```bash
   mkdir data
   sudo tar xzf /pfad/zur/klarwarg-JJJJMMTT-HHMMSS.tar.gz -C data
   sudo ./klarwarg.sh install
   ```

3. Die Domain auf den neuen Server umstellen (Schritt 2). Anmelden kannst du dich mit deinem
   bisherigen Zugang. Einen Einrichtungscode gibt es dann nicht.

## Für Fortgeschrittene

### Auswahl 2: Ein vorhandener Webserver leitet weiter

Läuft auf dem Server schon ein Webserver (z. B. nginx) mit HTTPS, nimm Auswahl 2. Klarwarg
lauscht dann nur intern:

- auf `127.0.0.1:4317` (oder dem Port, den du angibst), oder
- im Container-Netz deines Webservers unter `klarwarg:4317`, wenn du das Netzwerk angibst.

Beispiel für nginx. HTTPS und Zertifikat richtest du wie bei deinen anderen Seiten ein:

```nginx
server {
    server_name praxis-muster.de;
    # listen 443 ssl; ssl_certificate …; wie bei deinen anderen Seiten

    client_max_body_size 12m;   # Bilder und Entwürfe; nginx erlaubt sonst nur 1 MB

    location / {
        proxy_pass http://127.0.0.1:4317;      # im Container-Netz: http://klarwarg:4317
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Läuft nginx im Container, lös `klarwarg` besser erst bei der Anfrage auf: per `resolver` und
`set $klarwarg http://klarwarg:4317; proxy_pass $klarwarg;`. Sonst startet nginx nicht, solange
Klarwarg aus ist.

Klarwarg braucht eine eigene Domain oder Subdomain. Unter einem Unterpfad wie `/klarwarg/` läuft
es nicht. Mehrere Websites unter einer Domain gehen trotzdem: Die Adresse jeder Website
(`/iris`, `/judith` oder leer für `/`) legst du beim Veröffentlichen fest. Der nginx-Block oben
leitet dafür einfach alles (`location /`) an Klarwarg weiter.

### Auswahl 3: Im eigenen Netzwerk ausprobieren

Ohne Domain und ohne HTTPS, erreichbar unter `http://<IP-des-Rechners>:4317`. Das ist nur zum
Testen gedacht, nicht für eine öffentliche Website.

### Einstellungen ändern

Die Einstellungen stehen in `/srv/klarwarg/.env`. Weitere mögliche Einträge (LinkedIn,
Schnittstelle für Leistungen) stehen in `.env.example`. Nach jeder Änderung:
`sudo ./klarwarg.sh restart`.

### Podman statt Docker

`klarwarg.sh` nimmt Podman, wenn kein Docker da ist. Alles funktioniert gleich. Damit Klarwarg
nach einem Neustart des Servers wieder startet, einmal
`sudo systemctl enable podman-restart.service` ausführen.

### Ohne Container

Wie man Klarwarg direkt mit Node.js betreibt, steht im `README.md` unter „Manual installation
without containers“.
