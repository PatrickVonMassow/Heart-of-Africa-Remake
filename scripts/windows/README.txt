Heart of Africa — die drei Host-Kommandos
=========================================

Dieser Ordner liegt bei dir unter
  C:\Users\Patri\Documents\Developing\claude-code\hoa-host\
und ist gleichzeitig im Container sichtbar. Alles, was die Skripte
hierher schreiben, kann ich anschließend selbst lesen — du musst mir
nichts kopieren oder vorlesen.

Öffne eine GANZ NORMALE PowerShell (keine Administratorrechte nötig)
und wechsle hierher:

  cd C:\Users\Patri\Documents\Developing\claude-code\hoa-host


1. SPURENSICHERUNG — jederzeit, ungefährlich, ändert nichts
-----------------------------------------------------------
  .\collect-crash-evidence.ps1 -Around "2026-09-06 03:07","2026-09-07 12:12","2026-09-08 05:26"

Sammelt in einem Aufruf alles, was ich aus dem Container heraus nicht
sehen kann: den Exitcode des Containers, ob die Neustart-Regel überhaupt
gefeuert hat, WSL-Absturzabbilder, das Speicherlimit der VM, und für
jede der drei Todeszeiten jede Ereignisprotokollzeile im Fenster von
plus/minus zehn Minuten — Schlaf, Aufwachen, Windows-Update,
Hyper-V- und Grafiktreiberfehler.

Schreibt: crash-evidence-<Zeitstempel>.txt in diesen Ordner.

Das ist der Aufruf, der die offene Frage beantwortet. Fang damit an.


2. AUSLIEFERUNG — verändert deine Container-Konfiguration
----------------------------------------------------------
  .\deploy-container-recovery.ps1 -WhatIfOnly      (erst nur ansehen)
  .\deploy-container-recovery.ps1                  (dann wirklich)

Kopiert die geprüfte Konfiguration in deinen aktiven .devcontainer —
fünf Dateien, mit vorherigem Backup des ganzen Ordners. Deine
host-eigenen Dateien (CLAUDE.md, hooks\, settings.json) bleiben
unangetastet. Zurück geht es mit -Rollback.

Danach MUSS der Container neu gebaut werden; ein Reload genügt nicht:
  VS Code -> F1 -> "Dev Containers: Rebuild Container"


3. DIE ÜBUNG — beweist, ob der Container von allein zurückkommt
----------------------------------------------------------------
  .\restart-drill.ps1                        (Handlauf: stop + start)
  .\restart-drill.ps1 -IncludeEngineRestart  (dazu der Engine-Neustart)

ACHTUNG: Das Skript stoppt den Container. Alles, was darin arbeitet,
stirbt — schließe vorher alle VS-Code-Fenster und starte die Übung
nicht, während ein Bildlauf läuft. Das Skript prüft das selbst und
verweigert sich, wenn eine Browser-Suite arbeitet, und es fragt vor
dem Stoppen nach (außer mit -Force).

Es misst, wie lange der Launcher braucht, bis er wieder mit lebender
PID und frischem Takt antwortet, und nimmt eine Sekundprobe zehn
Sekunden später — ein Launcher, der sofort wieder stirbt, gilt nicht
als Erholung.

Schreibt: restart-drill-<Zeitstempel>.txt in diesen Ordner.


Reihenfolge
-----------
1 kannst du sofort und gefahrlos laufen lassen. 2 und 3 gehören
zusammen und brauchen einen ruhigen Moment ohne laufenden Batch.
