async function postMessage({ channel, text, threadTs }) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN não configurada");
  if (!channel) throw new Error("channel não informado para postar no Slack");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: threadTs || undefined,
    }),
  });

  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack chat.postMessage falhou: ${data.error}`);
  }
  return data;
}

module.exports = { postMessage };
