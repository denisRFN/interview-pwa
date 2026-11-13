const app = document.querySelector('#app');
const template = document.querySelector('#question-template');
const storeKey = 'helpdesk-interview-lab-progress-v2';

const state = {
  questions: [],
  progress: loadProgress(),
  activePool: [],
  active: null,
  deferredInstall: null
};

const categories = {
  php: 'PHP', auth: 'Auth & sesiuni', mysql: 'MySQL/PDO', security: 'Securitate',
  crud: 'CRUD', js: 'JavaScript/fetch', htmlcss: 'HTML/CSS', architecture: 'Arhitectura',
  debugging: 'Debugging', project: 'Proiect HelpDesk', web: 'Web'
};

init();

async function init() {
  state.questions = await fetch('data/questions.json').then(r => r.json());
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredInstall = event;
    const button = document.querySelector('#install-btn');
    button.hidden = false;
    button.onclick = () => state.deferredInstall?.prompt();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
  if (!location.hash) location.hash = '#/quiz';
  render();
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { return {}; }
}

function saveProgress() {
  localStorage.setItem(storeKey, JSON.stringify(state.progress));
}

function record(id) {
  return state.progress[id] || { attempts: 0, correct: 0, confidence: 0, due: 0, interval: 1, last: 0 };
}

function saveAnswer(question, isCorrect, confidence = 'good') {
  const rec = record(question.id);
  const factor = confidence === 'easy' ? 3 : confidence === 'hard' ? 1.25 : 2;
  rec.attempts += 1;
  rec.correct += isCorrect ? 1 : 0;
  rec.confidence = Math.max(0, Math.min(100, rec.confidence + (isCorrect ? 18 : -18)));
  rec.interval = isCorrect ? Math.max(1, Math.round(rec.interval * factor)) : 1;
  rec.due = Date.now() + rec.interval * 24 * 60 * 60 * 1000;
  rec.last = Date.now();
  state.progress[question.id] = rec;
  saveProgress();
}

function stats() {
  const records = Object.values(state.progress);
  const attempted = records.filter(r => r.attempts > 0).length;
  const correct = records.reduce((n, r) => n + r.correct, 0);
  const attempts = records.reduce((n, r) => n + r.attempts, 0);
  const mastered = records.filter(r => r.confidence >= 75).length;
  const due = state.questions.filter(q => record(q.id).attempts > 0 && record(q.id).due <= Date.now()).length;
  return { attempted, correct, attempts, mastered, due, accuracy: attempts ? Math.round(correct / attempts * 100) : 0 };
}

function route() {
  return (location.hash.replace('#/', '') || 'quiz').split('/')[0];
}

function render() {
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#/${route()}`));
  const pages = { dashboard, quiz, code: codeMode, review, cheatsheet };
  (pages[route()] || quiz)();
  app.focus({ preventScroll: true });
}

function dashboard() {
  app.innerHTML = `
    <section class="panel simple-hero">
      <p class="eyebrow">Invatare rapida</p>
      <h1>Grila pentru interviul HelpDesk Mini</h1>
      <p class="lead">Interfata e gandita ca un manual activ: alegi raspunsul, vezi imediat explicatia si treci mai departe. Intrebarile cu cod apar in acelasi flux.</p>
      <div class="actions"><a class="btn primary" href="#/quiz">Incepe grila</a><a class="btn" href="#/code">Doar cod</a></div>
    </section>
    <section class="grid compact-stats">
      ${statCard('Intrebari', state.questions.length)}${statCard('Incercate', s.attempted)}${statCard('Acuratete', `${s.accuracy}%`)}${statCard('De revazut', s.due)}
    </section>`;
}

function statCard(label, value) {
  return `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`;
}

function quiz() {
  renderStudyShell('Grila de invatat', 'Alege categoria si raspunde. Toate intrebarile devin grila, inclusiv cele care initial aveau raspuns liber.', state.questions);
}

function codeMode() {
  const pool = state.questions.filter(q => q.snippet || q.type === 'code' || /cod|snippet|functie|query|fetch|class|pdo/i.test(`${q.title} ${q.prompt}`));
  renderStudyShell('Grila cu exemple de cod', 'Focalizare pe intrebari unde trebuie sa citesti cod PHP, JS, SQL sau OOP si sa explici ce se intampla.', pool);
}

