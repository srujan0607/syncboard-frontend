import { useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8080").replace(/\/$/, "");

function paintEvent(canvas, event) {
  if (!canvas || !event) return;

  if (event.type === "clear") {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const context = canvas.getContext("2d");
  if (!context) return;

  context.save();
  context.strokeStyle = event.color || "#2457d6";
  context.fillStyle = event.color || "#2457d6";
  context.lineWidth = Number(event.width) || 4;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalCompositeOperation =
    event.tool === "eraser" ? "destination-out" : "source-over";

  if (event.type === "shape") {
    const x = Number(event.x);
    const y = Number(event.y);
    const width = Number(event.w);
    const height = Number(event.h);

    if (event.shape === "rectangle") {
      context.strokeRect(x, y, width, height);
    } else if (event.shape === "circle") {
      context.beginPath();
      context.ellipse(
        x + width / 2,
        y + height / 2,
        Math.abs(width / 2),
        Math.abs(height / 2),
        0,
        0,
        Math.PI * 2
      );
      context.stroke();
    }

    context.restore();
    return;
  }
  if (event.type === "note") {
    const x = Number(event.x);
    const y = Number(event.y);
    const noteWidth = 280;
    const noteHeight = 180;

    context.globalCompositeOperation = "source-over";
    context.shadowColor = "rgba(20, 24, 40, 0.18)";
    context.shadowBlur = 12;
    context.fillStyle = "#fff1b8";
    context.fillRect(x, y, noteWidth, noteHeight);
    context.shadowBlur = 0;
    context.strokeStyle = "#e2ca72";
    context.lineWidth = 2;
    context.strokeRect(x, y, noteWidth, noteHeight);

    context.fillStyle = "#5c5132";
    context.font = "bold 13px sans-serif";
    context.fillText("NOTE", x + 14, y + 23);

    context.fillStyle = event.color || "#30334a";
    context.font = "16px sans-serif";

    const words = String(event.text || "").split(/\s+/);
    const lines = [];
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;

      if (context.measureText(candidate).width > 248 && line) {
        lines.push(line);
        line = word;
        if (lines.length === 5) break;
      } else {
        line = candidate;
      }
    }

    if (line && lines.length < 6) lines.push(line);

    lines.slice(0, 6).forEach((noteLine, index) => {
      context.fillText(noteLine, x + 14, y + 50 + index * 21);
    });

    context.restore();
    return;
  }
  const points = event.points;
  if (!Array.isArray(points) || points.length === 0) {
    context.restore();
    return;
  }

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

export default function BoardRoom({ room, name }) {
  const canvasRef = useRef(null);
  const clientRef = useRef(null);
  const clientIdRef = useRef(`${Date.now()}-${Math.random()}`);
  const drawingRef = useRef(false);
  const currentEventRef = useRef(null);
  const eventsRef = useRef([]);
  const seenEventIdsRef = useRef(new Set());

  const [color, setColor] = useState("#2457d6");
  const [brushSize, setBrushSize] = useState(4);
  const [tool, setTool] = useState("pen");
  const [connected, setConnected] = useState(false);

  function redrawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    eventsRef.current.forEach((event) => paintEvent(canvas, event));

    if (currentEventRef.current) {
      paintEvent(canvas, currentEventRef.current);
    }
  }

  function receiveEvent(event) {
    if (event.type === "clear") {
      eventsRef.current = [];
      seenEventIdsRef.current.clear();
      currentEventRef.current = null;
      redrawCanvas();
      return;
    }
    if (event.type === "undo") {
  eventsRef.current = eventsRef.current.filter(
    (drawingEvent) => drawingEvent.eventId !== event.eventId
  );
  redrawCanvas();
  return;
}

if (event.type === "redo") {
  const restoredEvent = event.drawingEvent;
  if (!restoredEvent) return;

  eventsRef.current = eventsRef.current.filter(
    (drawingEvent) => drawingEvent.eventId !== restoredEvent.eventId
  );
  eventsRef.current.push(restoredEvent);
  seenEventIdsRef.current.add(restoredEvent.eventId);
  redrawCanvas();
  return;
}
    if (event.type === "undo") {
  eventsRef.current = eventsRef.current.filter(
    (drawingEvent) => drawingEvent.eventId !== event.eventId
  );
  redrawCanvas();
  return;
}

    if (event.senderId === clientIdRef.current) return;

    if (event.eventId && seenEventIdsRef.current.has(event.eventId)) return;
    if (event.eventId) seenEventIdsRef.current.add(event.eventId);

    eventsRef.current.push(event);
    paintEvent(canvasRef.current, event);
  }

  useEffect(() => {
    let loadingHistory = false;
    let pendingEvents = [];

    const client = new Client({
      brokerURL: `${BACKEND_URL.replace(/^http/, "ws")}/ws`,
      reconnectDelay: 5000,

      onConnect: () => {
        setConnected(true);
        loadingHistory = true;
        pendingEvents = [];

        client.subscribe(
          `/topic/rooms/${room.code}/drawing`,
          (message) => {
            try {
              const event = JSON.parse(message.body);

              if (loadingHistory) {
                pendingEvents.push(event);
              } else {
                receiveEvent(event);
              }
            } catch {
              // Ignore malformed drawing events.
            }
          }
        );

        fetch(`${BACKEND_URL}/api/rooms/${room.code}/drawing`)
          .then((response) => {
            if (!response.ok) {
              throw new Error("Could not load drawing history.");
            }
            return response.json();
          })
          .then((history) => {
            eventsRef.current = Array.isArray(history) ? history : [];
            seenEventIdsRef.current = new Set(
              eventsRef.current.map((event) => event.eventId).filter(Boolean)
            );

            loadingHistory = false;
            pendingEvents.forEach(receiveEvent);
            pendingEvents = [];
            redrawCanvas();
          })
          .catch((error) => {
            console.error("Could not load drawing history:", error);
            loadingHistory = false;
            pendingEvents.forEach(receiveEvent);
            pendingEvents = [];
          });
      },

      onStompError: () => setConnected(false),
      onWebSocketClose: () => setConnected(false),
    });

    clientRef.current = client;
    client.activate();

    return () => {
      client.deactivate();
      clientRef.current = null;
      setConnected(false);
    };
  }, [room.code]);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function startDrawing(event) {
    if (!connected || !canvasRef.current) return;

    const point = getPoint(event);
        if (tool === "note") {
      const noteText = window.prompt("Write a note (up to 500 characters):");

      if (!noteText?.trim() || !clientRef.current?.connected) return;

      const noteEvent = {
        type: "note",
        senderId: clientIdRef.current,
        eventId: `${clientIdRef.current}-${Date.now()}-${Math.random()}`,
        color,
        x: point.x,
        y: point.y,
        text: noteText.trim().slice(0, 500),
      };

      eventsRef.current.push(noteEvent);
      seenEventIdsRef.current.add(noteEvent.eventId);
      redrawCanvas();

      clientRef.current.publish({
        destination: `/app/rooms/${room.code}/drawing`,
        body: JSON.stringify(noteEvent),
      });

      return;
    }
    drawingRef.current = true;

    currentEventRef.current =
      tool === "rectangle" || tool === "circle"
        ? {
            type: "shape",
            shape: tool,
            senderId: clientIdRef.current,
            eventId: `${clientIdRef.current}-${Date.now()}-${Math.random()}`,
            color,
            width: Number(brushSize),
            x: point.x,
            y: point.y,
            w: 0,
            h: 0,
          }
        : {
            type: "stroke",
            tool,
            senderId: clientIdRef.current,
            eventId: `${clientIdRef.current}-${Date.now()}-${Math.random()}`,
            color,
            width: Number(brushSize),
            points: [point],
          };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event) {
    if (!drawingRef.current || !currentEventRef.current) return;

    const point = getPoint(event);
    const current = currentEventRef.current;

    if (current.type === "shape") {
      current.w = point.x - current.x;
      current.h = point.y - current.y;
    } else {
      current.points.push(point);
    }

    redrawCanvas();
  }

  function stopDrawing() {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    const completedEvent = currentEventRef.current;
    currentEventRef.current = null;

    if (!completedEvent || !clientRef.current?.connected) {
      redrawCanvas();
      return;
    }

    const isDrawable =
      completedEvent.type === "shape"
        ? Math.abs(completedEvent.w) > 1 || Math.abs(completedEvent.h) > 1
        : completedEvent.points.length > 0;

    if (!isDrawable) {
      redrawCanvas();
      return;
    }

    eventsRef.current.push(completedEvent);
    seenEventIdsRef.current.add(completedEvent.eventId);
    redrawCanvas();

    clientRef.current.publish({
      destination: `/app/rooms/${room.code}/drawing`,
      body: JSON.stringify(completedEvent),
    });
  }
  function redoBoard() {
  if (!clientRef.current?.connected) return;

  clientRef.current.publish({
    destination: `/app/rooms/${room.code}/drawing`,
    body: JSON.stringify({ type: "redo" }),
  });
}
function undoBoard() {
  if (!clientRef.current?.connected) return;

  clientRef.current.publish({
    destination: `/app/rooms/${room.code}/drawing`,
    body: JSON.stringify({ type: "undo" }),
  });
}
  function clearBoard() {
    eventsRef.current = [];
    seenEventIdsRef.current.clear();
    currentEventRef.current = null;
    redrawCanvas();

    if (clientRef.current?.connected) {
      clientRef.current.publish({
        destination: `/app/rooms/${room.code}/drawing`,
        body: JSON.stringify({ type: "clear" }),
      });
    }
  }
function downloadBoard() {
  const canvas = canvasRef.current;
  if (!canvas) return;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;

  const context = exportCanvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  context.drawImage(canvas, 0, 0);

  const link = document.createElement("a");
  link.download = `syncboard-${room.code}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}
  async function copyRoomCode() {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set("room", room.code);
  const inviteLink = inviteUrl.toString();

  try {
    await navigator.clipboard.writeText(inviteLink);
    window.alert("Invite link copied.");
  } catch {
    window.alert(`Copy this invite link: ${inviteLink}`);
  }
}
  return (
    <section className="board-room">
      <header className="board-header">
        <div>
          <p className="eyebrow">SYNCBOARD ROOM</p>
          <h2>{room.code}</h2>
          <p className="room-byline">You’re collaborating as {name}.</p>
          <p className="room-byline">
  In this room:{" "}
  {Array.isArray(room.participants) && room.participants.length
    ? room.participants.join(", ")
    : name}
</p>
        </div>

        <div className="board-header-actions">
          <span className={`connection-pill ${connected ? "is-connected" : ""}`}>
            <span className="connection-dot" />
            {connected ? "Live" : "Connecting"}
          </span>
          <button className="secondary-button" type="button" onClick={copyRoomCode}>
            Copy invite code
          </button>
          <button
  className="secondary-button"
  type="button"
  onClick={undoBoard}
  disabled={!connected}
>
  Undo last
</button>
          <button className="secondary-button" type="button" onClick={downloadBoard}>
  Download board
</button>
          <button className="danger-button" type="button" onClick={clearBoard}>
            Clear board
          </button>
        </div>
      </header>

      <div className="drawing-toolbar" aria-label="Drawing tools">
        <div className="tool-group">
          <button
            type="button"
            className={tool === "pen" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("pen")}
          >
            Pen
          </button>
          <button
            type="button"
            className={tool === "eraser" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("eraser")}
          >
            Eraser
          </button>
          <button
            type="button"
            className={tool === "rectangle" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("rectangle")}
          >
            Rectangle
          </button>
          <button
            type="button"
            className={tool === "circle" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("circle")}
          >
            Circle
          </button>
        </div>
          <button
            type="button"
            className={tool === "note" ? "tool-button active" : "tool-button"}
            onClick={() => setTool("note")}
          >
            Note
          </button>
        <label className="toolbar-control">
          Color
          <input
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="Choose drawing color"
          />
        </label>

        <label className="toolbar-control size-control">
          Size
          <input
            type="range"
            min="1"
            max="30"
            value={brushSize}
            onChange={(event) => setBrushSize(event.target.value)}
            aria-label="Brush size"
          />
          <span>{brushSize}px</span>
        </label>
      </div>

      <div className="canvas-frame">
        <canvas
          ref={canvasRef}
          className="board-canvas"
          width={1600}
          height={900}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onLostPointerCapture={stopDrawing}
          aria-label="Shared drawing canvas"
        />
      </div>
    </section>
  );
  <button
  className="secondary-button"
  type="button"
  onClick={redoBoard}
  disabled={!connected}
>
  Redo
</button>
}