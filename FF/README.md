# FF.user.js

Garmin Connect → Markdown, LLM elemzéshez (pl. ChatGPT melléklet). Ez a `Connect/GC.user.js` **Firefox / mobil** változata.

A szkript egy Firefox (asztali és Android) userscript‑kezelőből fut (pl. Tampermonkey / Violentmonkey / Firefox userscript add‑on). Egy tevékenység oldal megnyitásakor a kezelő ráfuttatja ezt a JavaScriptet.

## Feladata

Garmin Connect tevékenység oldal → Markdown. A formátum LLM‑barát (rövidítések, tömör táblázatok), mert ChatGPT stb. mellékleteként használjuk.

`@match`: `https://connect.garmin.com/app/activity/*`

## Firefox letöltés‑fix (a fő különbség a GC‑hez képest)

A Firefox csak friss „user activation” mellett indít el programból letöltést. A beolvasás (Időközök tab → „Összes” → körök kibontása) több másodperces async folyamat, ami alatt az eredeti koppintás aktivációja lejár – ezért az eredeti szkriptben a letöltés **csak egérmozgásra / a lapra kattintásra** indult el.

Megoldás: **kétlépcsős letöltés**

1. Koppints a **📥 Markdown letöltése** gombra → a szkript beolvassa az oldalt és összeállítja az MD‑t.
2. A gomb zöld **⬇️ Mentés** gombbá alakul → koppints rá → a letöltés **azonnal** elindul (friss aktiváció, nem kell egeret mozgatni).

## Mobil optimalizálás

- Nagyobb koppintható gombok (min. 44 px), `touch-action: manipulation` (nincs dupla‑koppintás késleltetés).
- Az overlay tényleges magasságához igazodó felső térköz (több soros tördelésnél és forgatásnál is jó).
- „koppints” szövegek „kattints” helyett.

## Fejlesztés menete

- Szerkeszd: `FF/FF.user.js`.
- Minden módosításnál léptesd a verziót: header `@version`, `@name`, és a `VERSION` konstans.
- A Firefox userscript‑kezelőben frissítsd / telepítsd újra a fájlt.

## Referenciák

A `FF/references/` mappába kerülnek a Firefoxból mentett oldalpéldányok és a kimeneti Markdown példák.
