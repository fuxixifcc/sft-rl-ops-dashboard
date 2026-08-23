const deepseekEndpoint = "https://api.deepseek.com/chat/completions";

export default async function handler(request: { method?: string; body?: unknown }, response: { status: (code: number) => { json: (body: unknown) => void }; setHeader: (name: string, value: string) => void }) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ error: "只支持 POST 请求。" });
    return;
  }

  const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body as { question?: unknown; context?: unknown };
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 2000) {
    response.status(400).json({ error: "请输入不超过 2000 个字符的问题。" });
    return;
  }

  const apiKey = process.env.deepseek ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: "问答服务尚未配置。" });
    return;
  }

  try {
    const upstream = await fetch(deepseekEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        temperature: 0.35,
        max_tokens: 700,
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        messages: [
          { role: "system", content: "你是 SFT / RL 任务运营看板的中文运营助手。根据用户问题和页面上下文，给出简洁、可执行的建议。不要编造页面未提供的实时数值；缺少数据时明确说明，并建议用户查看对应模块。" },
          { role: "user", content: `页面上下文：${JSON.stringify(body.context ?? {})}\n\n用户问题：${question}` },
        ],
      }),
    });
    const payload = await upstream.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!upstream.ok || !answer) throw new Error(payload.error?.message || "模型没有返回可用答案。");
    response.status(200).json({ answer });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : "模型服务连接失败。" });
  }
}