function renderStudyShell(title, description, initialPool) {
  const s = stats();
  app.innerHTML = `
    <section class="study-layout">
      <aside class="panel study-side">
        <p class="eyebrow">${title}</p>
        <h1>${title}</h1>
        <p>${description}</p>
        <div class="mini-stats">
          <span><strong>${state.questions.length}</strong> total</span>
          <span><strong>${s.accuracy}%</strong> acuratete</span>
          <span><strong>${s.due}</strong> review</span>
        </div>
        <div class="toolbar vertical">
          <label>Categorie<select id="category"><option value="all">Toate</option>${Object.entries(categories).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Set<select id="set"><option value="all">Tot</option><option value="project">Doar proiect</option><option value="concept">Concepte generale</option><option value="weak">Gresite / slabe</option></select></label>
          <button class="btn primary" id="start">Start grila</button>
          <button class="btn" id="reset">Reset progres</button>
        </div>
      </aside>
      <section class="question-zone"><div id="practice-area"></div></section>
    </section>`;
  app.querySelector('#start').onclick = () => startQuiz(initialPool);
  app.querySelector('#reset').onclick = () => { if (confirm('Stergi progresul local?')) { state.progress = {}; saveProgress(); render(); } };
  startQuiz(initialPool);
}

function startQuiz(basePool) {
  const category = app.querySelector('#category')?.value || 'all';
  const set = app.querySelector('#set')?.value || 'all';
  let pool = basePool.filter(q => category === 'all' || q.category === category);
  if (set === 'project') pool = pool.filter(q => q.id.startsWith('project-') || q.source?.includes('.php') || q.source?.includes('.js') || q.source?.includes('.sql'));
  if (set === 'concept') pool = pool.filter(q => q.id.startsWith('concept-'));
  if (set === 'weak') pool = pool.filter(q => record(q.id).attempts > 0 && record(q.id).confidence < 60);
  state.activePool = rank(pool.length ? pool : basePool);
  renderQuestion(nextQuestion());
}

function rank(pool) {
  return [...pool].sort((a, b) => score(b) - score(a));
}

function score(q) {
  const r = record(q.id);
  const unseen = r.attempts === 0 ? 55 : 0;
  const due = r.attempts > 0 && r.due <= Date.now() ? 45 : 0;
  const weak = Math.max(0, 65 - r.confidence);
  return unseen + due + weak + (q.priority || 1) * 8 + Math.random();
}

function nextQuestion() {
  state.activePool = rank(state.activePool.length ? state.activePool : state.questions);
  return state.activePool[0];
}

function nextDifferent(current) {
  const ranked = rank(state.activePool.length ? state.activePool : state.questions).filter(q => q.id !== current.id);
  return ranked[0] || current;
}

function renderQuestion(question) {
  state.active = question;
  const area = app.querySelector('#practice-area') || app;
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector('.question-meta').innerHTML = `<span class="pill">${categories[question.category] || question.category}</span><span class="pill">${question.source || 'general'}</span><span class="pill">Dificultate ${question.difficulty}/5</span>`;
  node.querySelector('.question-title').textContent = question.title;
  node.querySelector('.question-prompt').textContent = question.prompt;
  if (question.snippet) {
    node.querySelector('.snippet').hidden = false;
    node.querySelector('.snippet code').textContent = question.snippet;
  }
  const quiz = buildChoices(question);
  node.dataset.correct = JSON.stringify(quiz.correct);
  node.querySelector('.question-body').innerHTML = quiz.options.map((option, i) => `
    <label class="option">
      <input type="${quiz.multi ? 'checkbox' : 'radio'}" name="answer" value="${i}">
      <span>${escapeHtml(option)}</span>
    </label>`).join('');
  const actions = node.querySelector('.actions');
  actions.innerHTML = `<button class="btn primary" data-check>Verifica</button><button class="btn" data-reveal>Nu stiu / arata</button><button class="btn" data-next>Urmatoarea</button>`;
  actions.querySelector('[data-check]').onclick = () => checkAnswer(node, question, quiz);
  actions.querySelector('[data-reveal]').onclick = () => revealAnswer(node, question, quiz, false);
  actions.querySelector('[data-next]').onclick = () => renderQuestion(nextDifferent(question));
  area.innerHTML = '';
  area.appendChild(node);
}

function buildChoices(question) {
  if (question.options?.length) {
    return { options: question.options, correct: question.correct || [0], multi: question.type === 'multi_select' };
  }
  const correct = compactAnswer(question.answer);
  const distractors = state.questions
    .filter(q => q.id !== question.id && q.answer && (q.category === question.category || q.type === question.type))
    .map(q => compactAnswer(q.answer))
    .filter(a => a && a !== correct && a.length < 260);
  const options = shuffle([correct, ...shuffle(distractors).slice(0, 3)]).slice(0, 4);
  while (options.length < 4) options.push(['Nu este nevoie de validare server-side.', 'Cookie-urile rezolva automat securitatea.', 'Este doar o schimbare de CSS.'][options.length - 1]);
  return { options, correct: [options.indexOf(correct)], multi: false };
}

