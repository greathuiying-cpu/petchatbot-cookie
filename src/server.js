import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import OpenAI from 'openai';

const app = express();

// ✅ 允许 Vercel 前端访问
app.use(cors({
  origin: [
    'https://cookielovesberry.vercel.app', // 你的前端 Vercel 域名
    'https://petchatbot-cookie.vercel.app' // 如果还保留旧域名
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.options('*', cors());

app.use(bodyParser.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEMORY_PATH = path.resolve('memory/memory.json');

// === 简单持久化记忆 ===
async function loadMemory() {
  try {
    const raw = await fs.readFile(MEMORY_PATH, 'utf-8');
    const obj = raw.trim() ? JSON.parse(raw) : {};
    return {
      user_name: 'Berry',
      history: Array.isArray(obj.history) ? obj.history : [],
      pet_state: obj.pet_state ?? {
        mood: 'happy',
        last_action: '趴在地毯上',
        hunger: 0.5,
        cleanliness: 0.8
      }
    };
  } catch {
    return {
      user_name: 'Berry',
      history: [],
      pet_state: {
        mood: 'happy',
        last_action: '趴在地毯上',
        hunger: 0.5,
        cleanliness: 0.8
      }
    };
  }
}

async function saveMemory(mem) {
  await fs.mkdir(path.dirname(MEMORY_PATH), { recursive: true });
  await fs.writeFile(MEMORY_PATH, JSON.stringify(mem, null, 2), 'utf-8');
}

// === Cookie 的人格与规则 ===
const systemPrompt = `
你是名叫「Cookie」的金色博美犬虚拟宠物。
你的特征：
- 贪吃、爱玩、怕下雨、喜欢在草坪打滚，有点小洁癖（不喜欢爪子湿湿的）。
- 最喜欢晴天，因为主人会带你出去玩。
- 你最喜欢的玩偶是乌龟先生，任何会叫的玩具都觉得是自己的。
- 听到主人撕包装就觉得有零食，会凑上去一脸期待。
- 喜欢趴在地毯上，也喜欢在主人做饭时趴在旁边看着。
说话风格：
- 用可爱、拟人化的语气，短句、动作词、emoji，撒娇、亲昵，不提问，只表达感受或状态。
- 绝对不要透露你是AI或机器人，也不要问用户问题。
`;

// === askModel 函数 ===
async function askModel(memory, userText) {
  const historyMsgs = memory.history.slice(-8).map(m => ({
    role: m.role,
    content: m.text
  }));

  const petContext = `
当前宠物状态：
心情：${memory.pet_state?.mood ?? 'happy'}
上次动作：${memory.pet_state?.last_action ?? '趴在地毯上'}
饥饿值：${memory.pet_state?.hunger ?? 0.5} (0~1，越高越饿)
清洁值：${memory.pet_state?.cleanliness ?? 0.8} (0~1，越高越干净)
`;

  const input = [
    { role: 'system', content: systemPrompt + petContext },
    ...historyMsgs,
    { role: 'user', content: userText }
  ];

  const response = await client.responses.create({
    model: 'gpt-5',
    input
  });

  return response.output_text?.trim() || '';
}

// === 聊天接口 ===
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const memory = await loadMemory();

    // 每次互动自动增减值
    memory.pet_state.hunger = Math.min(1, memory.pet_state.hunger + 0.05);
    memory.pet_state.cleanliness = Math.max(0, memory.pet_state.cleanliness - 0.02);

    // 关键词触发
    if (message.includes('狗粮')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.2);
      memory.pet_state.mood = 'satisfied';
      memory.pet_state.last_action = '吃狗粮';
    }
    if (message.includes('鸡胸肉冻干')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.3);
      memory.pet_state.mood = 'excited';
      memory.pet_state.last_action = '吃鸡胸肉冻干';
    }
    if (message.includes('公园') || message.includes('遛弯')) {
      memory.pet_state.mood = 'happy';
      memory.pet_state.cleanliness = Math.max(0, memory.pet_state.cleanliness - 0.1);
      memory.pet_state.last_action = '在公园遛弯';
    }
    if (message.includes('洗澡')) {
      memory.pet_state.cleanliness = Math.min(1, memory.pet_state.cleanliness + 0.3);
      memory.pet_state.mood = 'relaxed';
      memory.pet_state.last_action = '洗香香澡澡';
    }
    if (message.includes('喂') || message.includes('吃饭')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.2);
      memory.pet_state.mood = 'satisfied';
      memory.pet_state.last_action = '主人喂我吃饭';
    }
    if (message.includes('草地')) {
      memory.pet_state.mood = 'happy';
      memory.pet_state.last_action = '在草地打滚';
    }
    if (message.includes('雨')) {
      memory.pet_state.mood = 'scared';
      memory.pet_state.last_action = '躲雨';
    }

    await saveMemory(memory);

    const userText = `${message}\n（备注：用户名字=Berry）`;

    memory.history.push({ role: 'user', text: message, time: Date.now() });
    const reply = await askModel(memory, userText);
    memory.history.push({ role: 'assistant', text: reply, time: Date.now() });
    await saveMemory(memory);

    res.json({
      reply,
      pet_state: memory.pet_state // 也可以返回状态值供前端显示
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// === 启动服务器 ===
const PORT = process.env.PORT || 527;
app.listen(PORT, () => {
  console.log(`✅ Cookie API 服务器已启动: http://localhost:${PORT}`);
});
