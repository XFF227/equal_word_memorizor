const API_BASE = 'https://68912b50447ff4f11fbbe7a1.mockapi.io/users';  // MockAPI base URL
let userId = null;
let wordList = [];
let wrongList = [];
let data = {};        // Map: Chinese meaning -> [ [English words], Chinese meaning ]
let keys = [];        // All meaning keys
let quizOrder = [];   // Ordered meaning keys for current quiz
let currentIndex = 0; // Current question index
let currentQuestion = null;   // Current Chinese meaning being tested
let currentCorrect = [];      // Correct English words for current question
let selectedChineseAnswer = null;  // User-selected Chinese meaning in current question
let wordMap = {};     // English -> Chinese meaning

// Load user data from API and initialize state
async function loadUserData() {
    const raw = localStorage.getItem("user");
    if (!raw) {
        alert("请先登录！");
        location.href = "login.html";
        return;
    }
    const localUser = JSON.parse(raw);
    const username = localUser.username;
    try {
        const res = await fetch(`${API_BASE}?username=${username}`);
        const users = await res.json();
        if (users.length === 0) {
            alert("用户不存在，请重新登录");
            location.href = "login.html";
            return;
        }
        const user = users[0];
        userId = user.id || user.user;  // Use id (or fallback to user field)
        wordList = user.word_list || [];
        wrongList = user.Wrong_list || [];
        // Build quick lookup map for meanings
        wordMap = {};
        wordList.forEach(item => {
            wordMap[item.english] = item.chinese;
        });
        // Group data by Chinese meaning
        buildDataGroups();
        // Render flashcards and populate quiz filter options
        renderFlashcards();
        updateQuizOptions();
        renderWrongCards();
    } catch (err) {
        console.error("加载用户数据失败：", err);
        alert("加载用户数据失败，请稍后重试");
    }
}

