# Gin Tonici F.C. – sito della squadra

Sito statico + piccole funzioni Netlify per salvare i contenuti (Netlify Blobs).
Indirizzo gratuito del tipo `gintonicifc.netlify.app`.

## Pubblicazione (una volta sola, ~10 minuti)

1. **GitHub**: crea un account gratuito su github.com (se non ce l'hai) e un nuovo repository, per esempio `gintonici-fc` (privato va benissimo).
2. Nel repository clicca **Add file → Upload files** e trascina **tutto il contenuto** di questa cartella (`public`, `netlify`, `netlify.toml`, `package.json`, `README.md`). Poi **Commit changes**.
3. **Netlify**: crea un account gratuito su netlify.com accedendo con GitHub.
4. **Add new project → Import an existing project → GitHub** e scegli il repository. Lascia le impostazioni proposte (vengono lette da `netlify.toml`) e premi **Deploy**.
5. Su Netlify, in **Project configuration → Environment variables**, aggiungi:
   - chiave `ADMIN_PASSWORD`, valore: la password che vuoi usare per l'area Admin.
6. Vai su **Deploys → Trigger deploy → Deploy project** perché la password venga letta.
7. In **Project configuration → Change project name** scegli il nome: diventerà `nome.netlify.app`.

## Aggiornamento automatico

Calendario, risultati, classifica e marcatori ufficiali vengono letti da
https://www.areasport.org/calendario/969/42 (impostabile in Admin → Impostazioni)
due volte al giorno (circa 6:30 e 23:30) dalla funzione `sync-scheduled`.
Dall'area Admin c'è anche il pulsante **Aggiorna adesso**.
Se il sito del campionato cambia struttura, resta il piano B: incollare la classifica a mano.

## Uso settimanale

Apri `https://<nome>.netlify.app/admin.html`, inserisci la password.

| Cosa | Dove |
|---|---|
| Risultato (arriva da solo) e marcatori della singola partita | scheda **Risultato** |
| Pagelle (incolla il testo) | scheda **Pagelle** |
| Classifica (arriva da sola; in alternativa si incolla) | scheda **Classifica** |
| Partite, date e orari | scheda **Calendario** |
| Giocatori, soprannomi, foto | scheda **Rosa** |
| Galleria | scheda **Foto** |
| Storia, organigramma, link esterni | scheda **Società e link** |
| Formazione della prossima partita (campo con le facce, visibile col pulsante **Formazione** in Home) | scheda **Formazione** |
| Distinta di gara della prossima partita (PDF precompilato da stampare) | pulsante **Genera distinta** in Home, sotto a Prossima partita |
| Simulazione goliardica della prossima partita (campo dall'alto, pedine della Formazione, cronaca e risultato) | pulsante **Simula partita** in Home, accanto a Formazione |
| Nome, motto, link al sito del campionato, azzeramento dati di esempio | scheda **Impostazioni** |

Il sito parte già con calendario, classifica e marcatori veri (al 30/10/2026). In **Rosa** ci sono i 7 marcatori ufficiali con ruolo "Jolly": completa la rosa con ruoli, numeri, soprannomi e foto.

### Formato pagelle

```
Titolo: Manita a domicilio
Serata perfetta, tre punti e nessuno stiramento.
Neri 6,5 - sicuro tra i pali
Conti 9 - tripletta, paga da bere fino a Natale
Bianchi sv
MVP: Conti
Flop: Costa
```

Le righe `Titolo`, `MVP`, `Flop` sono facoltative.

## Note tecniche

- Tutti i contenuti stanno in Netlify Blobs (store `gintonici`, chiave `site`); le foto nello store `gintonici-foto`.
- Il piano gratuito di Netlify ha un tetto mensile di crediti: per un sito di squadra il consumo è minimo.
- Per cambiare grafica: `public/assets/style.css` (colori in cima al file) e `public/assets/logo.svg`.
- La distinta di gara viene compilata nel browser sul modulo ufficiale `public/assets/distinta-template.pdf` (da sostituire a inizio stagione); coordinate dei campi in `public/assets/distinta.js`.
- La simulazione partita (`public/assets/simula.js`) dà un pronostico fisso per ogni partita: il punteggio dipende dall'id della partita e da classifica/risultati (gol fatti e subiti, ultime 3 giornate); marcatori e protagonisti dipendono da formazione, gol stagionali e media voto delle pagelle. Durata massima circa 2 minuti a velocità 1,5x (tasto 2x).
