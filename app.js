import { readJSON, writeJSON } from "./storage.js";
import { showView, setupNavigation } from "./navigation.js";
import { openDialog, closeDialog, toast } from "./dialogs.js";

const welcomeChat = { id: "lida-welcome", name: "LIDA", userHandle: "@lida", lastMessage: "¡Bienvenido! Estoy aquí para ayudarte a conocer LIDA.", time: "Ahora", unread: false, favorite: true, online: false, system: true };
const state = {
  chats: readJSON("lida.chats", [welcomeChat]).filter(chat => chat.id === "lida-welcome"),
  messages: { "lida-welcome": readJSON("lida.messages", { "lida-welcome": [{ text: "¡Hola! 👋 Te doy la bienvenida a LIDA. Aquí podrás descubrir la comunidad, conversar y jugar. Explora la aplicación con la guía inicial.", mine: false, time: "Ahora", system: true }] })["lida-welcome"] || [{ text: "¡Hola! 👋 Te doy la bienvenida a LIDA. Aquí podrás descubrir la comunidad, conversar y jugar. Explora la aplicación con la guía inicial.", mine: false, time: "Ahora", system: true }] },
  statuses: [],
  filter: "all",
  activeChatId: null,
  profile: readJSON("lida.profile", { name: "", handle: "", bio: "" }),
  registered: readJSON("lida.registered", false),
  guideCompleted: readJSON("lida.guideCompleted", false),
  guideSkipped: readJSON("lida.guideSkipped", false),
  guideVersion: readJSON("lida.guideVersion", 0),
  replyTo: null,
  mediaRecorder: null,
  recordingChunks: [],
  guideStep: 0,
  directory: readJSON("lida.localContacts", [])
};
if (!state.chats.some(chat => chat.id === "lida-welcome")) state.chats.unshift(welcomeChat);
if (!state.messages["lida-welcome"] || !state.messages["lida-welcome"].length) state.messages["lida-welcome"] = [{ text: "¡Hola! 👋 Te doy la bienvenida a LIDA. Aquí podrás descubrir la comunidad, conversar y jugar. Explora la aplicación con la guía inicial.", mine: false, time: "Ahora", system: true }];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
const initials = name => name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase();

