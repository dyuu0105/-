const DB_NAME = "musicQuizDB";
const STORE = "songs";
let db;
let songs = [];
let quiz = [];
let currentIndex = 0;
let score = 0;
let answered = false;
let audioUrl = null;

const $ = id => document.getElementById(id);

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(); };
    req.onerror = () => reject(req.error);
  });
}
function getAllSongs() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function addSong(song) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).add(song);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function deleteSong(id) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function clearSongs() {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function refreshSongs() {
  songs = await getAllSongs();
  $("songCount").textContent = songs.length;
  $("startQuiz").disabled = songs.length < 1;
  $("songList").innerHTML = "";
  if (!songs.length) {
    $("songList").innerHTML = '<p class="muted">아직 등록된 곡이 없습니다.</p>';
    return;
  }
  songs.forEach(song => {
    const div = document.createElement("div");
    div.className = "song-item";
    div.innerHTML = `
      <div class="song-info">
        <strong>${escapeHtml(song.title)}</strong>
        <small>${escapeHtml(song.composer)} · ${escapeHtml(song.era)} · ${escapeHtml(song.form)}</small>
      </div>
      <button class="delete-song" data-id="${song.id}">삭제</button>
    `;
    div.querySelector("button").onclick = async () => {
      await deleteSong(song.id);
      await refreshSongs();
    };
    $("songList").appendChild(div);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

$("songForm").addEventListener("submit", async e => {
  e.preventDefault();
  const file = $("audioFile").files[0];
  if (!file) return;
  await addSong({
    title: $("title").value.trim(),
    composer: $("composer").value.trim(),
    era: $("era").value.trim(),
    form: $("form").value.trim(),
    audio: file,
    filename: file.name
  });
  e.target.reset();
  await refreshSongs();
  alert("음원이 저장되었습니다.");
});

$("clearAll").onclick = async () => {
  if (!songs.length) return;
  if (confirm("등록된 모든 곡을 삭제할까요?")) {
    await clearSongs();
    await refreshSongs();
  }
};

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuiz() {
  // 한 사이클 = 등록된 각 곡을 한 번씩 출제.
  // 각 곡마다 질문 분야를 랜덤 선택하고 7지선다를 구성한다.
  quiz = shuffle(songs).map(song => {
    const fields = [
      { key: "title", label: "곡명", question: "이 음악의 곡명은?" },
      { key: "composer", label: "작곡가", question: "이 음악의 작곡가는?" },
      { key: "era", label: "시대", question: "이 음악이 속한 시대는?" },
      { key: "form", label: "연주형태", question: "이 음악의 연주형태는?" }
    ];
    return { song, field: fields[Math.floor(Math.random() * fields.length)] };
  });
}

function makeOptions(correct, fieldKey) {
  // 해당 항목에 등록된 서로 다른 값들을 모두 모읍니다.
  const pool = [...new Set(songs.map(s => s[fieldKey]).filter(Boolean))];

  // 보기가 7개 이상이면 정답 + 랜덤 오답 6개,
  // 7개보다 적으면 등록된 모든 값을 그대로 사용합니다.
  const others = shuffle(pool.filter(x => x !== correct));
  const selected = others.length >= 6
    ? others.slice(0, 6)
    : others;

  return shuffle([correct, ...selected]);
}

function startQuiz() {
  if (!songs.length) return;
  buildQuiz();
  currentIndex = 0;
  score = 0;
  showView("quizView");
  renderQuestion();
}

function renderQuestion() {
  answered = false;
  const item = quiz[currentIndex];
  $("progress").textContent = `${currentIndex + 1} / ${quiz.length}`;
  $("score").textContent = `점수 ${score}`;
  $("questionType").textContent = item.field.label;
  $("question").textContent = item.field.question;

  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(item.song.audio);
  $("audioPlayer").src = audioUrl;
  $("audioPlayer").currentTime = 0;
  $("playIcon").textContent = "▶";
  $("playText").textContent = "음악 듣기";

  const options = makeOptions(item.song[item.field.key], item.field.key);
  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  options.forEach(value => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = value;
    btn.onclick = () => answer(value, item.song[item.field.key], btn);
    optionsEl.appendChild(btn);
  });
  $("feedback").className = "feedback hidden";
  $("feedback").textContent = "";
  $("nextButton").classList.add("hidden");
}

$("playButton").onclick = () => {
  const audio = $("audioPlayer");
  if (audio.paused) {
    audio.play();
    $("playIcon").textContent = "❚❚";
    $("playText").textContent = "재생 중";
  } else {
    audio.pause();
    $("playIcon").textContent = "▶";
    $("playText").textContent = "음악 듣기";
  }
};
$("audioPlayer").addEventListener("ended", () => {
  $("playIcon").textContent = "▶";
  $("playText").textContent = "다시 듣기";
});

function answer(value, correct, clicked) {
  if (answered) return;
  answered = true;
  document.querySelectorAll(".option").forEach(b => b.disabled = true);
  const isCorrect = value === correct;
  if (isCorrect) {
    score++;
    clicked.classList.add("correct");
  } else {
    clicked.classList.add("wrong");
    document.querySelectorAll(".option").forEach(b => {
      if (b.textContent === correct) b.classList.add("correct");
    });
  }
  $("score").textContent = `점수 ${score}`;
  const feedback = $("feedback");
  feedback.className = `feedback ${isCorrect ? "good" : "bad"}`;
  feedback.textContent = isCorrect ? "정답입니다!" : `아쉬워요. 정답은 「${correct}」입니다.`;
  $("nextButton").classList.remove("hidden");
}

$("nextButton").onclick = () => {
  currentIndex++;
  if (currentIndex >= quiz.length) showResult();
  else renderQuestion();
};

function showResult() {
  showView("resultView");
  const total = quiz.length;
  const percent = Math.round((score / total) * 100);
  $("finalScore").textContent = `${score} / ${total}점`;
  $("resultStats").innerHTML = `
    <div><strong>${percent}%</strong>정답률</div>
    <div><strong>${total - score}</strong>오답</div>
  `;
  $("resultMessage").textContent =
    percent === 100 ? "완벽합니다. 수행평가 전 마지막 점검으로 충분하겠어요." :
    percent >= 80 ? "좋아요. 조금만 더 돌리면 안정적으로 맞힐 수 있겠어요." :
    percent >= 60 ? "한두 사이클 더 돌리면서 헷갈리는 곡을 잡아보세요." :
    "곡 정보를 다시 확인한 뒤 한 번 더 연습해 보세요.";
}

$("retryQuiz").onclick = startQuiz;
$("backToSetup").onclick = () => showView("setupView");
$("quitQuiz").onclick = () => {
  $("audioPlayer").pause();
  showView("setupView");
};

function showView(id) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

(async function init() {
  try {
    await openDB();
    await refreshSongs();
  } catch (err) {
    console.error(err);
    alert("브라우저 저장 기능을 초기화하지 못했습니다. 최신 Chrome/Edge에서 다시 시도해 주세요.");
  }
})();
