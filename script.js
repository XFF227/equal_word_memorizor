// script.js

const API_BASE = 'https://68912b50447ff4f11fbbe7a1.mockapi.io/users';

let userId = null;
let currentUser = null;   // 完整的用户对象
let groupList = [];       // [{english1,english2,chinese,scoreValue,date}, ...]
let wrongList = [];       // [{english1,english2,chinese,scoreValue,date}, ...]
let wordMap = {};         // 英文 -> 中文 映射
let quizOrder = [];       // 当前练习题组顺序（数组 of group 对象）
let currentIndex = 0;     // 题目索引
let quizMode = 'memory';  // 'memory' 或 'hard'

// 页面加载后初始化
window.addEventListener('load', loadUserData);

async function loadUserData() {
    try {
        const raw = localStorage.getItem('user');
        if (!raw) throw new Error('本地未找到登录信息');
        const { username } = JSON.parse(raw);
        // 拉取完整用户对象
        const res = await fetch(`${API_BASE}?username=${encodeURIComponent(username)}`);
        if (!res.ok) throw new Error(`GET 用户失败，状态码 ${res.status}`);
        const arr = await res.json();
        if (!Array.isArray(arr) || arr.length === 0) {
            throw new Error('用户不存在');
        }
        currentUser = arr[0];
        userId = currentUser.id;
        // 初始化本地数据
        groupList = currentUser.word_list || [];
        wrongList = currentUser.Wrong_list || [];
        wordMap = {};
        groupList.forEach(g => {
            wordMap[g.english1] = g.chinese;
            wordMap[g.english2] = g.chinese;
        });
        renderFlashcards();
        updateQuizOptions();
        renderWrongCards();
    } catch (err) {
        console.error('loadUserData 错误:', err);
        alert('加载用户数据失败，请稍后重试');
    }
}

