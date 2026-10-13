import { useEffect, useState } from "react";
import BoardRoom from "./BoardRoom";
import ChatPanel from "./Chatpanel";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");
const ROOMS_API = `${BACKEND_URL}/api/rooms`;

async function responseError(response, fallback) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState(() => {
  const code = new URLSearchParams(window.location.search).get("room");
  return code ? code.trim().toUpperCase().slice(0, 8) : "";
});
  const [room, setRoom] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!room?.code) return undefined;

    let active = true;

    async function refreshRoom() {
      try {
        const response = await fetch(
          `${ROOMS_API}/${encodeURIComponent(room.code)}`
        );

        if (response.status === 404) {
          if (active) {
            setRoom(null);
            setMessage("This room no longer exists. Create or join another room.");
          }
          return;
        }

        if (!response.ok) return;

        const latestRoom = await response.json();
        if (active) setRoom(latestRoom);
      } catch {
        // Keep the existing room view if a refresh briefly fails.
      }
    }

    const timer = window.setInterval(refreshRoom, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [room?.code]);

  async function createRoom(event) {
    event.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) {
      setMessage("Enter your name before creating a room.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(ROOMS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: cleanName }),
      });

      if (!response.ok) {
        throw new Error(await responseError(response, "Could not create the room."));
      }

      const createdRoom = await response.json();
      setName(cleanName);
      setRoomCode(createdRoom.code);
      setRoom(createdRoom);
    } catch (error) {
      setMessage(error.message || "Could not reach the backend. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(event) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanCode = roomCode.trim().toUpperCase();

    if (!cleanName || !cleanCode) {
      setMessage("Enter your name and the room code first.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `${ROOMS_API}/${encodeURIComponent(cleanCode)}/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cleanName }),
        }
      );

      if (!response.ok) {
        throw new Error(await responseError(response, "Room not found. Check the code."));
      }

      const joinedRoom = await response.json();
      setName(cleanName);
      setRoomCode(joinedRoom.code);
      setRoom(joinedRoom);
    } catch (error) {
      setMessage(error.message || "Could not join the room. Check the code and backend.");
    } finally {
      setBusy(false);
    }
  }

  function leaveRoom() {
    setRoom(null);
    setMessage("");
  }

  if (room) {
    const participants = Array.isArray(room.participants)
      ? room.participants
      : [];

    return (
      <main className="app-shell workspace-shell">
        <header className="workspace-topbar">
          <a className="brand-lockup" href="/" onClick={(event) => event.preventDefault()}>
            <span className="brand-icon" aria-hidden="true">S</span>
            <span>SyncBoard</span>
          </a>

          <div className="workspace-presence">
            <span className="presence-label">IN THIS ROOM</span>
            <div className="participant-list">
              {participants.length > 0 ? (
                participants.map((participant) => (
                  <span className="participant-chip" key={participant}>
                    <span className="participant-dot" />
                    {participant}
                  </span>
                ))
              ) : (
                <span className="participant-chip">
                  <span className="participant-dot" />
                  {name}
                </span>
              )}
            </div>
          </div>

          <button className="leave-button" type="button" onClick={leaveRoom}>
            Leave room
          </button>
        </header>

        <div className="collaboration-layout">
          <BoardRoom room={room} name={name} />
          <ChatPanel room={room} name={name} />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell landing-screen">
      <div className="landing-backdrop" aria-hidden="true">
        <div className="landing-preview">
          <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <path d="M80 500 C210 430, 170 230, 340 270 S450 520, 610 390 S780 110, 910 235 S850 570, 1080 490" />
            <path d="M180 660 C290 570, 360 650, 460 540 S600 610, 700 660 S850 550, 980 620" />
            <circle cx="870" cy="390" r="95" />
            <rect x="275" y="130" width="190" height="130" rx="18" />
          </svg>
        </div>
        <div className="landing-backdrop-wash" />
      </div>

      <section className="landing-content">
        <a className="brand-lockup landing-brand" href="/" onClick={(event) => event.preventDefault()}>
          <span className="brand-icon" aria-hidden="true">S</span>
          <span>SyncBoard</span>
        </a>

        <div className="landing-copy">
          <p className="eyebrow">THINK TOGETHER, IN REAL TIME</p>
          <h1>One canvas.<br /><span>Many minds.</span></h1>
          <p className="landing-description">
            Sketch ideas, map them out, and keep the conversation right beside
            your work.
          </p>
        </div>

        <section className="entry-card" aria-label="Create or join a room">
          <label className="form-field">
            <span>Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
              maxLength={40}
              autoComplete="name"
            />
          </label>

          <button
            className="primary-button create-room-button"
            type="button"
            onClick={createRoom}
            disabled={busy || !name.trim()}
          >
            {busy ? "Please wait…" : "Create a new room"}
            <span aria-hidden="true">↗</span>
          </button>

          <div className="form-divider"><span>OR JOIN A ROOM</span></div>

          <form className="join-form" onSubmit={joinRoom}>
            <label className="form-field">
              <span>Room code</span>
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="Enter invite code"
                maxLength={8}
                autoCapitalize="characters"
              />
            </label>
            <button
              className="secondary-button join-room-button"
              type="submit"
              disabled={busy || !name.trim() || !roomCode.trim()}
            >
              Join room
            </button>
          </form>

          {message && <p className="landing-message" role="alert">{message}</p>}
        </section>

        <p className="landing-footnote">
          Private rooms · Live collaboration · No account required
        </p>
      </section>
    </main>
  );
}

export default App;