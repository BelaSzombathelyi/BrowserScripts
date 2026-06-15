# GC.user.js
Ez a fájl egy iOS Safari pluginből fut. Amikor egy oldalt megnyitok, akkor az UserScripts alkalmazás beépülő része ráfuttatja ezt a JavaScriptet.

# Feladata
Garmin Connect → Markdown, LLM elemzéshez, pl ChatGPT mellékleteként lesz felhasználva, ezért fontos, hogy a formátum legyen közelebb picit, az LLM-hez.

# Fejlesztés menete
A fejlesztést mindig a Connect/GC.user.js fájlon kell elvégezni, és mentés után egyből cp-val át kell másolni ide: '/Users/bszombathelyi_local/Library/Mobile Documents/com~apple~CloudDocs/UserScripts/GarminConnectV2.user.js'. Ez azért nagyon fontos, mert így megy be az iCloudon keresztül az iOS-re az új verzió. Minden módosításnál szükséges verziószámot léptetni, a headerben és a script nevében, valamint ahol még van a fájlban.

## Optimalizálás
Magyarul legyen, lehet "cadance_avg" típusú rövidítéseket tokenoptimalizálás szempontjából bevezetni.

# Referenciák

Vágyott cél fájlra nagy részére egy példa: Connect/references/cél.md
A 'Connect/references/*.webarchive' -okban látsz iOS-ről mentett weboldal példányokat, így könnyebb átnézni, hogy mi áll rendelkezésre.

# Output
Ide teszem bele, ha van frissebb, hogy lásd, mi változott a kimenetben. Kérheted is, hogy frissítsem, ha indokolt. Dátum alapján tudod nézni, hogy friss-e, ami benne van.