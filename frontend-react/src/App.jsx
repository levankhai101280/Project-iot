import React, { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("http://localhost:5000");

export default function App() {
  const [frame, setFrame] = useState(null);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    socket.on("frame", (data) => {
      setFrame("data:image/jpeg;base64," + data.frame);
      setCounts(data.counts);
    });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Vehicle Detection</h1>

      {frame ? (
        <img src={frame} alt="stream" style={{ width: "640px" }} />
      ) : (
        <p>Waiting for stream...</p>
      )}

      <h2>Counts</h2>
      <ul>
        {Object.entries(counts).map(([k, v]) => (
          <li key={k}>{k}: {v}</li>
        ))}
      </ul>
    </div>
  );
}
