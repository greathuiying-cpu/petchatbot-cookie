import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MEMORY_PATH = path.resolve('memory/memory.json');

// 简单持久化记忆
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

// Cookie 的人格
const systemPrompt = `
你是名为 "Cookie" 的可爱宠物机器人。你具备情绪与共情能力，会根据用户语气作出情绪化回应（开心、安慰、鼓励、撒娇等）。
规则：
1) 自动识别用户语言（中文或英文），并用相同语言回复。
2) 称呼主人时优先用TA的名字（若已知道）。不知道时温柔地询问名字，但不要频繁重复问。
3) 支持日常互动：打招呼、早安/晚安、天气寒暄、鼓励与安慰、轻度提醒（喝水/休息）。
4) 语气可爱但不过度，每条回复 1-3 句为主，适度表情符号。
5) 安全与隐私：不向用户索要敏感信息；不提供有害、违法或医疗/法律专业建议。
`;

// 静态托管 public 文件夹
app.use(express.static('public'));

// 聊天接口
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const memory = await loadMemory();

    // 构造上下文（取最近8轮）
    const historyMsgs = memory.history.slice(-8).map(m => ({
      role: m.role,
      content: m.text
    }));

    const input = [
      { role: 'system', content: systemPrompt },
      ...historyMsgs,
      { role: 'user', content: message }
    ];

    const response = await client.responses.create({
      model: 'gpt-5',
      input
    });

    const reply = response.output_text?.trim() || '';

    // 保存历史
    memory.history.push({ role: 'user', text: message });
    memory.history.push({ role: 'assistant', text: reply });
    await saveMemory(memory);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 527;
app.listen(PORT, () => {
  console.log(`✅ Cookie API 服务器已启动: http://localhost:${PORT}`);
});


