# Clean Ledger · sistemul de design al aplicației Socend CVR

Sursa unică de adevăr. Tokenii trăiesc în `src/index.css` (`@theme`), oglinda lor
în JavaScript în `src/design/tokens.ts`, piesele de interfață în
`src/components/ui.tsx` și `src/components/Shell.tsx`.

**Regula zero: niciun hex scris direct într-o componentă.** Totul trece prin
utilitarele generate din tokeni (`bg-paper-1`, `text-ink-2`, `border-line-2`,
`bg-pos-fill`, ...). Dacă un lucru nu e acoperit aici, se derivă din tokenul cel
mai apropiat. Nu se inventează culori sau fonturi.

## Fonturi

- **Instrument Sans** — tot: text, etichete, butoane, tabele, cifre.
- **Instrument Serif 400** — DOAR titlurile de pagină și wordmark-ul. Niciodată
  pentru text curent, butoane, etichete sau cifre. (`<h1>` îl ia automat.)
- Orice sumă, procent sau numărătoare dintr-un tabel, card sau coloană:
  `tabular-nums` (e pus global pe `body`).

## Culori (tokeni)

| grup | tokeni |
|---|---|
| suprafețe | `paper-2` fundal app · `paper-1` benzi/hover/subsol · `paper-0` carduri |
| linii | `line-1` separator rânduri · `line-2` contur card/input · `line-3` contur tare, buton fantomă |
| text | `ink-1` principal · `ink-2` secundar · `ink-3` etichete (minimul pentru text cu informație) · `ink-4` DOAR decor |
| accent | `accent`, `accent-hover`, `accent-active`, `accent-ink`, `accent-soft`, `focus-ring` |
| pozitiv | `pos`, `pos-fill`, `pos-bg`, `pos-pill` |
| atenție | `warn`, `warn-fill`, `warn-bg`, `warn-pill`, `warn-soft` |
| negativ | `neg`, `neg-fill`, `neg-bg`, `neg-pill` |
| informativ | `info`, `info-fill`, `info-bg` |
| grafice | `chart-ink`, `cat-1..5`, `grid` |
| controale | `track`, `tick`, `progress-neutral`, `segment` |

**Semantica, fără excepții:** verde = bani câștigați, aprobat, conform planului,
acțiunea principală. Chihlimbar = în așteptare, de urmărit, în urmă. Roșu =
pierdem bani, respins, depășit. Orice altceva rămâne neutru. Culoarea e
informație, niciodată decor. Un singur moment de culoare pe zonă: dacă un card
are o cifră verde, restul cardului tace.

## Spațiu, colțuri, umbre, mișcare

- Spațiu: multipli de 4px (scara Tailwind implicită).
- Colțuri: `rounded-chip` 8px · `rounded-btn` 10px · `rounded-card` 16px ·
  `rounded-full` pastile. Nimic peste 16px în afară de pastile.
- Umbre: `shadow-e1` carduri · `shadow-e2` popover/hover · `shadow-seg` segment.
  Niciodată umbre colorate, niciodată gradient sau glow.
- Mișcare: 120ms pentru hover, 180ms pentru apariții, 260ms pentru sertare, cu
  `ease-std`. Cardurile apăsabile se ridică 1px la hover. Fără animații de
  intrare pe date, fără numere care „numără" până la valoare.

## Scara tipografică

| rol | font | clasă | greutate |
|---|---|---|---|
| titlu de pagină | serif | `text-[clamp(24px,2.2vw,31px)]` | 400 |
| cifră mare | sans | `text-stat` (28px) | 700 |
| cifră de detaliu | sans | `text-stat-sm` (21px) | 700 |
| titlu de card | sans | `text-card` (13,5px) | 600 |
| subtitlu de card | sans | `text-sub` (11,5px), `text-ink-3` | 400 |
| rând / celulă | sans | `text-row` (12,5px) | 500–600 |
| antet de tabel | sans | `text-th` (10,5px) UPPERCASE `tracking-[0.07em]` `text-ink-3` | 600 |
| pastilă | sans | `text-pill` (11px) | 600 |
| meta | sans | `text-meta` (10,5px) `text-ink-4` | 500 |

Greutatea 700 e rezervată cifrelor și numelor. Nu se îngroașă propoziții întregi.

## Cifre (src/lib/format.ts — singurul loc unde se formatează un număr)