function compactAnswer(answer) {
  const text = String(answer || '').replace(/\s+/g, ' ').trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function checkAnswer(node, question, quiz) {
  const selected = [...node.querySelectorAll('input:checked')].map(input => Number(input.value));
  const correct = sameSet(selected, quiz.correct);
  saveAnswer(question, correct, correct ? 'good' : 'hard');
  revealAnswer(node, question, quiz, correct);
}

function revealAnswer(node, question, quiz, wasCorrect) {
  const selected = [...node.querySelectorAll('input:checked')].map(input => Number(input.value));
  node.querySelectorAll('.option').forEach((el, i) => {
    if (quiz.correct.includes(i)) el.classList.add('correct');
    else if (selected.includes(i)) el.classList.add('wrong');
  });
  const answer = node.querySelector('.answer-panel');
  answer.hidden = false;
  answer.innerHTML = `<strong>${wasCorrect ? 'Corect.' : 'De retinut:'}</strong><p>${escapeHtml(question.answer)}</p>${question.followup ? `<strong>Posibil follow-up:</strong><p>${escapeHtml(question.followup)}</p>` : ''}<div class="actions"><button class="btn primary" data-next>Urmatoarea intrebare</button></div>`;
  answer.querySelector('[data-next]').onclick = () => renderQuestion(nextDifferent(question));
}

function sameSet(a, b) {
  return a.length === b.length && a.every(value => b.includes(value));
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - .5);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function review() {
  const due = state.questions.filter(q => record(q.id).attempts > 0 && record(q.id).due <= Date.now());
  app.innerHTML = `<section class="panel simple-hero"><p class="eyebrow">Review</p><h1>${due.length || 'Nicio'} intrebare de revazut</h1><p class="lead">Aici apar intrebarile gresite sau cele care trebuie repetate.</p><button class="btn primary" id="start-review" ${due.length ? '' : 'disabled'}>Porneste review</button></section><section id="practice-area"></section>`;
  app.querySelector('#start-review').onclick = () => { state.activePool = rank(due); renderQuestion(due[0]); };
}

function cheatsheet() {
  const rows = cheats();
  const cats = [...new Set(rows.map(row => row[0]))];
  app.innerHTML = `
    <section class="panel simple-hero">
      <p class="eyebrow">Cheat sheet</p>
      <h1>${rows.length} formulari rapide</h1>
      <p class="lead">Rezumat mare pentru repetat inainte de interviu: proiect, PHP, MySQL, JavaScript, securitate, OOP si capcane.</p>
    </section>
    <section class="panel">
      <div class="toolbar">
        <input id="cheat-search" type="search" placeholder="Cauta: CSRF, PDO, session, JOIN...">
        <select id="cheat-category"><option value="all">Toate categoriile</option>${cats.map(cat => `<option value="${cat}">${cat}</option>`).join('')}</select>
      </div>
      <div id="cheat-count" class="notice"></div>
      <table class="table cheat-table"><thead><tr><th>Categorie</th><th>Concept</th><th>Ce spui la interviu</th></tr></thead><tbody id="cheat-body"></tbody></table>
    </section>`;
  const renderRows = () => {
    const query = app.querySelector('#cheat-search').value.trim().toLowerCase();
    const cat = app.querySelector('#cheat-category').value;
    const filtered = rows.filter(row => {
      const text = row.join(' ').toLowerCase();
      return (cat === 'all' || row[0] === cat) && (!query || text.includes(query));
    });
    app.querySelector('#cheat-count').textContent = `${filtered.length} rezultate din ${rows.length}`;
    app.querySelector('#cheat-body').innerHTML = filtered.map(row => `<tr><td><span class="pill">${escapeHtml(row[0])}</span></td><td><span class="kbd">${escapeHtml(row[1])}</span></td><td>${escapeHtml(row[2])}</td></tr>`).join('');
  };
  app.querySelector('#cheat-search').addEventListener('input', renderRows);
  app.querySelector('#cheat-category').addEventListener('change', renderRows);
  renderRows();
}

function cheats() {
  return [
    ['Proiect', 'HelpDesk Mini', 'Aplicatie PHP procedurala cu autentificare, sesiuni, CRUD tickets, notes, PDO/MySQL si AJAX pentru status/notite.'],
    ['Proiect', 'Structura', 'Fiecare fisier PHP este o pagina sau endpoint; helpers.php are functii comune, db.php conexiunea, partials UI reutilizabil.'],
    ['Proiect', 'register.php', 'Valideaza name/email/password, verifica email duplicat, hash-uieste parola si insereaza userul.'],
    ['Proiect', 'login.php', 'Cauta userul dupa email, verifica password_hash cu password_verify, regenereaza sesiunea si salveaza user_id.'],
    ['Proiect', 'logout.php', 'Goleste $_SESSION, expira cookie-ul PHPSESSID si distruge sesiunea server-side.'],
    ['Proiect', 'index.php', 'Dashboard protejat care listeaza doar tichetele userului logat, nu toate tichetele din baza.'],
    ['Proiect', 'ticket_new.php', 'Valideaza title/description, insereaza ticketul, ia lastInsertId si salveaza working notes.'],
    ['Proiect', 'ticket_view.php', 'Citeste ticketul cu id si user_id, afiseaza descrierea si notitele, include AJAX pentru status si notes.'],
    ['Proiect', 'ticket_edit.php', 'Incarca si actualizeaza ticketul doar daca apartine userului curent.'],
    ['Proiect', 'ticket_delete.php', 'Sterge prin POST cu id si user_id; corect ca ownership, dar lipseste CSRF token.'],
    ['Proiect', 'status_update.php', 'Endpoint JSON pentru fetch; valideaza login, metoda POST, status allowlist si ownership.'],
    ['Proiect', 'ticket_note_add.php', 'Endpoint JSON pentru adaugare nota; trebuie sa valideze ticket ownership inainte de insert.'],
    ['Proiect', 'schema.sql', 'Defineste users, tickets, ticket_notes, foreign keys, cascade, indexuri si ENUM pentru status.'],
    ['Proiect', 'seed.sql', 'Date demo pentru testare locala; nu este schema, ci populare initiala.'],
    ['Proiect', 'config.php', 'Config local DB; in productie credentialele nu se pun hardcodat in repository.'],
    ['Proiect', 'partials', 'Bucati de UI reutilizabile precum nav si theme toggle, ca sa nu duplici markup.'],
    ['Proiect', 'assets/app.js', 'Leaga status dropdowns de fetch POST catre status_update.php.'],
    ['Proiect', 'assets/notes.js', 'Trimite notite prin fetch si le adauga in DOM cu textContent.'],
    ['Proiect', 'assets/notes-staged.js', 'Tine notite temporare in client pana cand ticketul nou primeste ID.'],
    ['Proiect', 'theme-init.php', 'Seteaza tema devreme ca sa evite flash de tema gresita la incarcare.'],
    ['Proiect', 'Flow login-ticket', 'Login seteaza sesiunea; require_login protejeaza; ticket_new valideaza, insereaza ticketul, lastInsertId si notes.'],
    ['Proiect', 'Ce imbunatatesc', 'CSRF, fix rowCount, tranzactii, try/catch DB, rate limiting, config prin env, teste.'],

    ['PHP', 'h()', 'Wrapper peste htmlspecialchars; escape la output HTML si previne XSS pentru input de la user.'],
    ['PHP', 'ENT_QUOTES', 'Scapa si apostroful si ghilimelele; important cand afisezi input in atribute HTML.'],
    ['PHP', 'UTF-8', 'Encoding explicit pentru htmlspecialchars; evita comportamente gresite cu caractere internationale.'],
    ['PHP', '??', 'Operator null coalescing: foloseste valoarea daca exista, altfel default, ex. $_POST["email"] ?? "".'],
    ['PHP', 'trim()', 'Elimina spatii/newline la inceput si final; util ca input cu doar spatii sa nu fie acceptat.'],
    ['PHP', 'strlen()', 'Numara bytes, nu caractere Unicode; pentru Unicode corect folosesti mb_strlen.'],
    ['PHP', 'filter_var email', 'Verifica formatul emailului, dar nu garanteaza ca adresa exista sau apartine userului.'],
    ['PHP', '$_SERVER REQUEST_METHOD', 'Separi GET de POST: GET afiseaza formularul, POST proceseaza submitul.'],
    ['PHP', '$_POST', 'Date din formular POST; nu te baza pe ele fara validare server-side.'],
    ['PHP', '$_GET', 'Parametri din URL; util pentru id, filtre, cautare, dar trebuie validat/cast-uit.'],
    ['PHP', '$_SESSION', 'Stocare server-side legata de cookie-ul de sesiune; folosita pentru autentificare.'],
    ['PHP', 'session_start()', 'Incarca sesiunea curenta; trebuie apelat inainte sa citesti/scrii $_SESSION.'],
    ['PHP', 'session_status()', 'Permite sa verifici daca sesiunea este deja pornita, ca sa nu apelezi session_start repetat.'],
    ['PHP', 'session_regenerate_id(true)', 'Schimba ID-ul sesiunii dupa login si sterge ID-ul vechi; reduce session fixation.'],
    ['PHP', 'session_destroy()', 'Sterge datele sesiunii server-side, dar pentru logout complet expiri si cookie-ul.'],
    ['PHP', 'header Location', 'Trimite redirect HTTP; trebuie apelat inainte de output.'],
    ['PHP', 'exit dupa header', 'Redirectul nu opreste automat scriptul; exit opreste executia si previne scurgeri de continut.'],
    ['PHP', 'require_once', 'Include fisierul o singura data; evita redeclararea functiilor/claselor.'],
    ['PHP', '__DIR__', 'Cale absoluta catre folderul fisierului curent; face include-urile mai stabile.'],
    ['PHP', 'function return type', 'Ex. : void sau : string comunica si verifica tipul returnat.'],
    ['PHP', '?string', 'Parametrul poate fi string sau null; util pentru helperul h(?string $value).'],
    ['PHP', 'static local', 'O variabila static intr-o functie isi pastreaza valoarea intre apeluri in acelasi request.'],
    ['PHP', 'json_decode true', 'Al doilea argument true intoarce array asociativ, nu obiect stdClass.'],
    ['PHP', 'php://input', 'Citeste body-ul raw; necesar pentru JSON trimis prin fetch, unde $_POST nu este populat.'],
    ['PHP', 'json_encode', 'Transforma valori PHP in JSON pentru endpointuri; ideal verifici si erori de encoding.'],
    ['PHP', 'foreach', 'Parcurge array-uri simplu; potrivit pentru lista de erori sau notite.'],
    ['PHP', 'empty()', 'Capcana: empty("0") este true; nu il folosi daca "0" este valoare valida.'],
    ['PHP', 'isset()', 'Verifica daca variabila exista si nu este null; diferit de empty.'],
    ['PHP', '== vs ===', '=== compara strict valoarea si tipul; preferat pentru predictibilitate.'],
    ['PHP', 'try/catch', 'Prinde exceptii precum PDOException si permite mesaj controlat in loc de fatal error.'],
    ['PHP', 'password_hash', 'Creeaza hash one-way pentru parola; nu stocam parola raw.'],
    ['PHP', 'password_verify', 'Verifica parola introdusa fata de hash-ul salvat, fara sa decripteze parola.'],
    ['PHP', 'password_needs_rehash', 'Ajuta la upgrade de algoritm/cost pentru hash-uri vechi dupa login reusit.'],
    ['PHP', 'nl2br(h())', 'Mai intai escape cu h(), apoi transformi newline in br; ordinea evita XSS.'],
    ['PHP', 'var_dump temporar', 'Bun la debug local, dar nu se lasa in productie si nu afisezi date sensibile.'],

    ['MySQL/PDO', 'PDO', 'API PHP pentru acces DB; in proiect este folosit cu MySQL si prepared statements.'],
    ['MySQL/PDO', 'DSN', 'Stringul de conexiune: host, dbname, charset; charset utf8mb4 evita probleme Unicode.'],
    ['MySQL/PDO', 'ERRMODE_EXCEPTION', 'DB errors devin exceptii, nu esecuri silentioase.'],
    ['MySQL/PDO', 'FETCH_ASSOC', 'fetch intoarce array-uri cu nume de coloane, ex. $user["password_hash"].'],
    ['MySQL/PDO', 'EMULATE_PREPARES false', 'Foloseste prepared statements native in MySQL; query-ul si datele raman separate.'],
    ['MySQL/PDO', 'prepare/execute', 'Prepare defineste SQL-ul cu placeholders, execute trimite valorile.'],
    ['MySQL/PDO', 'Placeholder ?', 'Valorile se pun in execute in aceeasi ordine cu semnele ?.'],
    ['MySQL/PDO', 'lastInsertId', 'Ia ID-ul auto_increment generat de ultimul INSERT pe conexiunea curenta.'],
    ['MySQL/PDO', 'rowCount UPDATE', 'Poate fi 0 daca valoarea nu s-a schimbat; nu inseamna mereu ca randul lipseste.'],
    ['MySQL/PDO', 'Transaction', 'beginTransaction/commit/rollBack fac operatiile atomice: toate reusesc sau niciuna.'],
    ['MySQL/PDO', 'SQLSTATE 23000', 'Integrity constraint violation, ex. duplicate email pe UNIQUE KEY.'],
    ['MySQL/PDO', 'Primary key', 'Identifica unic fiecare rand, de obicei id auto increment.'],
    ['MySQL/PDO', 'Foreign key', 'Leaga o coloana de alta tabela si mentine integritatea relationala.'],
    ['MySQL/PDO', 'ON DELETE CASCADE', 'Sterge automat copiii cand parintele este sters; util, dar poate fi periculos accidental.'],
    ['MySQL/PDO', 'UNIQUE KEY email', 'Garanteaza ca nu exista doua conturi cu acelasi email, chiar si in race conditions.'],
    ['MySQL/PDO', 'INDEX user_id', 'Accelereaza query-uri precum SELECT tickets WHERE user_id = ?.'],
    ['MySQL/PDO', 'INDEX status', 'Ajuta filtrari/rapoarte dupa status, dar indexurile au cost la scrieri.'],
    ['MySQL/PDO', 'ENUM', 'Limiteaza valorile posibile in DB; rigid daca lista se schimba des.'],
    ['MySQL/PDO', 'VARCHAR vs TEXT', 'VARCHAR pentru campuri scurte/limitate, TEXT pentru continut lung.'],
    ['MySQL/PDO', 'TIMESTAMP default', 'Baza poate seta created_at automat cu CURRENT_TIMESTAMP.'],
    ['MySQL/PDO', 'ON UPDATE timestamp', 'Actualizeaza updated_at cand randul se modifica.'],
    ['MySQL/PDO', 'InnoDB', 'Engine care suporta tranzactii si foreign keys.'],
    ['MySQL/PDO', 'JOIN', 'Combina randuri din tabele diferite pe o conditie comuna.'],
    ['MySQL/PDO', 'LEFT JOIN', 'Pastreaza toate randurile din stanga chiar daca nu exista potrivire in dreapta.'],
    ['MySQL/PDO', 'WHERE vs HAVING', 'WHERE filtreaza randuri inainte de agregare; HAVING filtreaza grupuri dupa agregare.'],
    ['MySQL/PDO', 'COUNT(*)', 'Numara randuri; COUNT(col) nu numara valorile NULL.'],
    ['MySQL/PDO', 'LIKE', 'Cautare cu wildcard % si _; foloseste prepared statements si pentru LIKE.'],
    ['MySQL/PDO', 'EXPLAIN', 'Arata planul query-ului si indexurile folosite; util la optimizare.'],
    ['MySQL/PDO', 'N+1 query', 'Un query initial plus cate unul per rand; se evita cu JOIN sau batch query.'],
    ['MySQL/PDO', 'Normalization', 'Separi datele in tabele relationale ca sa reduci duplicarea si inconsistentele.'],

    ['Securitate', 'SQL injection', 'Inputul modifica SQL-ul; prepared statements previn asta.'],
    ['Securitate', 'XSS', 'Inputul devine HTML/JS executabil in browser; previi cu escaping/textContent.'],
    ['Securitate', 'CSRF', 'Browserul userului logat este pacalit sa trimita request; previi cu token server-side.'],
    ['Securitate', 'IDOR', 'Userul acceseaza obiectul altuia schimband id; previi cu ownership check in query.'],
    ['Securitate', 'Auth vs Authorization', 'Auth = cine esti; authorization = ce ai voie sa accesezi.'],
    ['Securitate', 'User enumeration', 'Mesaje diferite la login pot dezvalui ce emailuri exista.'],
    ['Securitate', 'Information disclosure', 'Nu afisa stack trace, query-uri, cai locale sau existenta resurselor altui user.'],
    ['Securitate', 'POST nu ajunge', 'POST reduce accidentele fata de GET, dar nu blocheaza CSRF.'],
    ['Securitate', 'CSRF token forms', 'Token random in sesiune, hidden input in formular, verificat cu hash_equals.'],
    ['Securitate', 'CSRF token fetch', 'Token in meta/data attribute si header X-CSRF-Token trimis de fetch.'],
    ['Securitate', 'SameSite cookie', 'Reduce trimiterea cookie-urilor cross-site; ajuta la CSRF, dar nu inlocuieste tokenul.'],
    ['Securitate', 'HttpOnly cookie', 'JavaScript nu poate citi cookie-ul; reduce impactul XSS asupra sesiunii.'],
    ['Securitate', 'Secure cookie', 'Cookie-ul se trimite doar prin HTTPS.'],
    ['Securitate', 'Rate limiting', 'Limiteaza incercarile de login; reduce brute force.'],
    ['Securitate', 'Mass assignment', 'Nu salva tot $_POST; alege explicit campurile permise.'],
    ['Securitate', 'Allowlist', 'Accepta doar valori cunoscute, ex. statusurile Open/In Progress/On Hold/Closed.'],
    ['Securitate', 'Denylist', 'Lista de valori interzise; mai fragila decat allowlist pentru input critic.'],
    ['Securitate', 'Output escaping', 'Escaparea se face la afisare, in contextul potrivit: HTML, atribut, JS, URL.'],
    ['Securitate', 'Input validation', 'Verifici forma si limitele datelor la intrarea pe server.'],
    ['Securitate', 'Secrets in repo', 'Credentialele DB/API nu se commituiesc; folosesti env vars sau secret manager.'],

    ['JavaScript', 'fetch', 'Trimite request asincron; returneaza Promise.'],
    ['JavaScript', 'response.ok', 'True pentru status HTTP 2xx; fetch nu intra automat in catch la 404.'],
    ['JavaScript', 'response.json()', 'Parseaza body-ul ca JSON si returneaza Promise.'],
    ['JavaScript', 'JSON.stringify', 'Transforma obiect JS in string JSON pentru request body.'],
    ['JavaScript', 'credentials same-origin', 'Trimite cookie-urile catre acelasi origin, inclusiv PHPSESSID.'],
    ['JavaScript', 'addEventListener', 'Ataseaza comportament fara inline JS si permite cod mai curat.'],
    ['JavaScript', 'preventDefault', 'Opreste comportamentul implicit, ex. submit cu reload.'],
    ['JavaScript', 'querySelectorAll', 'Gaseste toate elementele care potrivesc selectorul CSS.'],
    ['JavaScript', 'dataset', 'Atributele data-* devin proprietati camelCase, ex. data-ticket-id -> dataset.ticketId.'],
    ['JavaScript', 'textContent', 'Insereaza text sigur, nu interpreteaza HTML.'],
    ['JavaScript', 'innerHTML', 'Interpreteaza HTML; periculos cu input user nesanitizat.'],
    ['JavaScript', 'classList', 'Adauga/sterge clase CSS dinamic, ex. status-open/status-closed.'],
    ['JavaScript', 'setTimeout', 'Ruleaza cod dupa un delay; folosit pentru stergerea mesajului Saved.'],
    ['JavaScript', 'catch fetch', 'Prinde erori de retea sau Promise reject, nu orice status HTTP.'],
    ['JavaScript', 'Promise', 'Reprezinta rezultat viitor: resolved sau rejected.'],
    ['JavaScript', 'async/await', 'Sintaxa mai lizibila peste Promise; folosesti try/catch pentru erori.'],
    ['JavaScript', 'let/const', 'const pentru binding nereasignat, let pentru variabile reasignabile; evita var in cod modern.'],
    ['JavaScript', '===', 'Comparatie stricta; evita conversii ciudate de tip.'],
    ['JavaScript', 'truthy/falsy', 'Valori precum false, 0, "", null, undefined, NaN sunt falsy; [] si {} sunt truthy.'],
    ['JavaScript', 'localStorage', 'Persistenta locala string-only; buna pentru preferinte/progres, nu pentru secrete.'],
    ['JavaScript', 'Service worker', 'Poate cache-ui fisiere si face aplicatia disponibila offline.'],
    ['JavaScript', 'PWA manifest', 'Descrie nume, icon, start_url si display pentru instalare.'],
    ['JavaScript', 'Debounce', 'Amana executia pana userul se opreste; util la search live.'],
    ['JavaScript', 'Event delegation', 'Listener pe parinte pentru elemente copil, util la liste dinamice.'],

    ['HTML/CSS', 'label for', 'Leaga label de input; imbunatateste accesibilitatea si UX.'],
    ['HTML/CSS', 'required', 'Ajuta validarea in browser, dar nu inlocuieste validarea server-side.'],
    ['HTML/CSS', 'novalidate', 'Dezactiveaza validarea nativa pentru mesaje controlate de backend.'],
    ['HTML/CSS', 'type=email', 'Ajuta browserul sa valideze formatul si sa ofere tastatura potrivita pe mobil.'],
    ['HTML/CSS', 'hidden input', 'Camp invizibil pentru user, dar modificabil; serverul trebuie sa il valideze.'],
    ['HTML/CSS', 'Semantic HTML', 'header/nav/main/table comunica structura si ajuta accesibilitatea.'],
    ['HTML/CSS', 'aria-live', 'Bun pentru mesaje dinamice precum Saved/Error, ca screen readerul sa le anunte.'],
    ['HTML/CSS', 'CSS variables', 'Design tokens reutilizabile pentru culori, spacing si dark mode.'],
    ['HTML/CSS', 'Specificity', 'Regula mai specifica sau mai tarzie poate suprascrie stilul asteptat.'],
    ['HTML/CSS', 'Flex vs Grid', 'Flex pentru o axa; Grid pentru randuri si coloane.'],
    ['HTML/CSS', 'Responsive', 'Verifici mobil: nav, formulare, tabele, panouri si butoane usor de apasat.'],
    ['HTML/CSS', 'FOUC', 'Flash of unstyled/incorrect content; theme-init reduce flash-ul de tema.'],

    ['OOP PHP', 'Class', 'Blueprint pentru obiecte; defineste proprietati si metode.'],
    ['OOP PHP', 'Object', 'Instanta concreta a unei clase, cu stare proprie.'],
    ['OOP PHP', '__construct', 'Metoda apelata automat la crearea obiectului; seteaza dependinte/stare initiala.'],
    ['OOP PHP', 'public/private/protected', 'Controleaza accesul: oriunde / doar clasa / clasa si subclase.'],
    ['OOP PHP', 'Encapsulation', 'Ascunzi detaliile interne si expui metode clare.'],
    ['OOP PHP', 'Inheritance', 'O clasa copil extinde o clasa parinte; util, dar poate crea cuplare.'],
    ['OOP PHP', 'Interface', 'Contract de metode; clase diferite pot implementa acelasi comportament.'],
    ['OOP PHP', 'Abstract class', 'Clasa partial implementata care nu se instantiaza direct.'],
    ['OOP PHP', 'Polymorphism', 'Codul foloseste un contract comun, indiferent de implementarea concreta.'],
    ['OOP PHP', 'Dependency Injection', 'Primesti dependintele din exterior; cod mai testabil si mai putin cuplat.'],
    ['OOP PHP', 'Repository', 'Clasa care izoleaza query-urile DB pentru o entitate, ex. TicketRepository.'],
    ['OOP PHP', 'Service layer', 'Contine logica de business, ex. creare ticket cu notes in tranzactie.'],
    ['OOP PHP', 'MVC', 'Model date/logica, View afisare, Controller coordoneaza requestul.'],
    ['OOP PHP', 'DTO', 'Obiect simplu pentru transfer de date validate intre straturi.'],
    ['OOP PHP', 'Static methods', 'Utile pentru helperi simpli, dar prea multe fac codul greu de testat.'],

    ['Debugging', 'Pagina alba PHP', 'Verifica error logs, error_reporting local, sintaxa, include paths si conexiunea DB.'],
    ['Debugging', 'Headers already sent', 'Exista output inainte de header/setcookie; verifica spatii, BOM, echo accidental.'],
    ['Debugging', 'Login nu ramane', 'Verifica session_start, cookie PHPSESSID, setarea $_SESSION si redirectul.'],
    ['Debugging', 'DB connection failed', 'Verifica MySQL pornit, host, DB_NAME, user/parola si extensia PDO MySQL.'],
    ['Debugging', 'AJAX 401', 'User nelogat sau cookie-ul de sesiune nu este trimis.'],
    ['Debugging', 'AJAX 405', 'Metoda HTTP gresita; endpointul asteapta POST.'],
    ['Debugging', 'AJAX 422', 'Date invalide, ex. status care nu este in allowlist.'],
    ['Debugging', 'AJAX 404', 'Resursa lipsa sau nu apartine userului; uneori mesaj intentionat generic.'],
    ['Debugging', 'JSON parse error', 'Endpointul a returnat HTML/warning/fatal error in loc de JSON.'],
    ['Debugging', 'Network tab', 'Verifici URL, metoda, status, payload, response si cookies.'],
    ['Debugging', 'Console tab', 'Verifici erori JS, promise rejections si selectorii DOM.'],
    ['Debugging', 'Repro steps', 'Pentru bug bun ai pasi clari, date de test, rezultat asteptat si rezultat actual.'],

    ['Capcane', 'empty("0")', 'In PHP este true; poate respinge gresit valoarea 0.'],
    ['Capcane', 'fetch 404', 'Nu intra automat in catch; verifici response.ok.'],
    ['Capcane', 'rowCount UPDATE', '0 randuri afectate poate insemna valoare identica, nu ticket lipsa.'],
    ['Capcane', 'POST = secure', 'Fals. POST nu protejeaza automat de CSRF.'],
    ['Capcane', 'Client validation', 'Fals ca e suficienta. Oricine poate trimite request manual.'],
    ['Capcane', 'addslashes SQL', 'Nu este solutia corecta anti SQL injection; foloseste prepared statements.'],
    ['Capcane', 'innerHTML rapid', 'Rapid, dar periculos cu date user. textContent este alegerea sigura.'],
    ['Capcane', 'Index pe orice', 'Indexurile ajuta citiri, dar costa spatiu si incetinesc scrieri.'],
    ['Capcane', 'Hash = encryption', 'Fals. Hash-ul nu se decripteaza; verifici cu password_verify.'],
    ['Capcane', 'GET pentru delete', 'Gresit. GET ar trebui sa fie safe; delete prin POST + CSRF.'],
    ['Capcane', 'Escaping la input', 'Nu ajunge. Escape-ul corect se face la output in contextul potrivit.'],
    ['Capcane', 'GitHub Pages PHP', 'GitHub Pages nu executa PHP/MySQL; ruleaza doar static HTML/CSS/JS.'],

    ['Raspunsuri interviu', 'Nu stiu', 'Spun sincer ca nu sunt sigur, explic rationamentul si cum as verifica in documentatie/test local.'],
    ['Raspunsuri interviu', 'De ce PHP procedural', 'Pentru proiect mic/junior e clar si arata fundamentele; la scara mai mare l-as muta spre MVC/OOP.'],
    ['Raspunsuri interviu', 'Cum citesti cod necunoscut', 'Identific scop fisier, setup, metoda HTTP, input validation, query DB, output si securitate.'],
    ['Raspunsuri interviu', 'Junior mindset', 'Nu inventez. Arat ca inteleg baza, pun intrebari bune si pot depana metodic.']
  ];
}
