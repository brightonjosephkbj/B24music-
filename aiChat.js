import { authedHeaders, API_BASE } from "./apiClient";
import { resolvePlaylistFromAIData } from "./aiPlaylist";

// Sends one message to the AI chat endpoint. Server keeps the last 20
// messages per user_id in memory (resets on Space restart) - we don't need
// to resend history ourselves, just the new message plus an optional reset.
export async function sendChatMessage(message, { reset = false } = {}) {
  const res = await fetch(`${API_BASE}/api/apicache/api/ai/chat`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, reset }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.provider) {
    throw new Error(data.error || "AI chat failed - try again in a bit.");
  }
  return data.content;
}


// Streams a reply using XHR (not fetch) because React Native's fetch does
// not expose the response body as a readable stream - XHR's onprogress
// does give incremental responseText as SSE bytes arrive, which is the
// standard RN workaround for this. Callbacks fire as chunks come in.
export function streamChatMessage(message, { reset = false } = {}, callbacks = {}) {
  const { onThinking, onContent, onError, onDone } = callbacks;

  return authedHeaders({ "Content-Type": "application/json" }).then(
    (headers) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/api/apicache/api/ai/chat/stream`);
        Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

        let lastIndex = 0;

        xhr.onprogress = () => {
          const newText = xhr.responseText.substring(lastIndex);
          lastIndex = xhr.responseText.length;
          const chunks = newText.split("\n\n").filter(Boolean);

          for (const chunk of chunks) {
            if (!chunk.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(chunk.slice(6));
              if (evt.type === "thinking") onThinking && onThinking(evt.text);
              else if (evt.type === "content") onContent && onContent(evt.text);
              else if (evt.type === "error") onError && onError(evt.text);
              else if (evt.type === "done") onDone && onDone();
            } catch {
              // partial/incomplete JSON mid-chunk - wait for more data
            }
          }
        };

        xhr.onerror = () => {
          onError && onError("Network error");
          reject(new Error("Network error"));
        };
        xhr.onload = () => resolve();

        xhr.send(JSON.stringify({ message, reset }));
      })
  );
}

// Free-text playlist request from the chat's Playlist mode - hits the
// chat_playlist endpoint (built from the raw request text, not a taste
// profile), then resolves/saves it the same way generateAIPlaylist() does.
export async function generateChatPlaylist(promptText) {
  const res = await fetch(`${API_BASE}/api/apicache/api/ai/chat_playlist`, {
    method: "POST",
    headers: await authedHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prompt: promptText }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Couldn't generate that playlist - try again.");
  }
  return resolvePlaylistFromAIData(data);
}