// Save user data (wordList and wrongList) back to server
async function saveUserData() {
    if (!userId) return;
    try {
        await fetch(`${API_BASE}/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                word_list: wordList,
                Wrong_list: wrongList
            })
        });
    } catch (err) {
        console.error("保存用户数据失败：", err);
    }
}

// Group words by Chinese meaning
function buildDataGroups() {
    data = {};
    wordList.forEach(word => {
        const meaning = word.chinese;
        const english = word.english;
        if (!data[meaning]) {
            data[meaning] = [[], meaning];
        }
        data[meaning][0].push(english);
    });
    keys = Object.keys(data);
}

// Render flashcards grouped by date
function renderFlashcards() {
    const container = document.getElementById('cardsContainer');
    const groupsByDate = {};
    wordList.forEach(word => {
        const date = word.date || '未指定日期';
        if (!groupsByDate[date]) groupsByDate[date] = [];
        groupsByDate[date].push(word);
    });
    const dates = Object.keys(groupsByDate).sort((a, b) => b.localeCompare(a));
    let html = '';
    dates.forEach(date => {
        const words = groupsByDate[date];
        words.sort((a, b) => (a.scoreValue ?? 0) - (b.scoreValue ?? 0));
        html += `<div class="card"><strong>${date}</strong><br>`;
        words.forEach((w, idx) => {
            const color = getColor(w.scoreValue ?? 0);
            html += `<span style="color:${color}">${w.english}</span> - ${w.chinese}`;
            if (idx < words.length - 1) html += '<br>';
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

// Populate quiz selection dropdown with date groups
function updateQuizOptions() {
    const select = document.getElementById('quizSelect');
    for (let i = select.options.length - 1; i >= 1; i--) {
        select.remove(i);
    }
    const dates = [...new Set(wordList.map(w => w.date).filter(d => d))];
    dates.sort((a, b) => a.localeCompare(b));
    dates.forEach(date => {
        const opt = document.createElement('option');
        opt.value = date;
        opt.textContent = `仅练习 ${date} 的单词`;
        select.appendChild(opt);
    });
}

// Render list of wrong words (meanings) on the Wrong tab
function renderWrongCards() {
    const container = document.getElementById('wrongCards');
    if (wrongList.length === 0) {
        container.innerHTML = "<p>暂无错词</p>";
    } else {
        let html = "<div class='card'><strong>错词集</strong><br>";
        wrongList.forEach((entry, index) => {
            html += `${index + 1}. ${entry.correct.join(', ')} - ${entry.meaning}`;
            if (index < wrongList.length - 1) html += '<br>';
        });
        html += "</div>";
        container.innerHTML = html;
    }
}

// Start quiz with selected scope
function startQuiz() {
    const select = document.getElementById('quizSelect');
    const choice = select.value;
    let selectedKeys = [];
    if (choice === 'negative') {
        // All meanings where any word has score < 0
        selectedKeys = keys.filter(k => data[k][0].some(word => getWordScore(word) < 0));
    } else {
        // Only meanings of words from the chosen date group
        selectedKeys = keys.filter(k => data[k][0].some(word => {
            const wObj = wordList.find(obj => obj.english === word);
            return wObj && wObj.date === choice;
        }));
    }
    if (selectedKeys.length === 0) {
        alert("没有符合条件的单词可供练习！");
        return;
    }
    // Randomize order (prioritize lower scores could be added here)
    quizOrder = selectedKeys.slice().sort(() => Math.random() - 0.5);
    currentIndex = 0;
    document.getElementById('quizArea').innerHTML = '';
    nextQuiz();
}

// Show next quiz question (Chinese options step)
function nextQuiz() {
    const container = document.getElementById('quizArea');
    container.innerHTML = '';
    if (currentIndex >= quizOrder.length) {
        container.innerHTML = '<p>做题结束！</p>';
        return;
    }
    currentQuestion = quizOrder[currentIndex];
    currentCorrect = data[currentQuestion][0].slice();  // two correct English words
    selectedChineseAnswer = null;
    // Prepare Chinese choices (correct + 1 random wrong meaning)
    const correctChinese = currentQuestion;
    const otherMeanings = keys.filter(k => k !== correctChinese);
    const wrongChinese = data[otherMeanings[Math.floor(Math.random() * otherMeanings.length)]][1];
    const choices = [correctChinese, wrongChinese].sort(() => Math.random() - 0.5);
    let html = `<div class="card"><div style="margin-bottom:0.5em;">第 ${currentIndex+1} 题 / 共 ${quizOrder.length} 题</div>`;
    html += `<div class="chinese-options">`;
    choices.forEach(ch => {
        html += `<label id="quiz_chinese_${ch}"><input type="radio" name="quiz_chinese_choice" value="${ch}"> ${ch}</label><br>`;
    });
    html += `</div>`;
    html += `<button id="confirmChineseBtn" onclick="chooseChineseQuiz()">确定</button>`;
    html += `<button id="nextQuizBtn" onclick="nextQuiz()" style="display:none;margin-left:1em;">下一题</button>`;
    html += `</div>`;
    container.innerHTML = html;
}

// Handle Chinese choice confirmation and show English options
function chooseChineseQuiz() {
    const sel = document.querySelector('input[name="quiz_chinese_choice"]:checked');
    if (!sel) {
        alert("请选择一个中文释义");
        return;
    }
    selectedChineseAnswer = sel.value;
    // Disable Chinese options and hide confirm button
    document.querySelectorAll('input[name="quiz_chinese_choice"]').forEach(input => input.disabled = true);
    document.getElementById('confirmChineseBtn').style.display = 'none';
    // Prepare English choices (2 correct + 4 distractors)
    let allOtherWords = wordList.map(w => w.english).filter(w => !currentCorrect.includes(w));
    allOtherWords.sort(() => Math.random() - 0.5);
    const distractors = allOtherWords.slice(0, 4);
    const choices = currentCorrect.concat(distractors).sort(() => Math.random() - 0.5);
    let engHtml = `<div class="english-options">`;
    choices.forEach(word => {
        engHtml += `<label><input type="checkbox" name="quiz_word_choice" value="${word}"> ${word}</label><br>`;
    });
    engHtml += `</div>`;
    engHtml += `<button onclick="submitAnswer()">提交</button>`;
    // Insert English options and submit button into the current card
    const cardDiv = document.querySelector('#quizArea .card');
    cardDiv.insertAdjacentHTML('beforeend', engHtml);
}

// Submit the quiz answer (after English selection)
function submitAnswer() {
    const selectedEls = document.querySelectorAll('input[name="quiz_word_choice"]:checked');
    if (selectedEls.length !== 2) {
        alert("请选择两个英文单词");
        return;
    }
    const selectedWords = Array.from(selectedEls).map(el => el.value);
    selectedWords.sort();
    currentCorrect.sort();
    const correctChinese = currentQuestion;
    const chosenChinese = selectedChineseAnswer;
    let isCorrect = (chosenChinese === correctChinese) && (selectedWords[0] === currentCorrect[0] && selectedWords[1] === currentCorrect[1]);
    if (!isCorrect) {
        recordWrong(correctChinese, currentCorrect);
        updateScore(currentCorrect, -1);
    } else {
        updateScore(currentCorrect, 1);
    }
    // Highlight correct vs wrong selections
    highlightChinese(correctChinese, chosenChinese, 'quiz_chinese');
    highlightEnglish(currentCorrect, selectedWords, 'quiz_word_choice');
    // Disable all choices and show Next button
    document.querySelectorAll('#quizArea input').forEach(inp => inp.disabled = true);
    currentIndex++;
    document.getElementById('nextQuizBtn').style.display = 'inline';
}

// Start wrong-list review
function startWrongReview() {
    if (wrongList.length === 0) {
        alert("当前没有错题可训练");
        return;
    }
    currentIndex = 0;
    document.getElementById('wrongCards').style.display = 'none';
    document.getElementById('wrongArea').innerHTML = '';
    nextWrong();
}

// Show next wrong question (Chinese options)
function nextWrong() {
    const container = document.getElementById('wrongArea');
    container.innerHTML = '';
    if (currentIndex >= wrongList.length) {
        container.innerHTML = '<p>错题训练结束！</p>';
        // Show wrongCards list again when finished
        document.getElementById('wrongCards').style.display = 'block';
        return;
    }
    const entry = wrongList[currentIndex];
    currentQuestion = entry.meaning;
    currentCorrect = entry.correct.slice();
    selectedChineseAnswer = null;
    // Chinese choices (correct meaning + 1 wrong meaning)
    const correctChinese = currentQuestion;
    const otherMeanings = keys.filter(k => k !== correctChinese);
    const wrongChinese = data[otherMeanings[Math.floor(Math.random()*otherMeanings.length)]][1];
    const choices = [correctChinese, wrongChinese].sort(() => Math.random() - 0.5);
    let html = `<div class="card"><div style="margin-bottom:0.5em;">第 ${currentIndex+1} 题 / 共 ${wrongList.length} 题</div>`;
    html += `<div class="chinese-options">`;
    choices.forEach(ch => {
        html += `<label id="wrong_chinese_${ch}"><input type="radio" name="wrong_chinese_choice" value="${ch}"> ${ch}</label><br>`;
    });
    html += `</div>`;
    html += `<button id="confirmWrongBtn" onclick="chooseChineseWrong()">确定</button>`;
    html += `<button id="nextWrongBtn" onclick="nextWrong()" style="display:none;margin-left:1em;">下一题</button>`;
    html += `</div>`;
    container.innerHTML = html;
}

// Handle Chinese choice in wrong mode and show English options
function chooseChineseWrong() {
    const sel = document.querySelector('input[name="wrong_chinese_choice"]:checked');
    if (!sel) {
        alert("请选择一个中文释义");
        return;
    }
    selectedChineseAnswer = sel.value;
    document.querySelectorAll('input[name="wrong_chinese_choice"]').forEach(inp => inp.disabled = true);
    document.getElementById('confirmWrongBtn').style.display = 'none';
    // English choices (2 correct + 4 decoys)
    let allOtherWords = wordList.map(w => w.english).filter(w => !currentCorrect.includes(w));
    allOtherWords.sort(() => Math.random() - 0.5);
    const distractors = allOtherWords.slice(0, 4);
    const choices = currentCorrect.concat(distractors).sort(() => Math.random() - 0.5);
    let engHtml = `<div class="english-options">`;
    choices.forEach(word => {
        engHtml += `<label><input type="checkbox" name="wrong_word_choice" value="${word}"> ${word}</label><br>`;
    });
    engHtml += `</div>`;
    engHtml += `<button onclick="submitWrongAnswer()">提交</button>`;
    const cardDiv = document.querySelector('#wrongArea .card');
    cardDiv.insertAdjacentHTML('beforeend', engHtml);
}

// Submit the wrong-list training answer
function submitWrongAnswer() {
    const selectedEls = document.querySelectorAll('input[name="wrong_word_choice"]:checked');
    if (selectedEls.length !== 2) {
        alert("请选择两个英文单词");
        return;
    }
    const selectedWords = Array.from(selectedEls).map(el => el.value);
    selectedWords.sort();
    currentCorrect.sort();
    const correctChinese = currentQuestion;
    const chosenChinese = selectedChineseAnswer;
    let isCorrect = (chosenChinese === correctChinese) && (selectedWords[0] === currentCorrect[0] && selectedWords[1] === currentCorrect[1]);
    if (!isCorrect) {
        // If still wrong, keep in wrongList (or re-add if not present)
        // (wrongList entry remains for further practice)
        updateScore(currentCorrect, -1);
    } else {
        // If correct, you might remove it from wrongList or keep until manually removed
        updateScore(currentCorrect, 1);
    }
    highlightChinese(correctChinese, chosenChinese, 'wrong_chinese');
    highlightEnglish(currentCorrect, selectedWords, 'wrong_word_choice');
    document.querySelectorAll('#wrongArea input').forEach(inp => inp.disabled = true);
    currentIndex++;
    document.getElementById('nextWrongBtn').style.display = 'inline';
}

// Record a wrong answer (add to wrongList if not already present)
async function recordWrong(meaning, correctWords) {
    if (!wrongList.some(q => q.meaning === meaning)) {
        wrongList.push({ meaning: meaning, correct: [...correctWords] });
    }
    await saveUserData();
    renderWrongCards();
}

// Update score of given words by delta (+1 or -1)
async function updateScore(words, delta) {
    words.forEach(word => {
        const wObj = wordList.find(item => item.english === word);
        if (wObj) {
            wObj.scoreValue = (wObj.scoreValue ?? 0) + delta;
        }
    });
    await saveUserData();
    renderFlashcards();
}

// Get a word's current score or 0 if not found
function getWordScore(word) {
    const w = wordList.find(item => item.english === word);
    return w ? (w.scoreValue ?? 0) : 0;
}

// Determine color based on score
function getColor(score) {
    if (score <= -5) return 'red';
    if (score <= -3) return 'orange';
    if (score < 0)  return 'orange';
    if (score === 0) return 'black';
    if (score <= 3) return 'blue';
    return 'green';
}

// Highlight correct Chinese meaning and wrong selection (if any)
function highlightChinese(correctKey, selectedKey, prefix) {
    const correctLabel = document.getElementById(`${prefix}_${correctKey}`);
    const selectedLabel = document.getElementById(`${prefix}_${selectedKey}`);
    if (correctLabel) correctLabel.style.background = '#c8f7c5';
    if (selectedKey !== correctKey && selectedLabel) {
        selectedLabel.style.background = '#f8d7da';
    }
}

// Highlight English word options (correct green, wrong red)
function highlightEnglish(correctWords, selectedWords, inputName) {
    const inputs = document.querySelectorAll(`input[name="${inputName}"]`);
    selectedWords.forEach(sel => {
        const input = [...inputs].find(i => i.value === sel);
        if (input) {
            input.parentElement.style.background = correctWords.includes(sel) ? '#c8f7c5' : '#f8d7da';
        }
    });
    inputs.forEach(input => {
        if (correctWords.includes(input.value)) {
            input.parentElement.style.background = '#c8f7c5';
        }
    });
}

// Switch between tabs
function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(div => {
        div.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
}

// Modal controls for bulk add
function showBulkAddModal() {
    document.getElementById('bulkAddModal').style.display = 'flex';
}
function closeBulkAdd() {
    document.getElementById('bulkAddModal').style.display = 'none';
    document.getElementById('bulkInput').value = '';
}

// Save words entered in bulk-add textarea
async function saveBulkAdd() {
    const textarea = document.getElementById('bulkInput');
    const text = textarea.value.trim();
    if (!text) {
        closeBulkAdd();
        return;
    }
    const lines = text.split('\n');
    let newWordsAdded = false;
    lines.forEach(line => {
        // Determine format: either "word1 = word2 = meaning" or "word, meaning"
        let parts = line.split('=');
        if (parts.length >= 3) {
            // Two synonyms format
            const eng1 = parts[0].trim();
            const eng2 = parts[1].trim();
            const chin = parts[2].trim();
            if (eng1 && eng2 && chin) {
                if (!wordList.some(item => item.english === eng1)) {
                    wordList.push({ english: eng1, chinese: chin, scoreValue: 0, date: currentDateString() });
                    newWordsAdded = true;
                }
                if (!wordList.some(item => item.english === eng2)) {
                    wordList.push({ english: eng2, chinese: chin, scoreValue: 0, date: currentDateString() });
                    newWordsAdded = true;
                }
            }
        } else {
            // Single word format "word, meaning" or with comma
            parts = line.split(',');
            if (parts.length >= 2) {
                const eng = parts[0].trim();
                const chin = parts[1].trim();
                if (eng && chin) {
                    if (!wordList.some(item => item.english === eng)) {
                        wordList.push({ english: eng, chinese: chin, scoreValue: 0, date: currentDateString() });
                        newWordsAdded = true;
                    }
                }
            }
        }
    });
    if (newWordsAdded) {
        buildDataGroups();
        updateQuizOptions();
        renderFlashcards();
        await saveUserData();
    }
    closeBulkAdd();
}

// Utility to get current date string (YYYY-MM-DD)
function currentDateString() {
    const d = new Date();
    const month = (d.getMonth()+1).toString().padStart(2,'0');
    const day = d.getDate().toString().padStart(2,'0');
    return `${d.getFullYear()}-${month}-${day}`;
}