// 完整 PUT 保存用户数据（包含所有字段）
async function saveUserData() {
    if (!userId || !currentUser) return;
    try {
        // 构造完整对象
        const updated = {
            ...currentUser,
            word_list: groupList,
            Wrong_list: wrongList
        };
        const res = await fetch(`${API_BASE}/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated)
        });
        if (!res.ok) {
            console.error('saveUserData PUT 失败:', res.status, await res.text());
        } else {
            console.log('用户数据保存成功');
            currentUser = updated;  // 更新本地缓存
        }
    } catch (err) {
        console.error('saveUserData 错误:', err);
    }
}

// 渲染“背词”卡片
/**
 * 渲染背词卡片：按日期分组、组内按 scoreValue 升序，
 * 并且每个单词根据 scoreValue 着色
 */

function getScoreColor(score) {
    if (score <= -5) return 'red';
    if (score <= -3) return 'orange';
    if (score < 0)  return 'orange';
    if (score === 0) return 'black';
    if (score <= 3) return 'blue';
    return 'green';
}
function renderFlashcards() {
    const container = document.getElementById('cardsContainer');
    if (!container) return;

    // 按日期分组
    const byDate = {};
    groupList.forEach(g => {
        byDate[g.date] = byDate[g.date] || [];
        byDate[g.date].push(g);
    });

    // 日期降序（最新日期先显示）
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    // 构建 HTML
    let html = '';
    dates.forEach(date => {
        // 组内按 scoreValue 降序（j 降序）
        byDate[date].sort((a, b) => (b.scoreValue || 0) - (a.scoreValue || 0));

        html += `<div class="card"><strong>${date}</strong><br>`;
        byDate[date].forEach(g => {
            const color = getScoreColor(g.scoreValue || 0);
            html += `<span style="color:${color}">${g.english1}=${g.english2}</span> —— ${g.chinese}<br>`;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}




// 更新做题选日期下拉
function updateQuizOptions() {
    const sel = document.getElementById('quizSelect');
    while (sel.options.length > 1) sel.remove(1);
    const dates = [...new Set(groupList.map(g=>g.date))].sort();
    dates.forEach(d => {
        const o = document.createElement('option');
        o.value = d;
        o.textContent = `仅练习 ${d}`;
        sel.appendChild(o);
    });
}

// 渲染“错题集”
function renderWrongCards() {
    const container = document.getElementById('wrongCards');
    if (!wrongList.length) {
        container.innerHTML = '<p>暂无错题</p>';
        return;
    }
    container.innerHTML = `<div class="card"><strong>错题集</strong><br>` +
        wrongList.map((g,i)=>`${i+1}. ${g.english1}=${g.english2} —— ${g.chinese}`)
            .join('<br>') +
        `</div>`;
}

// 底部导航
function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
}

// 点击“开始做题”
function startQuiz() {
    const dateFilter = document.getElementById('quizSelect').value;
    quizMode = document.getElementById('modeSelect').value;
    let pool = groupList.filter(g => {
        return dateFilter==='negative'
            ? g.scoreValue < 0
            : g.date === dateFilter;
    });
    if (!pool.length) {
        alert('没有符合条件的题目');
        return;
    }
    quizOrder = pool.sort(()=>Math.random()-0.5);
    currentIndex = 0;
    document.getElementById('quizArea').innerHTML = '';
    quizMode==='memory' ? nextMemory() : nextHard();
}

// ——— 记忆模式 ———
function nextMemory() {
    const c = document.getElementById('quizArea');
    c.innerHTML = '';
    if (currentIndex >= quizOrder.length) {
        c.innerHTML = '<p>记忆模式练习结束。</p>';
        return;
    }
    const g = quizOrder[currentIndex];
    const correct = [g.english1, g.english2];
    const others = groupList.filter(x=>x!==g)
        .sort(()=>Math.random()-0.5).slice(0,2);
    const distractors = others.flatMap(x=>[x.english1,x.english2]);
    const choices = correct.concat(distractors).sort(()=>Math.random()-0.5);

    let html = `<div class="card">
    <div>第 ${currentIndex+1} 题 / 共 ${quizOrder.length} 题（记忆模式）</div>
    <div class="chinese-options"><strong>${g.chinese}</strong></div>
    <div class="english-options">`;
    choices.forEach(w=>{
        html += `<label><input type="checkbox" name="mem_eng" value="${w}"> ${w}</label><br>`;
    });
    html += `</div>
    <button onclick="submitMemory()">提交</button>
    <button onclick="giveUpMemory()">我不会</button>
    <button id="nextMemBtn" onclick="nextMemory()" style="display:none;">下一题</button>
  </div>`;
    c.innerHTML = html;
}

async function submitMemory() {
    const chosen = Array.from(
        document.querySelectorAll('input[name="mem_eng"]:checked')
    ).map(i=>i.value);
    if (chosen.length!==2) {
        alert('请选择两个英文');
        return;
    }
    const g = quizOrder[currentIndex];
    const correct = [g.english1, g.english2].slice().sort();
    const isOk = chosen.slice().sort().join() === correct.join();
    if (!isOk) {
        await recordWrongGroup(g);
        await updateScoreGroup(g, -1);
    } else {
        await updateScoreGroup(g, 1);
    }
    // 禁用 & 高亮
    document.querySelectorAll('input[name="mem_eng"]').forEach(i=>i.disabled=true);
    document.querySelectorAll('.english-options label').forEach(lbl=>{
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correct.includes(w)) lbl.style.background='#c8f7c5';
        else if (chosen.includes(w)) lbl.style.background='#f8d7da';
    });
    document.getElementById('nextMemBtn').style.display='inline';
    currentIndex++;
}

async function giveUpMemory() {
    const g = quizOrder[currentIndex];
    const correct = [g.english1, g.english2].slice().sort();
    await recordWrongGroup(g);
    await updateScoreGroup(g, -1);
    document.querySelectorAll('input[name="mem_eng"]').forEach(i=>i.disabled=true);
    document.querySelectorAll('.english-options label').forEach(lbl=>{
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correct.includes(w)) lbl.style.background='#c8f7c5';
    });
    document.getElementById('nextMemBtn').style.display='inline';
    currentIndex++;
}

// ——— 困难模式 ———
function nextHard() {
    const c = document.getElementById('quizArea');
    c.innerHTML = '';
    if (currentIndex >= quizOrder.length) {
        c.innerHTML = '<p>困难模式练习结束。</p>';
        return;
    }
    const g = quizOrder[currentIndex];
    const wrongG = groupList.filter(x=>x!==g).sort(()=>Math.random()-0.5)[0];
    const chs = [g.chinese, wrongG.chinese].sort(()=>Math.random()-0.5);

    // 英文 2 正确 + 4 干扰
    const correctEng = [g.english1, g.english2];
    let pool = groupList.filter(x=>x!==g);
    const engDistr = [];
    let countWrong = 0;
    while (engDistr.length < 4 && pool.length) {
        const x = pool.splice(Math.random()*pool.length|0,1)[0];
        if (x.chinese === g.chinese) continue;
        if (x.chinese === wrongG.chinese) {
            if (countWrong++ >= 1) continue;
        }
        engDistr.push(x.english1, x.english2);
    }
    const distractors = engDistr.slice(0,4);
    const engChoices = correctEng.concat(distractors)
        .sort(()=>Math.random()-0.5);

    // 渲染
    let html = `<div class="card">
    <div>第 ${currentIndex+1} 题 / 共 ${quizOrder.length} 题（困难模式）</div>
    <div class="chinese-options">`;
    chs.forEach(ch=>{
        html += `<label><input type="radio" name="hard_ch" value="${ch}"> ${ch}</label><br>`;
    });
    html += `</div><div class="english-options">`;
    engChoices.forEach(w=>{
        html += `<label><input type="checkbox" name="hard_eng" value="${w}"> ${w}</label><br>`;
    });
    html += `</div>
    <button id="submitHardBtn" onclick="submitHard()">提交</button>
    <button onclick="giveUpHard()">我不会</button>
    <button id="nextHardBtn" onclick="nextHard()" style="display:none;">下一题</button>
  </div>`;
    c.innerHTML = html;
}

async function submitHard() {
    const g = quizOrder[currentIndex];
    const selCh = document.querySelector('input[name="hard_ch"]:checked');
    if (!selCh) { alert('请选择一个中文'); return; }
    const chosenCh = selCh.value;
    const chosenEng = Array.from(
        document.querySelectorAll('input[name="hard_eng"]:checked')
    ).map(i=>i.value);
    if (chosenEng.length!==2) { alert('请选择两个英文'); return; }

    const correctEng = [g.english1, g.english2].slice().sort();
    const isOk = chosenCh===g.chinese
        && chosenEng.slice().sort().join()===correctEng.join();
    if (!isOk) {
        await recordWrongGroup(g);
        await updateScoreGroup(g, -1);
    } else {
        await updateScoreGroup(g, 1);
    }

    // 禁用 & 高亮
    document.querySelectorAll('input[name="hard_ch"]').forEach(i=>i.disabled=true);
    document.querySelectorAll('input[name="hard_eng"]').forEach(i=>i.disabled=true);

    document.querySelectorAll('.chinese-options label').forEach(lbl=>{
        const v = lbl.querySelector('input').value;
        if (v===g.chinese) lbl.style.background='#c8f7c5';
    });
    document.querySelectorAll('.english-options label').forEach(lbl=>{
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correctEng.includes(w)) lbl.style.background='#c8f7c5';
        else if (chosenEng.includes(w)) lbl.style.background='#f8d7da';
    });

    document.getElementById('submitHardBtn').style.display='none';
    document.getElementById('nextHardBtn').style.display='inline';
    currentIndex++;
}

async function giveUpHard() {
    const g = quizOrder[currentIndex];
    const correctEng = [g.english1, g.english2].slice().sort();

    await recordWrongGroup(g);
    await updateScoreGroup(g, -1);

    document.querySelectorAll('input[name="hard_ch"]').forEach(i=>i.disabled=true);
    document.getElementById('submitHardBtn').style.display='none';
    document.querySelectorAll('input[name="hard_eng"]').forEach(i=>i.disabled=true);

    document.querySelectorAll('.chinese-options label').forEach(lbl=>{
        const v = lbl.querySelector('input').value;
        if (v===g.chinese) lbl.style.background='#c8f7c5';
    });
    document.querySelectorAll('.english-options label').forEach(lbl=>{
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correctEng.includes(w)) lbl.style.background='#c8f7c5';
    });

    document.getElementById('nextHardBtn').style.display='inline';
    currentIndex++;
}

// 更新分数并保存
async function updateScoreGroup(g, delta) {
    g.scoreValue = (g.scoreValue||0) + delta;
    renderFlashcards();
    await saveUserData();
}

// 记录错题并保存
// —— 替换记录错题的函数（若仍使用） ——
async function recordWrongGroup(g) {
    if (!wrongList.find(x=>x.english1===g.english1 && x.english2===g.english2)) {
        wrongList.push(g);
        renderWrongCards();
        await saveUserData();
    }
}


// 在 script.js 中任意位置（在其它函数定义之后）添加：

/**
 * 切换到“错题”标签页并开始第一题复习
 */
// —— 切换到“错题”Tab 并开始复习 ——
async function startWrongReview() {
    switchTab('wrong');
    document.getElementById('wrongCards').style.display = 'none';
    currentIndex = 0;
    nextWrong();
}

// —— 渲染下一道错题 ——
function nextWrong() {
    const area = document.getElementById('wrongArea');
    area.innerHTML = '';

    if (currentIndex >= wrongList.length) {
        area.innerHTML = '<p>错题练习结束！</p>';
        return;
    }

    const g = wrongList[currentIndex];
    const correct = [g.english1, g.english2];

    // 取两组干扰
    const distractors = groupList
        .filter(x => x !== g)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2)
        .flatMap(x => [x.english1, x.english2])
        .slice(0, 4);

    // 随机打乱 6 个选项
    const choices = correct.concat(distractors).sort(() => Math.random() - 0.5);

    let html = `<div class="card">
    <div>错题 ${currentIndex+1} / ${wrongList.length}</div>
    <div class="chinese-options"><strong>${g.chinese}</strong></div>
    <div class="english-options">`;
    choices.forEach(w => {
        html += `<label><input type="checkbox" name="wrong_eng" value="${w}"> ${w}</label><br>`;
    });
    html += `</div>
    <button id="submitWrongBtn" onclick="submitWrong()">提交</button>
    <button id="giveUpWrongBtn" onclick="giveUpWrong()">我不会</button>
    <button onclick="deleteThisWrong()" style="margin-left:0.5em;background:#e74c3c;">删除本题</button>
    <button id="nextWrongBtn" onclick="nextWrong()" style="display:none;">下一题</button>
  </div>`;

    area.innerHTML = html;
}

async function deleteThisWrong() {
    // 删除 currentIndex-1 对应的条目
    wrongList.splice(currentIndex, 1);
    await saveUserData();
    // 将索引回退，以便 nextWrong 读取正确位置
    currentIndex = Math.max(0, currentIndex - 1);
    // 直接出下一题
    nextWrong();
}
// —— 用户提交答案 ——
async function submitWrong() {
    const g = wrongList[currentIndex];
    const chosenEng = Array.from(
        document.querySelectorAll('input[name="wrong_eng"]:checked')
    ).map(i => i.value);

    // Check length
    if (chosenEng.length !== 2) {
        alert('请选择两个英文选项');
        return;
    }

    const correctEng = [g.english1, g.english2].slice().sort();
    const isOk = chosenEng.slice().sort().join() === correctEng.join();

    // 禁用选项和按钮
    document.querySelectorAll('input[name="wrong_eng"]').forEach(i => i.disabled = true);
    document.getElementById('submitWrongBtn').style.display = 'none';
    document.getElementById('giveUpWrongBtn').style.display = 'none';

    // 高亮正确答案，并显示中文释义
    document.querySelectorAll('.english-options label').forEach(lbl => {
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correctEng.includes(w)) {
            lbl.style.background = '#c8f7c5';
        } else if (chosenEng.includes(w)) {
            lbl.style.background = '#f8d7da';
        }
    });

    // 如果答对了，被移除了则 currentIndex 保持原来位置，
    // 如果答错了，currentIndex++ 留到下一题
    currentIndex++;

    // 显示“下一题”
    document.getElementById('nextWrongBtn').style.display = 'inline';
}

// —— “我不会” 直接当成错题 ——
async function giveUpWrong() {
    const g = wrongList[currentIndex];
    const correctEng = [g.english1, g.english2].slice().sort();

    // 禁用选项和按钮
    document.querySelectorAll('input[name="wrong_eng"]').forEach(i => i.disabled = true);
    document.getElementById('submitWrongBtn').style.display = 'none';
    document.getElementById('giveUpWrongBtn').style.display = 'none';

    // 记为错题并扣分
    await updateScoreGroup(g, -1);

    // 高亮正确答案
    document.querySelectorAll('.english-options label').forEach(lbl => {
        const w = lbl.querySelector('input').value;
        lbl.innerHTML += ` — ${wordMap[w]}`;
        if (correctEng.includes(w)) {
            lbl.style.background = '#c8f7c5';
        }
    });

    // 推进到下一题索引
    currentIndex++;
    document.getElementById('nextWrongBtn').style.display = 'inline';
}

// —— 替换更新分数 & 保存的函数 ——
async function updateScoreGroup(g, delta) {
    g.scoreValue = (g.scoreValue || 0) + delta;
    renderFlashcards();
    await saveUserData();
}
/**
 * 打开“批量添加单词”弹窗
 */
function showBulkAddModal() {
    document.getElementById('bulkAddModal').style.display = 'block';
}

/**
 * 关闭“批量添加单词”弹窗
 */
function closeBulkAdd() {
    document.getElementById('bulkAddModal').style.display = 'none';
}

/**
 * 解析输入，添加到主词表 groupList，以日期为 title，然后渲染并保存
 */
async function saveBulkAdd() {
    const raw = document.getElementById('bulkInput').value.trim();
    if (!raw) {
        closeBulkAdd();
        return;
    }

    const lines = raw.split(/[\r\n]+/).map(l => l.trim()).filter(l => l);
    const dateLabel = new Date().toISOString().slice(0, 10);

    for (const line of lines) {
        let parts;
        if (line.includes('=')) {
            parts = line.split('=').map(p => p.trim());
        } else {
            parts = line.split(',').map(p => p.trim());
        }
        if (parts.length < 3) continue;

        const [e1, e2, ...rest] = parts;
        const ch = rest.join(line.includes('=') ? '=' : ',');
        // 先插入到最前面（或 push 到末尾都行，只要后面有排序）
        groupList.unshift({
            english1: e1,
            english2: e2,
            chinese: ch,
            scoreValue: 0,
            date: dateLabel
        });
        wordMap[e1] = ch;
        wordMap[e2] = ch;
    }

    // 按 date 字段升序排序（最早的日期在最前）
    groupList.sort((a, b) => new Date(a.date) - new Date(b.date));

    renderFlashcards();
    updateQuizOptions();
    await saveUserData();
    closeBulkAdd();
}


// 全局暴露，供 HTML onclick 调用
window.showBulkAddModal = showBulkAddModal;
window.closeBulkAdd     = closeBulkAdd;
window.saveBulkAdd      = saveBulkAdd;



// script.js 末尾，紧跟函数定义后面加上：
window.startWrongReview = startWrongReview;
window.nextWrong        = nextWrong;
window.submitWrong      = submitWrong;

// 如果你在记忆/困难模式也用了 onclick，也一起暴露
window.startQuiz        = startQuiz;
window.nextMemory       = nextMemory;
window.submitMemory     = submitMemory;
window.giveUpMemory     = giveUpMemory;
window.nextHard         = nextHard;
window.submitHard       = submitHard;
window.giveUpHard       = giveUpHard;
window.switchTab        = switchTab;