function persist() {
  writeJSON("lida.chats", state.chats);
  writeJSON("lida.messages", state.messages);
  writeJSON("lida.statuses", state.statuses);
  writeJSON("lida.profile", state.profile);
  writeJSON("lida.registered", state.registered);
  writeJSON("lida.userDirectory", state.directory);
  writeJSON("lida.localContacts", state.directory);
  writeJSON("lida.guideCompleted", state.guideCompleted);
  writeJSON("lida.guideSkipped", state.guideSkipped);
  writeJSON("lida.guideVersion", state.guideVersion);
}
function renderChats() {
  const query = ($("#chat-search").value || "").toLowerCase().trim();
  const chats = state.chats.filter(chat => {
    const matchesQuery = `${chat.name} ${chat.lastMessage || ""}`.toLowerCase().includes(query);
    const matchesFilter = state.filter === "all" || (state.filter === "unread" && chat.unread) || (state.filter === "favorites" && chat.favorite);
    return matchesQuery && matchesFilter;
  });
  $("#chat-list").innerHTML = chats.map(chat => `<button class="chat-row" data-chat-id="${esc(chat.id)}">
    <span class="avatar ${chat.online ? "online-avatar" : ""}">${esc(initials(chat.name))}</span>
    <span class="chat-copy"><span class="chat-title-line"><strong>${esc(chat.name)}</strong><time>${esc(chat.time || "")}</time></span><span class="chat-preview">${chat.unread ? '<i class="unread-dot"></i>' : ""}${esc(chat.lastMessage || "Inicia una conversación")}</span></span>
    ${chat.favorite ? '<span class="favorite-mark" aria-label="Favorito">★</span>' : ""}
  </button>`).join("");
  $("#chat-empty").classList.toggle("hidden", chats.length > 0);
}
function renderConversation(chatId) {
  const chat = state.chats.find(item => item.id === chatId);
  if (!chat) return;
  state.activeChatId = chatId;
  chat.unread = false;
  $("#conversation-name").textContent = chat.name;
  $("#conversation-avatar").textContent = initials(chat.name);
  $("#conversation-status").textContent = chat.system ? "Asistente de bienvenida · local" : "Conversación local";
  const messages = state.messages[chatId] || [];
  $("#message-list").innerHTML = `<div class="date-divider"><span>HOY</span></div>` + messages.map((message, index) => `<div class="message ${message.mine ? "mine" : "theirs"}" data-message-index="${index}">${message.replyText ? `<div class="reply-quote">↳ ${esc(message.replyText)}</div>` : ""}${message.type === "voice" ? `<audio controls preload="metadata" src="${message.audio}"></audio><p>🎙 Nota de voz · ${esc(message.duration || "audio")}</p>` : `<p>${esc(message.text)}</p>`}<div class="message-tools"><time>${esc(message.time)}</time></div>${message.reaction ? `<span class="message-reaction">${esc(message.reaction)}</span>` : ""}</div>`).join("");
  $("#message-list").scrollTop = $("#message-list").scrollHeight;
  persist();
  renderChats();
  showView("conversation");
}
function sendMessage(text) {
  const trimmed = text.trim();
  if (!trimmed || !state.activeChatId) return;
  const messages = state.messages[state.activeChatId] || [];
  const time = new Date().toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
  messages.push({ text: trimmed, mine: true, time, ...(state.replyTo ? { replyText: state.replyTo.text || "Nota de voz" } : {}) });
  state.replyTo = null;
  const replyBanner = $("#reply-banner"); if (replyBanner) replyBanner.remove();
  state.messages[state.activeChatId] = messages;
  const chat = state.chats.find(item => item.id === state.activeChatId);
  if (chat) { chat.lastMessage = trimmed; chat.time = time; }
  persist();
  renderConversation(state.activeChatId);
}
function renderFriends() {
  const input = $("#friend-search");
  const query = (input?.value || "").trim().toLowerCase().replace(/^@/, "");
  const friends = state.directory.filter(person => `${person.name} ${person.handle}`.toLowerCase().includes(query));
  const list = $("#friend-list");
  const count = $("#friend-count");
  if (!list || !count) return;
  count.textContent = String(state.directory.length);
  list.innerHTML = friends.length ? friends.map(person => `<article class="friend-result"><span class="avatar">${esc(initials(person.name))}</span><div class="friend-result-copy"><strong>${esc(person.name)}</strong><small>${esc(person.handle)} · contacto local</small></div><button class="secondary-button" data-contact-chat="${esc(person.id)}">Mensaje</button><button class="icon-button" data-contact-remove="${esc(person.id)}" aria-label="Eliminar ${esc(person.name)}">×</button></article>`).join("") : `<div class="friend-empty">${query ? "No hay contactos que coincidan con la búsqueda." : "Todavía no has agregado contactos. Pulsa «Agregar persona» para guardar uno."}</div>`;
}
function openNewChat() {
  openDialog(`<p class="eyebrow">COMUNIDAD LIDA</p><h2>Agregar persona</h2><p>Guarda un contacto usando su nombre de usuario. Importante: esta versión aún no está conectada a un servidor, así que esto no envía una solicitud a otra persona ni confirma que el usuario exista.</p><label class="field-label" for="contact-name">Nombre para mostrar</label><input id="contact-name" class="dialog-input" maxlength="40" placeholder="Ej. Alex"><label class="field-label" for="contact-handle">Nombre de usuario</label><div class="username-input-wrap"><span>@</span><input id="contact-handle" class="dialog-input" maxlength="20" placeholder="usuario" autocomplete="off" autocapitalize="none" spellcheck="false"></div><p class="registration-note">El contacto se guardará solo en este navegador. La búsqueda y las solicitudes entre cuentas se activarán al conectar el backend.</p><button class="primary-button full-width" id="save-contact">Guardar contacto</button>`);
  $("#save-contact").addEventListener("click", () => {
    const name = $("#contact-name").value.trim();
    const handle = $("#contact-handle").value.trim().replace(/^@/, "").toLowerCase();
    if (!name) { toast("Escribe el nombre para mostrar."); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) { toast("El usuario debe tener entre 3 y 20 caracteres: letras, números o guion bajo."); return; }
    if (state.profile.handle && handle === state.profile.handle.replace(/^@/, "").toLowerCase()) { toast("Ese es tu propio usuario."); return; }
    if (state.directory.some(person => person.handle.toLowerCase() === `@${handle}`)) { toast("Ese contacto ya está guardado."); return; }
    state.directory.unshift({ id: `contact-${Date.now()}`, name, handle: `@${handle}`, addedAt: new Date().toISOString() });
    persist(); renderFriends(); closeDialog(); toast("Contacto guardado en este dispositivo.");
  });
}
function openRegistration() {
  openDialog(`<div class="registration-mark"><img src="./lida-logo-original.png" alt="LIDA"></div><p class="eyebrow">BIENVENIDO A LIDA</p><h2>Personaliza tu cuenta</h2><p class="muted">Crea tu perfil con nombre visible y usuario único. Esta versión guarda la cuenta en este navegador; para que el usuario sea único en todos los dispositivos y pueda recibir mensajes reales hace falta conectar un servidor.</p><label class="field-label" for="register-name">Nombre para mostrar</label><input id="register-name" class="dialog-input" maxlength="50" placeholder="Tu nombre" autocomplete="name"><label class="field-label" for="register-handle">Nombre de usuario</label><div class="username-input-wrap"><span>@</span><input id="register-handle" class="dialog-input" maxlength="20" placeholder="tu_usuario" autocomplete="username" autocapitalize="none" spellcheck="false"></div><label class="field-label" for="register-bio">Biografía (opcional)</label><textarea id="register-bio" class="dialog-input" maxlength="160" rows="2" placeholder="Cuéntale algo a la comunidad"></textarea><button class="primary-button full-width" id="complete-registration">Guardar perfil y entrar</button>`);
  $("#complete-registration").addEventListener("click", () => {
    const name = $("#register-name").value.trim();
    const handle = $("#register-handle").value.trim().replace(/^@/, "").toLowerCase();
    const bio = $("#register-bio").value.trim();
    if (!name) { toast("Escribe tu nombre para mostrar."); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) { toast("El usuario debe tener de 3 a 20 caracteres: letras, números o guion bajo."); return; }
    const accounts = readJSON("lida.localAccounts", []);
    if (accounts.some(account => account.handle === `@${handle}`)) { toast("Ese usuario ya está guardado en este navegador."); return; }
    state.profile = { name, handle: `@${handle}`, bio };
    state.registered = true;
    accounts.push({ handle: state.profile.handle, name, bio, createdAt: new Date().toISOString() });
    writeJSON("lida.localAccounts", accounts);
    persist(); renderProfile(); closeDialog(); showView("chats");
    showWelcomeToast();
    if (!state.guideCompleted && !state.guideSkipped) openGuide();
  });
}
function showWelcomeToast() {
  const element = $("#welcome-notice");
  if (!element) return;
  element.classList.add("visible");
  window.setTimeout(() => element.classList.remove("visible"), 10000);
}
function openStatusDialog() {
  openDialog(`<p class="eyebrow">COMPARTE UN MOMENTO</p><h2>Crear estado</h2><p class="muted">Este estado será una nota local de demostración.</p><textarea id="status-text" class="dialog-input" maxlength="240" rows="3" placeholder="¿Qué quieres compartir?"></textarea><button class="primary-button full-width" id="publish-status">Publicar estado</button>`);
  $("#publish-status").addEventListener("click", () => {
    const text = $("#status-text").value.trim();
    if (!text) { toast("Escribe algo para tu estado."); return; }
    state.statuses.unshift({ id: `status-${Date.now()}`, name: state.profile.name, text, time: "Ahora", own: true });
    persist(); renderStatuses(); closeDialog(); toast("Estado guardado en este dispositivo.");
  });
}
function renderStatuses() {
  $("#status-list").innerHTML = state.statuses.map(status => `<article class="status-row"><div class="status-ring"><div class="avatar">${esc(initials(status.name))}</div></div><div class="status-copy"><h3>${esc(status.name)} ${status.own ? '<span class="muted-inline">(tú)</span>' : ""}</h3><p>${esc(status.text)}</p><small>${esc(status.time || "")}</small></div></article>`).join("");
}
function openGuide() {
  const steps = [
    { target: "chats", icon: "▤", title: "Mensajes", text: "Este es el inicio de LIDA. Aquí aparecen tus conversaciones y puedes abrir cualquier chat." },
    { target: "estados", icon: "◎", title: "Comunidad", text: "Aquí agregas personas, buscas tus contactos y abres una conversación. Las solicitudes reales entre cuentas requieren el servidor de LIDA." },
    { target: "chats", icon: "▤", title: "Mensajes", text: "Encuentra tus conversaciones y escribe desde la parte inferior. Mantén presente que los mensajes se guardan localmente hasta conectar Supabase." },
    { target: "chats", icon: "↩", title: "Acciones de mensaje", text: "Mantén pulsado un mensaje para abrir el menú: reaccionar, responder, reenviar o compartir." },
    { target: "chats", icon: "🎙", title: "Notas de voz y llamadas", text: "Puedes grabar una nota de voz en este dispositivo. Las llamadas muestran el acceso, pero solo funcionarán entre personas cuando conectemos el servicio en línea." },
    { target: "play", icon: "▷", title: "Games", text: "Entra a los minijuegos disponibles. Las salas en línea, invitaciones y resultados compartidos necesitan backend." },
    { target: "profile", icon: "◌", title: "Perfil", text: "Personaliza tu nombre, nombre de usuario y biografía. Desde aquí también puedes abrir las opciones de privacidad y apariencia." },
    { target: "profile", icon: "⚙", title: "Configuración", text: "El engranaje de la esquina superior derecha abre configuración: apariencia, privacidad, ayuda y opciones de cuenta." }
  ];
  state.guideStep = Math.max(0, Math.min(state.guideStep, steps.length - 1));
  const render = () => {
    const step = steps[state.guideStep];
    if (step.target && step.target !== "chats" && step.target !== "conversation") showView(step.target); else if (step.target === "chats") showView("chats");
    $$(".nav-item").forEach(item => item.classList.toggle("tour-focus", item.dataset.target === step.target));
    const gear = $("#settings-shortcut"); if (gear) gear.classList.toggle("tour-focus", step.title === "Configuración");
    openDialog(`<div class="tour-icon">${step.icon}</div><p class="eyebrow">RECORRIDO · ${state.guideStep + 1} DE ${steps.length}</p><div class="guide-progress">${steps.map((_,i)=>`<span class="${i <= state.guideStep ? "done" : ""}"></span>`).join("")}</div><h2>${step.title}</h2><p>${step.text}</p><div class="guide-actions"><button class="secondary-button" id="guide-skip">Omitir</button><button class="primary-button" id="guide-next">${state.guideStep === steps.length - 1 ? "Terminar" : "Siguiente"}</button></div>`);
    $("#guide-skip").addEventListener("click", () => { state.guideSkipped = true; persist(); $$(".tour-focus").forEach(item => item.classList.remove("tour-focus")); closeDialog(); toast("Puedes volver a abrir el recorrido desde Perfil → Ayuda."); });
    $("#guide-next").addEventListener("click", () => {
      if (state.guideStep >= steps.length - 1) { state.guideCompleted = true; state.guideVersion = 3; persist(); $$(".tour-focus").forEach(item => item.classList.remove("tour-focus")); closeDialog(); toast("Recorrido completado."); return; }
      state.guideStep += 1; render();
    });
  };
  render();
}
function openTicTacToe() {
  let board = Array(9).fill(""); let turn = "X"; let finished = false; let moves = 0;
  const winner = () => { for (const [a,b,c] of [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]; return board.every(Boolean) ? "draw" : null; };
  const render = () => {
    const result = winner(); if (result) finished = true;
    openDialog(`<p class="eyebrow">GAMES · LOCAL</p><h2>Tres en raya</h2><p>${result ? (result === "draw" ? "Empate." : `Gana ${result === "X" ? "Jugador 1 (X)" : "Jugador 2 (O)"}.`) : `Turno de ${turn === "X" ? "Jugador 1 (X)" : "Jugador 2 (O)"}`}</p><div class="ttt-board">${board.map((cell,i)=>`<button class="ttt-cell" data-cell="${i}" ${cell || finished ? "disabled" : ""}>${cell}</button>`).join("")}</div><p class="demo-notice">Modo local para dos personas en este dispositivo; no es multijugador en línea.</p><button class="primary-button full-width" id="ttt-reset">${finished ? "Jugar de nuevo" : "Reiniciar partida"}</button>`);
    $$("[data-cell]").forEach(button => button.addEventListener("click", () => { const i=Number(button.dataset.cell); if (board[i] || finished) return; board[i]=turn; moves++; const win=winner(); if (!win) turn=turn === "X" ? "O" : "X"; render(); }));
    $("#ttt-reset").addEventListener("click", () => { board=Array(9).fill(""); turn="X"; finished=false; moves=0; render(); });
  }; render();
}
function openLuzCamina() {
  const board = Array.from({length:16}, (_,i)=>({id:i,type:Math.random()<.28?"reto":Math.random()<.5?"verdad":"vacia",open:false}));
  const render = () => {
    openDialog(`<p class="eyebrow">GAMES · LOCAL</p><h2>Luz camina</h2><p>Descubre casillas: rojo = reto, verde = verdad y vacía = sigue jugando.</p><div class="mines-board">${board.map(cell=>`<button class="mine-cell ${cell.open ? cell.type : ""}" data-mine="${cell.id}" ${cell.open?"disabled":""}>${cell.open ? (cell.type === "reto" ? "!" : cell.type === "verdad" ? "✓" : "·") : "?"}</button>`).join("")}</div><p id="mine-message" class="muted">Toca una casilla para revelar qué contiene.</p><p class="demo-notice">Tablero local de demostración. No hay salas ni jugadores remotos.</p><button class="primary-button full-width" id="mine-reset">Nuevo tablero</button>`);
    $$("[data-mine]").forEach(button=>button.addEventListener("click",()=>{const cell=board[Number(button.dataset.mine)]; cell.open=true; const msg=cell.type === "reto" ? "🔴 ¡Te ha tocado un reto! Elige uno seguro y divertido." : cell.type === "verdad" ? "🟢 ¡Te ha tocado verdad! Responde una pregunta si quieres." : "⬜ Casilla vacía. ¡Puedes seguir!"; render(); const message=$("#mine-message"); if(message) message.textContent=msg;}));
    $("#mine-reset").addEventListener("click",openLuzCamina);
  }; render();
}
function openHangman() {
  const levels=[{name:"Fácil",words:["LUNA","CASA","GATO","FLOR"]},{name:"Medio",words:["PLANETA","AMISTAD","VENTANA","TECLADO"]},{name:"Difícil",words:["CONSTELACION","LABERINTO","INVISIBLE","AVENTURA"]}]; let level=0,word="",guessed=[],misses=0;
  const start=()=>{word=levels[level].words[Math.floor(Math.random()*levels[level].words.length)];guessed=[];misses=0;render();};
  const render=()=>{const won=[...word].every(c=>guessed.includes(c));const lost=misses>=6;openDialog(`<p class="eyebrow">GAMES · AHORCADO</p><h2>El ahorcado</h2><div class="game-level">Nivel ${level+1} · ${levels[level].name}</div><div class="hangman-word">${[...word].map(c=>guessed.includes(c)||won?c:"_ ").join(" ")}</div><p>${lost?`La palabra era ${word}.`:won?"¡Correcto! Has completado el nivel.":`Errores: ${misses}/6`}</p><div class="letter-grid">${"ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("").map(c=>`<button data-letter="${c}" ${guessed.includes(c)||won||lost?"disabled":""}>${c}</button>`).join("")}</div><p class="demo-notice">Partida local. Puedes pasar el dispositivo por turnos; todavía no hay sala remota.</p><button class="primary-button full-width" id="hangman-next">${won&&level<2?"Siguiente nivel":"Nueva palabra"}</button>`);$$('[data-letter]').forEach(b=>b.addEventListener('click',()=>{const c=b.dataset.letter;if(!guessed.includes(c)){guessed.push(c);if(!word.includes(c))misses++;}render();}));$('#hangman-next').addEventListener('click',()=>{if(won&&level<2)level++;start();});};start();
}
function openWordComplete(){const sets=[{name:"Fácil",items:[["C_S_","CASA"],["L_N_","LUNA"],["G_T_","GATO"]]},{name:"Medio",items:[["AM_ST_D","AMISTAD"],["PL_N_T_","PLANETA"]]},{name:"Difícil",items:[["C_NST_L_CI_N","CONSTELACION"],["L_B_R_NT_","LABERINTO"]]}];let level=0,idx=0;const render=()=>{const [mask,answer]=sets[level].items[idx];openDialog(`<p class="eyebrow">GAMES · COMPLETAR</p><h2>Completa la palabra</h2><div class="game-level">Nivel ${level+1} · ${sets[level].name}</div><div class="hangman-word">${mask}</div><label class="field-label" for="word-answer">Escribe la palabra completa</label><input id="word-answer" class="dialog-input" autocomplete="off" autocapitalize="characters"><p id="word-feedback" class="muted">Completa las letras que faltan.</p><button class="primary-button full-width" id="word-check">Comprobar</button>`);$('#word-check').addEventListener('click',()=>{if($('#word-answer').value.trim().toUpperCase()===answer){if(idx+1<sets[level].items.length)idx++;else if(level<2){level++;idx=0;}else{level=0;idx=0;}render();}else $('#word-feedback').textContent='Todavía no. Inténtalo de nuevo.';});};render();}
function openWordSearch(){
  const words=["SOL","LUNA","GATO","FLOR"];const rows=["S O L A R T E","L U N A C A S","G A T O M E S","F L O R P I N","A M I G O S X","R E D O L U Z","C A S A T R E"];let found=[];
  const render=()=>{openDialog(`<p class="eyebrow">GAMES · SOPA DE LETRAS</p><h2>Encuentra las palabras</h2><p>Busca las palabras de la lista y tócalas cuando las encuentres. Este modo de demostración marca palabras al seleccionarlas.</p><div class="wordsearch-grid">${rows.map(r=>`<div>${r.split(" ").map(c=>`<span>${c}</span>`).join("")}</div>`).join("")}</div><div class="word-list">${words.map(w=>`<button data-word="${w}" class="${found.includes(w)?"found":""}">${found.includes(w)?"✓ ":""}${w}</button>`).join("")}</div><p>${found.length}/${words.length} encontradas</p><button class="secondary-button full-width" id="wordsearch-reset">Reiniciar</button>`);$$('[data-word]').forEach(b=>b.addEventListener('click',()=>{if(!found.includes(b.dataset.word))found.push(b.dataset.word);render();}));$('#wordsearch-reset').addEventListener('click',()=>{found=[];render();});};render();
}
function openTruthDare(){let turn=1,kind="verdad",confirmed=false;const truths=["¿Qué pequeño detalle te alegra el día?","¿Qué habilidad te gustaría aprender?","¿Cuál es un recuerdo que te hace sonreír?"];const dares=["Haz una pose dramática durante cinco segundos.","Inventa un saludo secreto para ambos.","Describe una película usando solo gestos."];let prompt="";const render=()=>{prompt=kind==="verdad"?truths[Math.floor(Math.random()*truths.length)]:dares[Math.floor(Math.random()*dares.length)];openDialog(`<p class="eyebrow">GAMES · DOS JUGADORES</p><h2 class="truth-title">${kind==="verdad"?"💬 Verdad":"⚡ Reto"}</h2><div class="truth-card"><span class="truth-turn">Turno del jugador ${turn}</span><p>${prompt}</p><small>Respeta los límites de la otra persona: siempre se puede pasar.</small></div><div class="truth-actions"><button class="secondary-button" id="truth-pass">Pasar</button><button class="primary-button" id="truth-done">Ya cumplí</button></div><p class="muted">El otro jugador debe confirmar para avanzar.</p><button class="secondary-button full-width" id="truth-confirm">Confirmar cumplimiento del jugador ${turn}</button><button class="secondary-button full-width" id="truth-voice">🎙 Chat de voz durante el juego</button>`);$('#truth-pass').addEventListener('click',()=>{kind=kind==="verdad"?"reto":"verdad";render();});$('#truth-done').addEventListener('click',()=>{toast("Esperando confirmación del otro jugador.");$('#truth-confirm').classList.add('primary-button');});$('#truth-confirm').addEventListener('click',()=>{turn=turn===1?2:1;kind=Math.random()>.5?"verdad":"reto";render();});$('#truth-voice').addEventListener('click',()=>openDialog(`<p class="eyebrow">CHAT DE VOZ</p><h2>Voz durante el juego</h2><p>El acceso está preparado, pero la voz entre dos cuentas requiere conexión en tiempo real y señalización. No se iniciará una llamada falsa.</p>`));};render();}

function openHelp() { openDialog(`<p class="eyebrow">AYUDA</p><h2>Ayuda de LIDA</h2><p>Vuelve a consultar el recorrido guiado y las funciones de LIDA.</p><button class="primary-button full-width" id="reopen-guide">Abrir guía de LIDA</button><button class="secondary-button full-width" id="show-version-info">Estado y límites de la demo</button>`); $("#reopen-guide").addEventListener("click",()=>{closeDialog();state.guideStep=0;openGuide();}); $("#show-version-info").addEventListener("click",()=>{closeDialog();openDialog(`<p class="eyebrow">ESTADO DE LIDA</p><h2>Funciones y conexión</h2><p>Perfil y mensajes se guardan en este navegador. Los juegos son locales. Todavía no hay backend, sincronización, llamadas, notificaciones push reales ni IA conectada.</p>`);}); }
function openSettings() {
  openDialog(`<p class="eyebrow">LIDA · AJUSTES</p><h2>Configuración</h2><p>Administra tu experiencia y consulta la guía.</p><button class="settings-row" id="settings-account"><span class="settings-icon">◌</span><span><strong>Cuenta y perfil</strong><small>Personaliza tu identidad</small></span><span>›</span></button><button class="settings-row" id="settings-privacy"><span class="settings-icon">◇</span><span><strong>Privacidad y seguridad</strong><small>Datos guardados en este navegador</small></span><span>›</span></button><button class="settings-row" id="settings-appearance"><span class="settings-icon">◐</span><span><strong>Apariencia</strong><small>Tema oscuro y verde neón</small></span><span>›</span></button><button class="settings-row" id="settings-help"><span class="settings-icon">?</span><span><strong>Ayuda y recorrido</strong><small>Aprende a usar LIDA</small></span><span>›</span></button>`);
  $("#settings-account").addEventListener("click", () => { closeDialog(); showView("profile"); editProfile(); });
  $("#settings-privacy").addEventListener("click", () => { closeDialog(); $("#privacy-button").click(); });
  $("#settings-appearance").addEventListener("click", () => { closeDialog(); $("#appearance-button").click(); });
  $("#settings-help").addEventListener("click", () => { closeDialog(); state.guideStep = 0; openGuide(); });
}

function editProfile() {
  openDialog(`<p class="eyebrow">PERSONALIZACIÓN</p><h2>Editar perfil</h2><label class="field-label" for="edit-name">Nombre</label><input id="edit-name" class="dialog-input" maxlength="50" value="${esc(state.profile.name)}"><label class="field-label" for="edit-handle">Usuario</label><input id="edit-handle" class="dialog-input" maxlength="40" value="${esc(state.profile.handle)}"><label class="field-label" for="edit-bio">Biografía</label><textarea id="edit-bio" class="dialog-input" maxlength="160" rows="3">${esc(state.profile.bio)}</textarea><button class="primary-button full-width" id="save-profile">Guardar cambios</button>`);
  $("#save-profile").addEventListener("click", () => {
    const name = $("#edit-name").value.trim();
    const handle = $("#edit-handle").value.trim();
    if (!name || !handle) { toast("El nombre y el usuario son obligatorios."); return; }
    const normalizedHandle = handle.startsWith("@") ? handle.toLowerCase() : `@${handle.toLowerCase()}`;
    if (!/^@[a-z0-9_]{3,20}$/.test(normalizedHandle)) { toast("El usuario debe tener de 3 a 20 caracteres: letras, números o guion bajo."); return; }
    const oldHandle = state.profile.handle;
    state.profile = { name, handle: normalizedHandle, bio: $("#edit-bio").value.trim() };

    persist(); renderProfile(); closeDialog(); toast("Perfil actualizado.");
  });
}
function renderProfile() {
  $("#profile-display-name").textContent = state.profile.name;
  $("#profile-handle").textContent = state.profile.handle;
  $(".profile-bio").textContent = state.profile.bio;
  $(".profile-avatar").textContent = initials(state.profile.name);
  $("#profile-shortcut").textContent = initials(state.profile.name);
}
function setupAI() {
  const ask = text => {
    const input = text.trim(); if (!input) return;
    const area = $("#ai-messages");
    area.insertAdjacentHTML("beforeend", `<div class="ai-bubble user-ai">${esc(input)}</div><div class="ai-bubble assistant-ai"><strong>✦ LIDA AI</strong><p>Estoy en modo de demostración. Cuando conectemos el servicio de IA, podré responder a “${esc(input)}” con ayuda real.</p></div>`);
    $("#ai-input").value = ""; area.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  $("#ai-form").addEventListener("submit", event => { event.preventDefault(); ask($("#ai-input").value); });
  $$(".suggestion").forEach(button => button.addEventListener("click", () => ask(button.dataset.prompt)));
}
function setupEvents() {
  $("#chat-search").addEventListener("input", renderChats);
  $$(".filter-chip").forEach(button => button.addEventListener("click", () => { state.filter = button.dataset.filter; $$(".filter-chip").forEach(item => item.classList.toggle("selected", item === button)); renderChats(); }));
  $("#chat-list").addEventListener("click", event => { const row = event.target.closest("[data-chat-id]"); if (row) renderConversation(row.dataset.chatId); });
  $("#message-form").addEventListener("submit", event => { event.preventDefault(); sendMessage($("#message-input").value); $("#message-input").value = ""; });
  $("#back-to-chats").addEventListener("click", () => showView("chats"));
  $("#new-chat-button").addEventListener("click", openNewChat);
  $("#new-chat-community").addEventListener("click", openNewChat);
  $("#friend-search").addEventListener("input", renderFriends);
  $("#friend-list").addEventListener("click", event => {
    const remove = event.target.closest("[data-contact-remove]");
    const message = event.target.closest("[data-contact-chat]");
    if (remove) {
      state.directory = state.directory.filter(person => person.id !== remove.dataset.contactRemove);
      persist(); renderFriends(); toast("Contacto eliminado de este dispositivo.");
    }
    if (message) {
      const person = state.directory.find(item => item.id === message.dataset.contactChat);
      if (!person) return;
      let chat = state.chats.find(item => item.contactId === person.id);
      if (!chat) {
        chat = { id: `local-chat-${person.id}`, contactId: person.id, name: person.name, userHandle: person.handle, lastMessage: "Contacto local · no conectado", time: "Ahora", unread: false, favorite: false, online: false, system: false, localOnly: true };
        state.chats.push(chat); state.messages[chat.id] = [{ text: `Este chat está preparado localmente para ${person.name} (${person.handle}). Los mensajes no se entregan a otra persona hasta que LIDA tenga un servidor conectado.`, mine: false, time: "Ahora", system: true }]; persist();
      }
      renderConversation(chat.id);
    }
  });
  $("#new-status-button").addEventListener("click", openStatusDialog);
  $("#status-add").addEventListener("click", openStatusDialog);
  $("#edit-profile-button").addEventListener("click", editProfile);
  $("#profile-edit-main").addEventListener("click", editProfile);
  $("#profile-shortcut").addEventListener("click", () => showView("profile"));
  $("#settings-shortcut").addEventListener("click", () => openSettings());
  $("#search-button").addEventListener("click", () => { showView("chats"); $("#chat-search").focus(); });
  const messageList = $("#message-list");
  let pressTimer = null, pressedMessage = null;
  const openMessageActions = (messageEl) => {
    const index=Number(messageEl.dataset.messageIndex); const message=(state.messages[state.activeChatId]||[])[index]; if(!message)return;
    openDialog(`<p class="eyebrow">MENSAJE</p><h2>Acciones</h2><div class="reaction-picker">${["❤️","😂","👍","😮","😢","🔥"].map(emoji=>`<button type="button" data-quick-reaction="${emoji}">${emoji}</button>`).join("")}</div><div class="message-action-list"><button data-message-action="reply">↩ Responder</button><button data-message-action="forward">➦ Reenviar</button><button data-message-action="share">↗ Compartir</button><button data-message-action="copy">▢ Copiar texto</button></div>`);
    $$('[data-quick-reaction]').forEach(button=>button.addEventListener('click',()=>{message.reaction=button.dataset.quickReaction;persist();renderConversation(state.activeChatId);closeDialog();}));
    $$('[data-message-action]').forEach(button=>button.addEventListener('click',()=>{const action=button.dataset.messageAction;closeDialog();if(action==='reply'){state.replyTo=message;let banner=$("#reply-banner");if(!banner){banner=document.createElement('div');banner.id='reply-banner';banner.className='reply-banner';$("#message-form").before(banner);}banner.innerHTML=`<span>Respondiendo a: ${esc(message.text||"Nota de voz")}</span><button type="button" id="cancel-reply" aria-label="Cancelar respuesta">×</button>`;$("#cancel-reply").addEventListener('click',()=>{state.replyTo=null;banner.remove();});$("#message-input").focus();}else if(action==='forward'){openDialog(`<p class="eyebrow">REENVIAR</p><h2>Reenviar mensaje</h2><p>${esc(message.text||"Nota de voz")}</p><p class="demo-notice">El reenvío a otra cuenta estará disponible al conectar LIDA a Supabase.</p>`);}else if(action==='share'){if(navigator.share)navigator.share({text:message.text||"Nota de voz"}).catch(()=>{});else toast('Compartir no está disponible en este navegador.');}else if(action==='copy'){navigator.clipboard?.writeText(message.text||"Nota de voz").then(()=>toast('Mensaje copiado.')).catch(()=>toast('No se pudo copiar el mensaje.'));}}));
  };
  messageList.addEventListener('pointerdown',event=>{const el=event.target.closest('.message');if(!el)return;pressedMessage=el;pressTimer=window.setTimeout(()=>{openMessageActions(el);pressTimer=null;},500);});
  ['pointerup','pointerleave','pointercancel'].forEach(type=>messageList.addEventListener(type,()=>{if(pressTimer){clearTimeout(pressTimer);pressTimer=null;}}));
  messageList.addEventListener('contextmenu',event=>{const el=event.target.closest('.message');if(el){event.preventDefault();openMessageActions(el);}});
  messageList.addEventListener('click',event=>{if(event.target.closest('audio'))return;const el=event.target.closest('.message');if(el&&pressedMessage===el&&pressTimer===null){/* long-press menu already handles action */}});
  $("#voice-note-button").addEventListener("click", async () => {
    if (state.mediaRecorder && state.mediaRecorder.state === "recording") { state.mediaRecorder.stop(); $("#voice-note-button").classList.remove("recording"); $("#voice-note-button").textContent="🎙"; $("#voice-waveform")?.classList.add("hidden"); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast("Tu navegador no permite grabar notas de voz en este contexto. Abre LIDA con HTTPS."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder = new MediaRecorder(stream); state.mediaRecorder=recorder; state.recordingChunks=[];
      const started=Date.now(); recorder.ondataavailable=event=>{if(event.data.size)state.recordingChunks.push(event.data);};
      recorder.onstop=()=>{ $("#voice-waveform")?.classList.add("hidden"); const blob=new Blob(state.recordingChunks,{type:recorder.mimeType||"audio/webm"}); stream.getTracks().forEach(track=>track.stop()); const reader=new FileReader(); reader.onload=()=>{ const time=new Date().toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"}); const messages=state.messages[state.activeChatId]||[]; messages.push({type:"voice",audio:reader.result,text:"",mine:true,time,duration:`${Math.max(1,Math.round((Date.now()-started)/1000))} s`}); state.messages[state.activeChatId]=messages; const chat=state.chats.find(item=>item.id===state.activeChatId); if(chat){chat.lastMessage="🎙 Nota de voz";chat.time=time;} persist();renderConversation(state.activeChatId);}; reader.readAsDataURL(blob); };
      recorder.start(); $("#voice-waveform")?.classList.remove("hidden"); $("#voice-note-button").classList.add("recording"); $("#voice-note-button").textContent="■"; toast("Grabando… pulsa ■ para terminar.");
    } catch(error) { toast("No se concedió permiso para usar el micrófono."); }
  });
  $("#call-audio").addEventListener("click", () => openDialog(`<p class="eyebrow">LLAMADA DE VOZ</p><h2>Función preparada</h2><p>El botón está disponible, pero la llamada entre usuarios todavía no puede conectarse hasta configurar el backend y el servicio de llamadas.</p><button class="primary-button full-width" id="close-call-info">Entendido</button>`));
  $("#call-video").addEventListener("click", () => openDialog(`<p class="eyebrow">VIDEOLLAMADA</p><h2>Función preparada</h2><p>La videollamada requiere señalización en tiempo real y conexión entre usuarios. La activaremos después de conectar las cuentas.</p><button class="primary-button full-width" id="close-call-info">Entendido</button>`));
  document.addEventListener("click", event => { if(event.target.closest("#close-call-info")) closeDialog(); });
  $("#attach-button").addEventListener("click", () => toast("Los archivos adjuntos requieren una fase posterior."));
  $("#conversation-menu").addEventListener("click", () => openDialog(`<p class="eyebrow">CONVERSACIÓN</p><h2>Opciones</h2><button class="settings-row" id="clear-chat"><span>⌫</span><span><strong>Limpiar mensajes locales</strong><small>Elimina los mensajes guardados en este dispositivo</small></span></button>`));
  document.addEventListener("click", event => { if (event.target.closest("#clear-chat")) { state.messages[state.activeChatId] = []; persist(); renderConversation(state.activeChatId); closeDialog(); toast("Mensajes locales eliminados."); } });
  $("#appearance-button").addEventListener("click", () => openDialog(`<p class="eyebrow">APARIENCIA</p><h2>Estilo de LIDA</h2><p>Tema oscuro premium, verde neón y logo original sin modificaciones.</p>`));
  $("#privacy-button").addEventListener("click", () => openDialog(`<p class="eyebrow">PRIVACIDAD</p><h2>Datos del prototipo</h2><p>Esta versión guarda datos localmente en el navegador. No hay cuentas reales, sincronización de servidor ni cifrado de extremo a extremo. No introduzcas información sensible.</p>`));
  $("#about-button").addEventListener("click", () => openDialog(`<p class="eyebrow">ACERCA DE</p><h2>LIDA</h2><p>Aplicación LIDA. Los datos de esta compilación se almacenan localmente; las cuentas compartidas y los mensajes entre dispositivos necesitan un servicio en línea.</p>`));
  $("#open-tictactoe").addEventListener("click", openTicTacToe);
  $("#open-luzcamina").addEventListener("click", openLuzCamina);
  $("#open-hangman").addEventListener("click", openHangman);
  $("#open-word-complete").addEventListener("click", openWordComplete);
  $("#open-wordsearch").addEventListener("click", openWordSearch);
  $("#open-truth-dare").addEventListener("click", openTruthDare);
  $("#help-button").addEventListener("click", openHelp);
  $("#home-guide-button")?.addEventListener("click", () => { state.guideStep=0; openGuide(); });
  $("#home-open-messages")?.addEventListener("click", () => showView("chats"));
  $("#home-open-games")?.addEventListener("click", () => showView("play"));
  $("#home-open-community")?.addEventListener("click", () => showView("estados"));
}
setupNavigation();
setupEvents();
setupAI();
renderChats();
renderStatuses();
renderProfile();
showView("chats");
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => console.warn("No se pudo registrar el service worker:", error)));
}
window.addEventListener("load", () => {
  const splash = document.querySelector("#lida-splash");
  window.setTimeout(() => {
    if (splash) splash.classList.add("is-hidden");
    if (!state.registered || !state.profile.handle) openRegistration();
    else if (state.guideVersion < 3) { state.guideStep = 0; state.guideSkipped = false; openGuide(); }
    showWelcomeToast();
  }, 4500);
});
