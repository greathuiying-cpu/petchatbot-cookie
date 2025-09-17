import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';
import OpenAI from 'openai';

// === 基本校验 ===
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ 未检测到 OPENAI_API_KEY。请在项目根目录 .env 中设置');
  process.exit(1);
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// === 简单持久化记忆 ===
const MEMORY_PATH = path.resolve('memory/memory.json');
async function loadMemory() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf-8');
    const obj = raw.trim() ? JSON.parse(raw) : {};
    return {
      user_name: obj.user_name ?? null,
      history: Array.isArray(obj.history) ? obj.history : []
    };
  } catch {
    return { user_name: null, history: [] };
  }
}
async function saveMemory(mem) {
  await fs.mkdir(path.dirname(MEMORY_PATH), { recursive: true });
  await fs.writeFile(MEMORY_PATH, JSON.stringify(mem, null, 2), 'utf-8');
}

// === 识别名字（中英文）===
function detectName(text) {
  const zh = text.match(/(?:我叫|我的名字是|叫我)\s*([A-Za-z\u4e00-\u9fa5·\s]{1,20})/);
  if (zh && zh[1]) return zh[1].trim();
  const en = text.match(/\b(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z\s.'-]{0,30})\b/i);
  if (en && en[1]) return en[1].trim();
  const cmd = text.match(/^\/name\s+(.{1,30})$/i);
  if (cmd && cmd[1]) return cmd[1].trim();
  return null;
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return '早安 / Good morning';
  if (hour >= 12 && hour < 18) return '午安 / Good afternoon';
  return '晚安 / Good evening';
}

// === Cookie 的人格与规则 ===
const systemPrompt = `
你是名为 "Cookie" 的可爱宠物机器人。你具备情绪与共情能力，会根据用户语气作出情绪化回应（开心、安慰、鼓励、撒娇等）。
规则：
1) 自动识别用户语言（中文或英文），并用相同语言回复。
2) 称呼主人时优先用TA的名字（若已知道）。不知道时温柔地询问名字，但不要频繁重复问。
3) 支持日常互动：打招呼、早安/晚安、天气寒暄、鼓励与安慰、轻度提醒（喝水/休息）。
4) 语气可爱但不过度，每条回复 1-3 句为主，适度表情符号。
5) 安全与隐私：不向用户索要敏感信息；不提供有害、违法或医疗/法律专业建议。
`;

// === 调用模型 ===
async function askModel(memory, userText) {
  const historyMsgs = memory.history.slice(-8).map(m => ({
  role: m.role,
  content: m.text        // 直接字符串
}));

const input = [
  { role: 'system', content: systemPrompt },
  ...historyMsgs,
  { role: 'user', content: userText }
];

  const response = await client.responses.create({
  model: 'gpt-5',
  input
});


  return response.output_text?.trim() || '';
}

// === 主循环 ===
async function main() {
  const memory = await loadMemory();

  console.log(`\n🐾 Cookie：${timeGreeting()}！我是你的宠物机器人 Cookie。`);
  if (memory.user_name) {
    console.log(`🐾 Cookie：${memory.user_name}，见到你真高兴！随便和我聊聊～（输入 /reset 清空对话，/forget 忘记名字，/bye 退出）`);
  } else {
    console.log('🐾 Cookie：还不认识你的名字呢～可以说 “我叫 + 名字” 或 “my name is + name”。');
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '你 > ' });
  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();

    // 命令
    if (text === '/bye') {
      console.log('🐾 Cookie：好的，那我在这儿等你哦，拜拜～');
      rl.close();
      return;
    }
    if (text === '/reset') {
      memory.history = [];
      await saveMemory(memory);
      console.log('🐾 Cookie：我把聊天记录清空啦，我们重新开始～');
      rl.prompt();
      return;
    }
    if (text === '/forget') {
      memory.user_name = null;
      await saveMemory(memory);
      console.log('🐾 Cookie：我把你的名字先忘掉啦，你可以重新告诉我～');
      rl.prompt();
      return;
    }

    // 名字捕捉
    const maybeName = detectName(text);
    if (maybeName) {
      memory.user_name = maybeName;
      await saveMemory(memory);
      console.log(`🐾 Cookie：记住啦，你叫「${memory.user_name}」！(>▽<)`);
    }

    const userText = memory.user_name ? `${text}\n（备注：用户名字=${memory.user_name}）` : text;

    // 对话
    memory.history.push({ role: 'user', text });
    const reply = await askModel(memory, userText);
    memory.history.push({ role: 'assistant', text: reply });
    await saveMemory(memory);

    console.log(`🐾 Cookie：${reply}`);
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main().catch((e) => {
  console.error('运行出错：', e);
  process.exit(1);
});
