# CL-Class ohjekirja

Paikallinen / verkossa toimiva suomenkielinen lukija Mercedes-Benz CL-Class (2008) -käyttöohjeelle (769 sivua).

## GitHub Pages

Julkaistu osoitteessa:

**https://thebig8.github.io/cl-class-ohjekirja/**

(Repo: [TheBig8/cl-class-ohjekirja](https://github.com/TheBig8/cl-class-ohjekirja))

## Käynnistys paikallisesti

```bash
python3 -m http.server 8080 --bind 0.0.0.0
```

- **Mac:** http://127.0.0.1:8080  
- **Puhelin (sama Wi‑Fi):** `http://<Macin-LAN-IP>:8080`

## Käyttö

- **Haku** — esim. `akku`, `ilmastointi`, `COMAND`
- **Suomi | Alkuperäinen** — sama sivunumero; Alkuperäinen = paikallinen PDF-sivu (`data/original/`), ei koko kayttooh.je-sivustoa
- **Sivuvalitsin** — kaikki sivut 1–769

## Rakenne

```
index.html / app.js / styles.css
data/meta.json
data/pages/*.json      # suomennetut sivut
data/original/         # PDF-sivujen HTML + assets
data/raw/*.json        # raaka englanti
scripts/fetch-batch.mjs
```

## Huomio

Henkilökohtaiseen käyttöön. Alkuperäinen materiaali © Mercedes-Benz / lähdesivusto.
