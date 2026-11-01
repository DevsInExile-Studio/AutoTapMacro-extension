chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'OFFSCREEN_CLIPBOARD' || sender.tab || sender.url !== chrome.runtime.getURL('background.js')) return;
  navigator.clipboard.writeText(String(message.text)).catch(error => { const input = document.createElement('textarea'); input.value = String(message.text); document.body.append(input); input.select(); const copied = document.execCommand('copy'); input.remove(); if (!copied) throw error; }).then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
  return true;
});
