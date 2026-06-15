# GC.user.js
Ez a fájl egy iOS Safari plugin-ből fut, amikr egy oldalt megnyitok akkor az UserScripts alkalmazás beépülő része ráfuttatja ezta. JavaScriptet.

# Feladata
Garmin Connect → Markdown, LLM elemzéshez, pl ChatGPT mellékleteként lesz felhasználva, ezért fontos, hogy a formátum legyen közelebb picit, az LLM-hez.

# Fejlesztés menete
A fejlesztést mindig a Connect/GC.user.js fájllon kell elvégezni, és mentés után egyből cp-val át kell másolni ide: '/Users/bszombathelyi_local/Library/Mobile Documents/com~apple~CloudDocs/UserScripts/GarminConnectV2.user.js'. Ez azért nagoyn fontos, mert így megy be az Icloudon keresztül az iOS-re az új verzió. Mindig módosításnál szükséges, verziószámot léptetni, header és script neve, és ahol még van a fájlba.

## Optimalizálás
Magyarul legyen, lehet "cadance_avg" típúsú rövidítéseket, tocken optimalizálás szempontjából bevezetni.

# Referenciák

Vágyott cél fájlra nagy részére, egy példa: Connect/references/cél.md
A 'Connect/references/*.webarchive' -okban látsz iOS-ről mentett weboldal példányokat, így könnyebb átnézni, hogy mi áll rendelkezésre.