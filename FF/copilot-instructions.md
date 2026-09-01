# Copilot Instructions – FF.user.js

## Projekt

A **FF.user.js** a `Connect/GC.user.js` **Firefox / mobil** változata: Garmin Connect tevékenység → Markdown, LLM elemzéshez.

- Garmin Connect adat → Markdown (LLM‑barát formátum, ChatGPT melléklet).
- Firefox (asztali + Android) userscript‑kezelőből fut (Tampermonkey / Violentmonkey / Firefox add‑on).
- Fókusz: tiszta, LLM‑barát formátum + megbízható letöltés Firefoxban.

## Fejlesztési workflow

1. **Csak ezt szerkeszd:** `FF/FF.user.js`.
2. **Minden módosításnál** léptesd a verziószámot: header `@version`, `@name`, és a `VERSION` konstans.
3. Telepítsd / frissítsd a fájlt a Firefox userscript‑kezelőben.

## Kulcs‑tudnivalók

- **Nyelv:** magyar.
- **Firefox letöltés‑fix:** a letöltés kétlépcsős (beolvasás → zöld „Mentés” gomb), mert a hosszú async beolvasás alatt lejár a user‑activation, és a Firefox csak friss interakcióra tölt le. Ezt **ne** bontsd vissza egylépcsősre.
- **Mobil:** nagy koppintható gombok, `touch-action: manipulation`, dinamikus body felső térköz (`syncBodyPadding`).
- **Formátum:** rövidítések (pl. `cadance_avg`) tokenoptimalizálás miatt.
- **Referenciák:** `FF/references/` – Firefoxból mentett példák.

## Kommunikáció

Válaszolj magyarul. Kódmódosításnál mindig emlékeztess a verzióléptetésre.

---
*Részletek: README.md ebben a mappában.*
