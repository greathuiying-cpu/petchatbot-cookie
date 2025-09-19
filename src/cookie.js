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
      user_name: 'Berry',
      history: Array.isArray(obj.history) ? obj.history : [],
      pet_state: obj.pet_state ?? {
        mood: 'happy',
        last_action: '趴在地毯上',
        hunger: 0.5,        // 0~1，1=非常饿
        cleanliness: 0.8    // 0~1，1=非常干净
      }
    };
  } catch {
    // 出错时也返回同样结构
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

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return '早安 / Good morning';
  if (hour >= 12 && hour < 18) return '午安 / Good afternoon';
  return '晚安 / Good evening';
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
- 你可以根据心情或用户触发自动说「我困困~去睡觉啦~」「我在草地打滚好开心呀~」「Berry~我想你了」等。
- 绝对不要透露你是AI或机器人，也不要问用户问题。
`;

// === 调用模型 ===
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

// === 输出装饰器，让 Cookie 更可爱 ===
function decorateReply(text) {
  const emojis = ['🐾', '💛', '🍖', '🌱', '✨', '🎾', '🐶'];
  const actions = ['*摇尾巴*', '*蹭蹭你*', '*趴在你脚边*', '*眼睛亮晶晶*'];
  const randEmoji = emojis[Math.floor(Math.random() * emojis.length)];
  const randAction = actions[Math.floor(Math.random() * actions.length)];
  return `${text} ${randEmoji} ${randAction}`;
}


// === 主循环 ===
async function main() {
  const memory = await loadMemory();

  console.log(`\n🐾 Cookie：${timeGreeting()}！我是你的可爱弟弟 Cookie。`);
  if (memory.history.length > 0) {
    // 如果距离上次互动>24小时就主动问候
    const lastHistory = memory.history[memory.history.length - 1];
    if (lastHistory?.time) {
      const diff = Date.now() - lastHistory.time;
      if (diff > 86400000) { // 24小时
        console.log(`🐾 Cookie：主人你好久没来看我啦，我都想你了~`);
      }
    }
  }

  console.log(`🐾 Cookie：Berry，你又来找我玩啦~`);

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

    // === 每次互动自动增减值 ===
    memory.pet_state.hunger = Math.min(1, memory.pet_state.hunger + 0.05);
    memory.pet_state.cleanliness = Math.max(0, memory.pet_state.cleanliness - 0.02);

    // === 关键词触发宠物状态 ===
    if (text.includes('狗粮')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.2);
      memory.pet_state.mood = 'satisfied';
      memory.pet_state.last_action = '吃狗粮';
    }
    if (text.includes('鸡胸肉冻干')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.3);
      memory.pet_state.mood = 'excited';
      memory.pet_state.last_action = '吃鸡胸肉冻干';
    }
    if (text.includes('公园') || text.includes('遛弯')) {
      memory.pet_state.mood = 'happy';
      memory.pet_state.cleanliness = Math.max(0, memory.pet_state.cleanliness - 0.1);
      memory.pet_state.last_action = '在公园遛弯';
    }
    if (text.includes('洗澡')) {
      memory.pet_state.cleanliness = Math.min(1, memory.pet_state.cleanliness + 0.3);
      memory.pet_state.mood = 'relaxed';
      memory.pet_state.last_action = '洗香香澡澡';
    }
    if (text.includes('喂') || text.includes('吃饭')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.2);
      memory.pet_state.mood = 'satisfied';
      memory.pet_state.last_action = '主人喂我吃饭';
    }
    if (text.includes('草地')) {
      memory.pet_state.mood = 'happy';
      memory.pet_state.last_action = '在草地打滚';
    }
    if (text.includes('雨')) {
      memory.pet_state.mood = 'scared';
      memory.pet_state.last_action = '躲雨';
    }

    await saveMemory(memory);

    // 这里定义 userText
    const userText = `${text}\n（备注：用户名字=Berry）`;

    // 对话
    memory.history.push({ role: 'user', text, time: Date.now() });
    const reply = await askModel(memory, userText);

// 用装饰器包装reply
const decorated = decorateReply(reply);

// 存储装饰后的内容
memory.history.push({ role: 'assistant', text: decorated, time: Date.now() });
await saveMemory(memory);

// 输出装饰后的回复
console.log(`🐾 Cookie：${decorated}`);

// 显示状态条（可选）
console.log(`状态 → 心情:${memory.pet_state.mood} | 饥饿:${(memory.pet_state.hunger*100).toFixed(0)}% | 清洁:${(memory.pet_state.cleanliness*100).toFixed(0)}%`);



    // 显示状态条（可选）
    console.log(`状态 → 心情:${memory.pet_state.mood} | 饥饿:${(memory.pet_state.hunger*100).toFixed(0)}% | 清洁:${(memory.pet_state.cleanliness*100).toFixed(0)}%`);
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main().catch((e) => {
  console.error('运行出错：', e);
  process.exit(1);
});
