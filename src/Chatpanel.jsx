import { useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";

const BACKEND_URL = "http://localhost:8080";

function mergeMessages(messages) {
  const unique = new Map();

  for (const message of messages) {
    const key = message.timestamp
      ? message.timestamp
      : `${message.sender || ""}:${message.text || ""}`;
    unique.set(key, message);
  }

  return [...unique.values()];
}

export default function ChatPanel({ room, name }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    let loadingHistory = false;
    let pendingMessages = [];

    const client = new Client({
      brokerURL: "ws://localhost:8080/ws",
      reconnectDelay: 5000,

      onConnect: () => {
        setConnected(true);
        setError("");
        loadingHistory = true;
        pendingMessages = [];

        client.subscribe(`/topic/rooms/${room.code}/chat`, (frame) => {
          try {
            const incoming = JSON.parse(frame.body);

            if (loadingHistory) {
              pendingMessages.push(incoming);
            } else {
              setMessages((current) =>
                mergeMessages([...current, incoming])
              );
            }
          } catch {
            // Ignore malformed chat messages.
          }
        });

        fetch(`${BACKEND_URL}/api/rooms/${room.code}/chat`)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Could not load chat history.");
            }
            return response.json();
          })
          .then((history) => {
            setMessages(
              mergeMessages([
                ...(Array.isArray(history) ? history : []),
                ...pendingMessages,
              ])
            );
            loadingHistory = false;
            pendingMessages = [];
          })
          .catch((fetchError) => {
            console.error("Could not load chat history:", fetchError);
            setError("Chat history could not be loaded.");
            setMessages((current) =>
              mergeMessages([...current, ...pendingMessages])
            );
            loadingHistory = false;
            pendingMessages = [];
          });
      },

      onStompError: () => {
        setConnected(false);
        setError("Chat connection was interrupted. Reconnecting…");
      },
      onWebSocketClose: () => {
        setConnected(false);
        setError("Chat connection was interrupted. Reconnecting…");
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [room.code]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(event) {
    event.preventDefault();

    const messageText = text.trim();
    const client = clientRef.current;

    if (
      !messageText ||
      messageText.length > 2000 ||
      !connected ||
      !client?.connected
    ) {
      return;
    }

    client.publish({
      destination: `/app/rooms/${room.code}/chat`,
      body: JSON.stringify({
        sender: name,
        text: messageText,
      }),
    });

    setText("");
  }

  return (
    <aside className="chat-panel">
      <header className="chat-header">
        <div>
          <p className="eyebrow">ROOM CONVERSATION</p>
          <h2>Chat</h2>
        </div>
        <span className={`connection-pill ${connected ? "is-connected" : ""}`}>
          <span className="connection-dot" />
          {connected ? "Live" : "Connecting"}
        </span>
      </header>

      {error && <p className="chat-status-message">{error}</p>}

      <div className="chat-messages" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <span aria-hidden="true">✦</span>
            <p>No messages yet.</p>
            <small>Say hello to everyone in the room.</small>
          </div>
        ) : (
          messages.map((message, index) => {
            const mine = message.sender === name;
            const time = message.timestamp
              ? new Date(message.timestamp).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "";

            return (
              <article
                className={`chat-message ${mine ? "mine" : ""}`}
                key={message.timestamp || `${message.sender}-${index}`}
              >
                <div className="chat-message-meta">
                  <strong>{mine ? "You" : message.sender || "Someone"}</strong>
                  {time && <time>{time}</time>}
                </div>
                <p>{message.text || ""}</p>
              </article>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-composer" onSubmit={sendMessage}>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={connected ? "Message the room…" : "Connecting to chat…"}
          maxLength={2000}
          rows={2}
          disabled={!connected}
          aria-label="Write a chat message"
        />
        <div className="chat-composer-footer">
          <small>{text.length}/2000</small>
          <button
            type="submit"
            className="primary-button"
            disabled={!connected || !text.trim()}
          >
            Send
          </button>
        </div>
      </form>
    </aside>
  );
}