# CL-Class ohjekirja

Mercedes-Benz CL-Class (2008) -käyttöohje suomeksi (769 sivua). Selattava verkkosivu — ei ääneen lukemista.

## Käyttö puhelimella / selaimella

Avaa vain linkki — ei asennusta, ei palvelinta, ei tiedoston latausta:

**https://thebig8.github.io/cl-class-ohjekirja/**

(Repo: [TheBig8/cl-class-ohjekirja](https://github.com/TheBig8/cl-class-ohjekirja))

Voit lisätä sivun Koti-valikkoon (Jaa → Lisää Koti-valikkoon), jos haluat kuvakkeen.

## Käyttö

- **Haku** — esim. `akku`, `ilmastointi`, `COMAND`
- **Suomi | Alkuperäinen** — sama sivunumero; Alkuperäinen = paikallinen PDF-sivu (`data/original/`)
- **Sivuvalitsin** — kaikki sivut 1–769

## Kehitys (vain paikallinen kopio)

Jos kloonaat repon Macille, älä avaa `index.html`-tiedostoa suoraan (`file://`) — selain estää JSON-lataukset. Käynnistä sen sijaan paikallinen palvelin projektikansiossa:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

- **Mac:** http://127.0.0.1:8080  
- **Puhelin samassa Wi‑Fissä:** `http://<Macin-LAN-IP>:8080`

Tätä ei tarvita, jos käytät GitHub Pages -osoitetta.

## Rakenne

```
index.html / app.js / styles.css
data/meta.json
data/pages/*.json      # suomennetut sivut
data/pages-bundle.json # nopea yksittäislataus
data/original/         # PDF-sivujen HTML + assets
data/raw/*.json        # raaka englanti
scripts/fetch-batch.mjs
```

## Huomio

Henkilökohtaiseen käyttöön. Alkuperäinen materiaali © Mercedes-Benz / lähdesivusto.
