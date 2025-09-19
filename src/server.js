// 新版人格
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

// 聊天接口
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    const memory = await loadMemory();

    // 在这里加宠物状态（和 cookie.js 一致）
    if (!memory.pet_state) {
      memory.pet_state = { mood: 'happy', last_action: '趴在地毯上', hunger: 0.5, cleanliness: 0.8 };
    }

    // 关键词触发（示例）
    if (message.includes('狗粮')) {
      memory.pet_state.hunger = Math.max(0, memory.pet_state.hunger - 0.2);
      memory.pet_state.mood = 'satisfied';
      memory.pet_state.last_action = '吃狗粮';
    }

    // 你可以在这里补更多关键词…

    await saveMemory(memory);

    // 构造上下文
    const historyMsgs = memory.history.slice(-8).map(m => ({
      role: m.role,
      content: m.text
    }));

    // 拼 petContext
    const petContext = `
当前宠物状态：
心情：${memory.pet_state.mood}
上次动作：${memory.pet_state.last_action}
饥饿值：${memory.pet_state.hunger}
清洁值：${memory.pet_state.cleanliness}
`;

    const input = [
      { role: 'system', content: systemPrompt + petContext },
      ...historyMsgs,
      { role: 'user', content: message + '\n（备注：用户名字=Berry）' }
    ];

    const response = await client.responses.create({
      model: 'gpt-5',
      input
    });

    const reply = response.output_text?.trim() || '（无回复）';

    // 保存历史
    memory.history.push({ role: 'user', text: message });
    memory.history.push({ role: 'assistant', text: reply });
    await saveMemory(memory);

    res.json({ reply, pet_state: memory.pet_state });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
