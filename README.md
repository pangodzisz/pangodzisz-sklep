# Sklep Pan Godzisz — wersja z serwerem (zmiany widoczne dla wszystkich)

## Co się zmieniło
Wcześniej zmiany zapisywane przez zarządcę trafiały tylko do przeglądarki (localStorage).
Teraz strona ma **prawdziwy serwer** (Node.js), który:
- przechowuje treść strony i listę produktów w pliku `data.json`
- przechowuje przesłane zdjęcia (logo, produkty) w folderze `uploads/`
- pozwala się zalogować jako zarządca i zapisać zmiany **dla wszystkich odwiedzających**

## Struktura plików
```
pangodzisz/
├── server.js          ← serwer (logika backendu)
├── package.json       ← lista zależności
├── data.json           ← treść strony (auto-tworzony/aktualizowany)
├── public/
│   └── index.html     ← cała strona (frontend)
└── uploads/            ← tu trafiają przesłane zdjęcia
```

## Jak uruchomić lokalnie (na swoim komputerze)

1. Zainstaluj [Node.js](https://nodejs.org) (wersja 18 lub nowsza), jeśli jeszcze nie masz.
2. Otwórz terminal w folderze `pangodzisz`.
3. Zainstaluj zależności:
   ```
   npm install
   ```
4. Uruchom serwer:
   ```
   npm start
   ```
5. Otwórz w przeglądarce: `http://localhost:3000`

## Dane logowania (zmień je przed publikacją!)

Domyślnie:
- login: `admin`
- hasło: `godzisz123`

Aby je zmienić, najlepiej ustaw zmienne środowiskowe przed startem serwera, np.:
```
ADMIN_USER=zarzadca ADMIN_PASS=MojeSilneHaslo123 npm start
```
Albo edytuj wartości domyślne na początku pliku `server.js` (zmienne `ADMIN_USER` i `ADMIN_PASS`).

## Jak opublikować stronę w internecie

Masz kilka prostych opcji hostingowych, które obsługują aplikacje Node.js (każda ma darmowy plan startowy):

- **Render.com** — wgrywasz folder / podłączasz repozytorium GitHub, klikasz "Deploy"
- **Railway.app** — podobnie, bardzo proste wdrożenie z GitHuba
- **Fly.io** — trochę bardziej techniczne, ale stabilne i darmowe na start

Ogólny proces dla każdej z tych platform:
1. Wgraj ten folder do repozytorium na GitHub (lub bezpośrednio przez ich panel).
2. Platforma sama wykryje `package.json` i odpali `npm install && npm start`.
3. Ustaw zmienne środowiskowe `ADMIN_USER` i `ADMIN_PASS` w panelu hostingu (zakładka "Environment Variables" / "Secrets").
4. Po wdrożeniu otrzymasz publiczny adres np. `https://pangodzisz.onrender.com`.

⚠️ Ważne: foldery `uploads/` i plik `data.json` powinny być zapisywane na **trwałym dysku** (persistent disk/volume).
Na darmowych planach niektórych platform pliki mogą się czyścić po restarcie serwera — jeśli planujesz realny sklep,
warto dopytać wybranego hostingodawcę o "persistent storage" lub rozważyć przechowywanie danych w bazie (np. PostgreSQL),
co mogę dla Ciebie przygotować w kolejnym kroku.

## Co dalej możesz rozwinąć
- prawdziwe płatności online (np. integracja z Stripe / PayU / Przelewy24)
- wysyłka e-maili z potwierdzeniem zamówienia
- panel z listą złożonych zamówień dla zarządcy
- własna domena (np. pangodzisz.pl) podłączona do hostingu
