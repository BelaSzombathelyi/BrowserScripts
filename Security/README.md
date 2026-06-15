# SJ.user.js
Ez a fájl egy iOS Safari pluginből fut. Amikor egy oldalt megnyitok, akkor az UserScripts alkalmazás beépülő része ráfuttatja ezt a JavaScriptet.

# Feladata
Security Journey (https://my.securityjourney.com) oldalhoz készülő userscript. Jelenleg csak egy **Hello World**: egy overlay-t tesz az oldal tetejére, hogy igazoljuk, a script betöltődik és lefut. A tényleges funkciók ezután épülnek rá.

# Fejlesztés menete
A fejlesztést mindig a Security/SJ.user.js fájlon kell elvégezni, és mentés után egyből cp-val át kell másolni ide: '/Users/bszombathelyi_local/Library/Mobile Documents/com~apple~CloudDocs/UserScripts/SecurityJourney.user.js'. Ez azért nagyon fontos, mert így megy be az iCloudon keresztül az iOS-re az új verzió. Minden módosításnál szükséges verziószámot léptetni, a headerben és a script nevében, valamint ahol még van a fájlban.

## Optimalizálás
Magyarul legyen, lehet rövidítéseket bevezetni, ahol indokolt.

# Referenciák
A Connect mappa (Connect/GC.user.js) hasonló szerkezetű, működő példa, érdemes onnan mintát venni.
