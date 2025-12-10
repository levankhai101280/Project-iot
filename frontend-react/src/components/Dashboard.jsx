// frontend-react/src/components/Dashboard.jsx
import React, { useState, useEffect } from "react";
import "./Dashboard.css";

export default function Dashboard({ role, socket }) {
  const [frame, setFrame] = useState("");
  const [counts, setCounts] = useState({ up: 0, down: 0 });
  const [plates, setPlates] = useState({});
  const [threshold, setThreshold] = useState(0.3);
  const [currentVehicles, setCurrentVehicles] = useState([]);

  useEffect(() => {
    socket.on("frame", (data) => {
        setFrame("data:image/jpeg;base64," + data.frame);
        setCounts(data.counts);
        setCurrentVehicles(data.current_vehicles || []);  // ← nhận danh sách realtime
        setPlates(data.plates);
    });
    return () => socket.off("frame");
    }, [socket]);

  const sendThreshold = () => {
    socket.emit("update_conf_threshold", { threshold });
  };

  const resetCounter = () => {
    socket.emit("reset_counter");
  };

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/login";
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="user-info">
          Đã đăng nhập: <strong>{localStorage.getItem("username") || "Guest"}</strong>
        </div>
        <button className="logout-btn" onClick={handleLogout}>
          Đăng xuất
        </button>
      </div>

      {/* Title */}
      <h1 className="title">HỆ THỐNG NHẬN DIỆN BIỂN SỐ THÔNG MINH</h1>
      <div style={{ textAlign: "center" }}>
        <span className="role-badge">{role.toUpperCase()}</span>
      </div>

      {/* Video Stream */}
      <div className="video-container">
        {frame ? (
          <img src={frame} alt="Camera stream" className="video-stream" />
        ) : (
          <div style={{ color: "#888", fontSize: 24, padding: "60px" }}>
            Đang kết nối camera...
          </div>
        )}
      </div>
      {/* Admin Controls */}
      {role === "admin" && (
        <div className="admin-controls">
          <h3>Điều chỉnh độ tin cậy nhận diện</h3>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="threshold-slider"
          />
          <div style={{ margin: "15px 0", fontSize: 18, fontWeight: "bold" }}>
            Ngưỡng hiện tại: {threshold.toFixed(2)}
          </div>
          <button
            onClick={sendThreshold}
            style={{
              padding: "12px 30px",
              background: "#00bcd4",
              color: "white",
              border: "none",
              borderRadius: "50px",
              fontWeight: "bold",
              cursor: "pointer",
              marginRight: "15px"
            }}
          >
            Áp dụng ngưỡng
          </button>
          <button onClick={resetCounter} className="reset-btn">
            Reset bộ đếm
          </button>

          <button
            className="history-btn"
            onClick={() => window.open("/history", "_blank")}
          >
            XEM LỊCH SỬ + ẢNH CHỨNG CỨ (ADMIN)
          </button>
        </div>
      )}

      {/* Latest Plates */}
      <div className="plate-list">
        <h3>XE ĐANG TRONG KHUNG HÌNH ({currentVehicles.length})</h3>
        {currentVehicles.length === 0 ? (
            <p style={{ textAlign: "center", color: "#888" }}>Không có xe nào</p>
        ) : (
            currentVehicles.map(v => (
            <div key={v.id} className="plate-item">
                <span>Xe ID {v.id} • {v.type}</span>
                <strong style={{ 
                color: v.plate.includes("Đang") ? "#ff9800" : "#00e5ff",
                fontSize: "22px"
                }}>
                {v.plate}
                </strong>
            </div>
            ))
        )}
        </div>
    </div>
  );
}