- Tabele și orice verifică un contabil: `lei(n)` → „2.482.395 lei".
- Carduri și cifre mari: `compact(n)` → „2,48M" de la un milion, „431k" de la
  zece mii; sub 10.000 numărul rămâne întreg („5.200"). Abatere conștientă de la
  sistemul original: în lei, sumele de patru cifre sunt curente, iar „5k" pierde
  exact precizia care contează.
- Procente: `pct(f)` → ÎNTOTDEAUNA o zecimală, „4,0%".
- Diferența față de plan: `puncte(p)` → „−1,2 pt", cu semn, colorată după sens.
- Minusul e „−" (U+2212), nu cratimă — `num()` îl pune singur.
- Date în interfață: `dataRo` → „6 iul. 2026", `dataScurt` → „6 iul.".
- Valoarea lipsă: `0` sau `DASH` („–"). Niciodată gol.

## Piese (src/components/ui.tsx)

`Card` (titlu/subtitlu/acțiune opționale, se ridică la hover dacă are `onClick`) ·
`StatCard` (etichetă → cifră → pastile → notă; `hero` pentru Dashboard) · `Pill`,
`NeutralPill`, `KpiPill`, `StatusPill` · `PrimaryButton`, `GhostButton`,
`DangerButton`, `BackLink` · `SegmentedControl` · `ProgressBar`, `MarginRail`
(componenta semnătură: real față de reperul de plan) · `WhatIfStrip` (a doua
semnătură: „dacă intră variația, marja devine X") · `TableHead`, `TableRow`,
`TableFooter` · `Skeleton`, `StatCardSkeleton`, `EmptyState`, `ErrorStrip` ·
`Modal`. Din `Shell.tsx`: `Sidebar`, `PageHeader`, `lunaCurenta`.

## Stări (aici cad aplicațiile vii)

- **Încărcare:** schelete (`Skeleton`) cu forma componentei, nu spinner peste tot.
  Cifrele nu clipesc de la 0 la valoarea reală.
- **Gol:** fără ilustrații — titlu, o propoziție, o acțiune (`EmptyState`).
- **Eroare:** bandă în linie (`ErrorStrip`), o propoziție simplă + „Încearcă din
  nou". Fără toast pentru erori de date.

## Tabele

Fără linii verticale, fără zebră. Separator `line-1`, celule 12px/20px, sumele la
dreapta și tabulare, rândurile apăsabile se luminează la hover (`paper-1`),
subsolul e `paper-1` cu bordură sus `line-2`. Pe ecran îngust tabelul derulează
orizontal cu prima coloană lipită.

## Grafice

Linia de valoare `pos-fill` 2,4px, linia de cost `chart-ink` 2px, spațiul dintre
ele umplut cu verde translucid. Caroiaj `grid`, etichetele axelor 9px `ink-4`.
Liniile de plan punctate, `tick`. Ordinea și culorile categoriilor, mereu
aceleași: `cat-1` Materiale, `cat-2` Manoperă, `cat-3` Subcontractori,
`cat-4` Utilaje, `cat-5` Organizare.

## Responsiv

Praguri 1120px și 900px. Sub 1120px grilele de carduri trec pe o coloană (cifrele
pe două, apoi una). Sub 900px bara laterală devine bandă de sus cu sertar de
280px. Ținta de atingere minimă 40px. Fără mod întunecat deocamdată.

## Interzis

Gradienți, glow, umbre colorate, mod întunecat. Albastrul/indigo/slate/gray
implicit din Tailwind și orice gri rece. Negru pur. Alte fonturi. Serif în afara
titlurilor. Zebră în tabele, linii verticale, colțuri peste 16px (în afară de
pastile). Emoji ca iconițe. Animații de intrare, parallax, numere care numără.

## Gata înseamnă

1. Zero hex în componente — totul din tokeni.
2. Toate sumele și procentele tabulare și în formatele de mai sus.
3. Fiecare element interactiv are hover și `:focus-visible`.
4. Textul cu informație stă între `ink-1` și `ink-3` (sau o culoare semantică).
5. Fiecare zonă asincronă are schelet; listele au stare goală și stare de eroare.
6. Verificat la 1280, 1024, 768 și 390 lățime.
7. Ruta `/styleguide` arată tokenii, scara de text și fiecare piesă în toate stările.
